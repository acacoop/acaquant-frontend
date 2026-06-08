"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

/**
 * Versión compacta de RETORNO TOTAL para la HOME (cuadrante izq-abajo).
 * Solo el chart, con look TradingView real (lightweight-charts).
 * Tabs por curva (Tasa Fija / CER / Hard Dólar) + ventanas 7D / 14D / MTD.
 *
 * Reusa el endpoint y la lógica de cálculo de retorno total de la vista
 * ESTRATEGIAS (retorno-total-view.tsx): precio + cupones/amortizaciones
 * cobrados en el período, con alineación de flujos al desplome de precio
 * (el bono cotiza "ex" antes de la fecha de pago). El retorno mini se muestra
 * en moneda nativa de la curva (ARS para tasa_fija/cer, USD para soberanos);
 * la dolarización ARS→USD vive solo en la vista completa.
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

function fmtCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Ventana → fecha desde, dada la última fecha disponible.
function desdeForVentana(v: Ventana, last: string): string {
  if (v === "7D") return addDays(last, -7);
  if (v === "14D") return addDays(last, -14);
  return last.slice(0, 8) + "01"; // MTD: primer día del mes
}

export function RetornoTotalMini() {
  const [curva, setCurva] = useState<Curva>("tasa_fija");
  const [ventana, setVentana] = useState<Ventana>("14D");
  const [byCurva, setByCurva] = useState<Record<string, RetornoData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    // Base por ticker = precio as-of fechaDesde (o primera fecha dentro de la
    // ventana si recién empieza a cotizar).
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

  // ── Chart (lightweight-charts) ────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || tickers.length === 0) return;

    const txt = isLight ? "#5a6678" : "#8a8a8a";
    const grid = isLight ? "#e8edf4" : "#161616";
    const border = isLight ? "#aab6c9" : "#2a2a2a";
    const bg = isLight ? "#ffffff" : "#080808";

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: txt,
        fontSize: 10,
        fontFamily: "JetBrains Mono, monospace",
        attributionLogo: false,
      },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border, timeVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { priceFormatter: (v: number) => `${v.toFixed(1)}%` },
    });
    chartRef.current = chart;

    const serieByTk: Array<{ tk: string; color: string; api: ISeriesApi<"Line"> }> = [];
    tickers.forEach((tk, i) => {
      const color = PALETA[i % PALETA.length];
      const api = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 3,
      });
      api.setData(data[tk]);
      serieByTk.push({ tk, color, api });
    });
    chart.timeScale().fitContent();

    // Legend estilo TradingView: por defecto último valor; en hover el del
    // crosshair. Se construye con nodos DOM (no innerHTML) para evitar cualquier
    // riesgo de inyección, aunque los tickers vengan de nuestro propio backend.
    const renderLegend = (valores: Record<string, number | undefined>, fecha?: string) => {
      const leg = legendRef.current;
      if (!leg) return;
      leg.replaceChildren();
      if (fecha) {
        const h = document.createElement("span");
        h.style.color = txt;
        h.textContent = fmtCorta(fecha);
        leg.appendChild(h);
      }
      for (const { tk, color } of serieByTk) {
        const v = valores[tk];
        const val = v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
        const span = document.createElement("span");
        span.style.color = color;
        span.style.marginLeft = "8px";
        span.textContent = `${tk} `;
        const b = document.createElement("b");
        b.textContent = val;
        span.appendChild(b);
        leg.appendChild(span);
      }
    };
    const ultimos: Record<string, number | undefined> = {};
    for (const { tk } of serieByTk) ultimos[tk] = data[tk]?.at(-1)?.value;
    renderLegend(ultimos);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time) {
        renderLegend(ultimos);
        return;
      }
      const vals: Record<string, number | undefined> = {};
      for (const { tk, api } of serieByTk) {
        const p = param.seriesData.get(api) as { value?: number } | undefined;
        vals[tk] = p?.value;
      }
      renderLegend(vals, String(param.time));
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [data, tickers, isLight]);

  const hayDatos = tickers.length > 0;

  return (
    <div className="h-full flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
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

      {/* Legend */}
      <div
        ref={legendRef}
        className="px-3 pt-1 text-[10px] font-mono leading-tight shrink-0 truncate"
      />

      {/* Chart / estados */}
      <div className="flex-1 min-h-0 relative">
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
