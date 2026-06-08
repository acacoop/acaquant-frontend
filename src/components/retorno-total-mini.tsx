"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

/**
 * Versión compacta de RETORNO TOTAL para la HOME (cuadrante izq-abajo).
 * Chart con look TradingView real (lightweight-charts), eje Y a la izquierda,
 * + lista interactiva de retornos al costado que sirve de leyenda Y de selector
 * (tildás/destildás bonos para limpiar el chart).
 *
 * Tabs por curva (Tasa Fija / CER / Hard Dólar) + ventanas 7D / 14D / MTD.
 * Reusa la lógica de cálculo de la vista ESTRATEGIAS completa: precio +
 * cupones/amortizaciones cobrados, con flujos alineados al desplome de precio
 * (el bono cotiza "ex" antes de la fecha de pago). Retorno en moneda nativa de
 * la curva (ARS para tasa_fija/cer, USD para soberanos).
 */

interface HistRow {
  fecha: string;
  ticker: string;
  price: number | null;
}

interface RetornoData {
  curva: string;
  rows: HistRow[];
  flujos: Record<string, Array<{ fecha: string; monto: number }>>;
}

type Curva = "tasa_fija" | "cer" | "soberanos";
type Ventana = "7D" | "14D" | "MTD";

const POLL_MS = 300_000; // 5 min — toma precios del día

// lightweight-charts no acepta var(--…) → colores concretos.
const PALETA = [
  "#ff9900", "#4a9eff", "#00cc66", "#ff3333", "#bb66ff",
  "#00cccc", "#ffee44", "#ff66aa", "#aaff00", "#ff6600",
];

function addDays(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Ventana → fecha desde, dada la última fecha disponible.
function desdeForVentana(v: Ventana, last: string): string {
  if (v === "7D") return addDays(last, -7);
  if (v === "14D") return addDays(last, -14);
  return last.slice(0, 8) + "01"; // MTD: primer día del mes
}

export function RetornoTotalMini() {
  const [curva, setCurvaState] = useState<Curva>("tasa_fija");
  const [ventana, setVentana] = useState<Ventana>("MTD");
  const [byCurva, setByCurva] = useState<Record<string, RetornoData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bonos destildados en la lista → se ocultan del chart (no se borran).
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const setCurva = (c: Curva) => {
    setCurvaState(c);
    setHidden(new Set()); // cada curva tiene sus propios bonos
  };

  // Tema (claro/oscuro): misma señal que el resto de la app (clase "light" en <html>).
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setIsLight(el.classList.contains("light"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/analitica/retorno-total?curva=${encodeURIComponent(curva)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: RetornoData = await res.json();
        if (cancelled) return;
        setByCurva((prev) => ({ ...prev, [curva]: j }));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [curva]);

  const curr = byCurva[curva];
  const rows = useMemo<HistRow[]>(() => curr?.rows || [], [curr]);
  const flujos = useMemo<RetornoData["flujos"]>(() => curr?.flujos || {}, [curr]);

  const fechas = useMemo(
    () => Array.from(new Set(rows.map((r) => r.fecha))).sort(),
    [rows],
  );
  const ultima = fechas.length ? fechas[fechas.length - 1] : "";
  const fechaDesde = ultima ? desdeForVentana(ventana, ultima) : "";
  const fechaHasta = ultima;

  // Serie de retorno total % por ticker en la ventana. Mismo cálculo que la
  // vista completa: base = precio as-of fechaDesde, retorno = (precio + Σflujos
  // cobrados) / base − 1. Flujos alineados al mayor desplome de precio cercano.
  const { tickers, data } = useMemo(() => {
    const vacio = { tickers: [] as string[], data: {} as Record<string, Array<{ time: Time; value: number }>> };
    if (!rows.length || !fechaDesde || !fechaHasta) return vacio;

    const serieByTicker: Record<string, Array<{ fecha: string; price: number }>> = {};
    for (const r of rows) {
      if (r.price == null) continue;
      (serieByTicker[r.ticker] ??= []).push({ fecha: r.fecha, price: r.price });
    }
    for (const tk in serieByTicker) {
      serieByTicker[tk].sort((a, b) => a.fecha.localeCompare(b.fecha));
    }

    // Alinear cada flujo a la fecha del mayor desplome de precio en su ventana,
    // solo si ese desplome es comparable al monto (evita pegar cupones chicos a
    // movimientos de mercado). Idéntico a la vista completa.
    const flujosAlin: Record<string, Array<{ fecha: string; monto: number }>> = {};
    for (const tk in flujos) {
      const serie = serieByTicker[tk] || [];
      flujosAlin[tk] = (flujos[tk] || []).map((fl) => {
        const lo = addDays(fl.fecha, -25);
        const hi = addDays(fl.fecha, 7);
        let mejorFecha = fl.fecha;
        let mejorCaida = 0;
        for (let i = 1; i < serie.length; i++) {
          const d = serie[i].fecha;
          if (d < lo || d > hi) continue;
          const caida = serie[i - 1].price - serie[i].price;
          if (caida > mejorCaida) {
            mejorCaida = caida;
            mejorFecha = d;
          }
        }
        return { fecha: mejorCaida >= fl.monto * 0.5 ? mejorFecha : fl.fecha, monto: fl.monto };
      });
    }

    const sumaFlujos = (tk: string, desdeF: string, hastaF: string): number => {
      let s = 0;
      for (const fl of flujosAlin[tk] || []) {
        if (fl.fecha > desdeF && fl.fecha <= hastaF) s += fl.monto;
      }
      return s;
    };

    const out: Record<string, Array<{ time: Time; value: number }>> = {};
    const tickersConDatos: string[] = [];
    for (const tk of Object.keys(serieByTicker).sort()) {
      const serie = serieByTicker[tk];
      let base: { fecha: string; price: number } | null = null;
      for (const pt of serie) {
        if (pt.fecha <= fechaDesde) base = pt;
        else break;
      }
      if (!base) base = serie.find((pt) => pt.fecha >= fechaDesde && pt.fecha <= fechaHasta) || null;
      if (!base || base.price <= 0) continue;

      const pts: Array<{ time: Time; value: number }> = [];
      for (const pt of serie) {
        if (pt.fecha < base.fecha || pt.fecha < fechaDesde || pt.fecha > fechaHasta) continue;
        const tot = pt.price + sumaFlujos(tk, base.fecha, pt.fecha);
        pts.push({ time: pt.fecha as Time, value: +((tot / base.price - 1) * 100).toFixed(3) });
      }
      if (pts.length >= 2) {
        out[tk] = pts;
        tickersConDatos.push(tk);
      }
    }
    return { tickers: tickersConDatos, data: out };
  }, [rows, flujos, fechaDesde, fechaHasta]);

  // Color estable por ticker (orden alfabético de `tickers`).
  const colorOf = useMemo(() => {
    const m: Record<string, string> = {};
    tickers.forEach((tk, i) => (m[tk] = PALETA[i % PALETA.length]));
    return m;
  }, [tickers]);

  // Lista de retornos del período (último valor de cada serie), ordenada desc.
  const resumen = useMemo(
    () =>
      tickers
        .map((tk) => ({ tk, ret: data[tk]?.at(-1)?.value ?? null, color: colorOf[tk] }))
        .sort((a, b) => (b.ret ?? -1e9) - (a.ret ?? -1e9)),
    [tickers, data, colorOf],
  );

  // ── Chart (lightweight-charts) ────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMap = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const hiddenRef = useRef(hidden);
  useEffect(() => {
    hiddenRef.current = hidden;
  }, [hidden]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || tickers.length === 0) return;

    const txt = isLight ? "#5a6678" : "#8a8a8a";
    const grid = isLight ? "#eef2f7" : "#141414";
    const border = isLight ? "#aab6c9" : "#2a2a2a";
    const bg = isLight ? "#ffffff" : "#080808";
    const zero = isLight ? "#94a3b8" : "#3a3a3a";

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: txt,
        fontSize: 10,
        fontFamily: "JetBrains Mono, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: grid, style: LineStyle.Dotted },
        horzLines: { color: grid, style: LineStyle.Dotted },
      },
      // Eje Y a la IZQUIERDA.
      leftPriceScale: {
        visible: true,
        borderColor: border,
        // Márgenes chicos → el rango usa más alto → más etiquetas en el eje Y.
        scaleMargins: { top: 0.04, bottom: 0.04 },
        // Fuerza las etiquetas de los extremos (máx/mín) → 2 ticks más, eje más denso.
        ensureEdgeTickMarksVisible: true,
      },
      rightPriceScale: { visible: false },
      timeScale: {
        borderColor: border,
        timeVisible: false,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        rightOffset: 4,
        barSpacing: 8,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: border, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#ff9900" },
        horzLine: { color: border, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#ff9900" },
      },
      localization: { priceFormatter: (v: number) => `${v.toFixed(2)}%` },
    });
    chartRef.current = chart;
    seriesMap.current = new Map();

    let zeroLineHost: ISeriesApi<"Line"> | null = null;
    let zeroLine: IPriceLine | null = null;
    tickers.forEach((tk) => {
      const api = chart.addSeries(LineSeries, {
        priceScaleId: "left",
        color: colorOf[tk],
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        visible: !hiddenRef.current.has(tk),
      });
      api.setData(data[tk]);
      seriesMap.current.set(tk, api);
      if (!zeroLineHost) zeroLineHost = api;
    });

    // Línea de referencia en 0% (estilo TradingView, contra qué se lee el retorno).
    if (zeroLineHost) {
      zeroLine = (zeroLineHost as ISeriesApi<"Line">).createPriceLine({
        price: 0,
        color: zero,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
      });
    }

    chart.timeScale().fitContent();

    return () => {
      if (zeroLine && zeroLineHost) (zeroLineHost as ISeriesApi<"Line">).removePriceLine(zeroLine);
      chart.remove();
      chartRef.current = null;
      seriesMap.current = new Map();
    };
  }, [data, tickers, isLight, colorOf]);

  // Toggle de visibilidad sin recrear el chart.
  useEffect(() => {
    for (const [tk, api] of seriesMap.current) {
      api.applyOptions({ visible: !hidden.has(tk) });
    }
  }, [hidden]);

  const toggle = (tk: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(tk)) next.delete(tk);
      else next.add(tk);
      return next;
    });

  const hayDatos = tickers.length > 0;

  return (
    <div className="h-full flex flex-col min-h-0 min-w-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
      {/* Header: título + tabs de curva + ventanas */}
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
          Retorno Total
        </span>
        <div className="flex items-center gap-1">
          <Pill active={curva === "tasa_fija"} onClick={() => setCurva("tasa_fija")}>TASA FIJA</Pill>
          <Pill active={curva === "cer"} onClick={() => setCurva("cer")}>CER</Pill>
          <Pill active={curva === "soberanos"} onClick={() => setCurva("soberanos")}>HARD DÓLAR</Pill>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <Pill active={ventana === "7D"} onClick={() => setVentana("7D")}>7D</Pill>
          <Pill active={ventana === "14D"} onClick={() => setVentana("14D")}>14D</Pill>
          <Pill active={ventana === "MTD"} onClick={() => setVentana("MTD")}>MTD</Pill>
        </div>
      </div>

      {/* Cuerpo: chart (eje Y izq) + lista interactiva de retornos */}
      <div className="flex-1 min-h-0 min-w-0 flex">
        <div className="flex-1 min-h-0 min-w-0 relative overflow-hidden">
          {loading && !curr ? (
            <Centro>cargando…</Centro>
          ) : error ? (
            <Centro tono="neg">error: {error}</Centro>
          ) : !hayDatos ? (
            <Centro>sin datos suficientes en la ventana</Centro>
          ) : (
            <div ref={containerRef} className="absolute inset-0" />
          )}
        </div>

        {/* Lista de retornos = leyenda + selector (tildar/destildar) */}
        {hayDatos && (
          <div className="w-[124px] shrink-0 border-l border-[var(--t-border)] overflow-y-auto">
            <div className="px-1.5 py-1 text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
              {ventana} · {resumen.length}
            </div>
            {resumen.map(({ tk, ret, color }) => {
              const off = hidden.has(tk);
              return (
                <button
                  key={tk}
                  onClick={() => toggle(tk)}
                  title={off ? "Mostrar en el chart" : "Ocultar del chart"}
                  className={`w-full flex items-center gap-1.5 px-1.5 py-0.5 text-[10px] font-mono font-bold hover:bg-[var(--t-accent)]/10 ${
                    off ? "opacity-40" : ""
                  }`}
                >
                  <span
                    className="w-2 h-2 shrink-0 rounded-[1px] border"
                    style={{ background: off ? "transparent" : color, borderColor: color }}
                  />
                  <span className="text-[var(--t-text)] truncate flex-1 text-left font-bold">{tk}</span>
                  <span
                    className={
                      ret == null
                        ? "text-[var(--t-text-muted)]"
                        : ret >= 0
                          ? "text-[var(--t-pos)]"
                          : "text-[var(--t-neg)]"
                    }
                  >
                    {ret == null ? "—" : `${ret >= 0 ? "+" : ""}${ret.toFixed(1)}%`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}

function Centro({ children, tono }: { children: React.ReactNode; tono?: "neg" }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className={`text-[11px] ${tono === "neg" ? "text-[var(--t-neg)]" : "text-[var(--t-text-muted)]"}`}>
        {children}
      </span>
    </div>
  );
}
