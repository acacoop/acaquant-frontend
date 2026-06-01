"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DownloadButton } from "@/components/download-button";
import { exportToXlsx, timestampSuffix } from "@/lib/xlsx-export";

// ── Types ─────────────────────────────────────────────────────────────────

interface SeriePoint {
  fecha: string;
  valuacion: number;
  n: number;
}

interface SerieResp {
  id_cuenta: string;
  serie: SeriePoint[];
  ultimo: SeriePoint | null;
  primero: SeriePoint | null;
}

interface MensualRow {
  mes: string;             // "YYYY-MM"
  ultimo_dia: string;      // "YYYY-MM-DD"
  valuacion_cierre: number;
  depositos: number;
  extracciones: number;
  flujo_neto: number;
  delta_bruto: number | null;
  delta_real: number | null;
  tea_mensual: number | null;   // TEA anualizada via XIRR, decimal
  tem_periodo: number | null;   // TEM des-anualizada al período del mes
  twr_base100: number;          // base 100 acumulada (Π(1+TEM))
  // USD parallels — backend convierte con MEP por fecha (XIRR nativo USD)
  mep_cierre: number | null;
  valuacion_cierre_usd: number;
  depositos_usd: number;
  extracciones_usd: number;
  flujo_neto_usd: number;
  delta_bruto_usd: number | null;
  delta_real_usd: number | null;
  tea_mensual_usd: number | null;
  tem_periodo_usd: number | null;
  twr_base100_usd: number;
  n_posiciones: number;
}

interface MensualResp {
  id_cuenta: string;
  meses: MensualRow[];
  n_meses: number;
}

interface Posicion {
  unidad?: string;
  ticker: string;
  emisor?: string;
  clase_activo?: string;
  calificacion?: string;
  vencimiento?: string | null;
  tipo: string | null;
  cartera: string;
  cantidad: number;
  precio: number;
  valuacion: number;
  share: number | null;
}

// Mismo mapeo que aum-view.tsx — paleta consistente entre vistas.
// Keyed por nombre sin prefijo 'CARTERA ' — tolera datos viejos (con prefijo)
// y nuevos (renombrados) porque carteraColor normaliza con carteraShort.
const CARTERA_COLORS: Record<string, string> = {
  "ARS": "#4a9eff",
  "DL":  "var(--t-pos)",
  "HD":  "#ff9900",
  "FCI": "#bb66ff",
};

function carteraColor(c: string): string {
  return CARTERA_COLORS[carteraShort(c)] ?? "#666";
}

function carteraShort(c: string): string {
  if (!c) return "—";
  return c.replace("CARTERA ", "");
}

// ── Operar desde una posición (deep-link a Trading) ─────────────────────────
// Click derecho en la fila → "OPERAR" → /operar con cuenta + asset cargados.
// No se opera cash (MONEDA). FCI va a la tab FCI con el buscador prefilleado.
function _posOperable(p: Posicion): { operable: boolean; isFci: boolean } {
  const clase = (p.clase_activo || "").toUpperCase();
  const cart = (p.cartera || "").toUpperCase();
  const isFci = clase === "FCI" || cart.includes("FCI");
  const isCash = clase === "MONEDA" || clase === "MONEDAS";
  return { operable: !isCash, isFci };
}

// "[1114] CAFCI684-1114 - FCI Balanz Capital Ahorro - Clase A" → "Balanz Capital Ahorro - Clase A"
function _fciSearchSeed(p: Posicion): string {
  let s = p.ticker || "";
  s = s.replace(/^\s*\[[^\]]*\]\s*/, "");        // "[1114] "
  s = s.replace(/^\s*CAFCI[\w-]*\s*-\s*/i, "");  // "CAFCI684-1114 - "
  s = s.replace(/^\s*FCI\s+/i, "");              // "FCI " inicial
  return s.trim() || p.emisor || "";
}

function _operarHref(p: Posicion, idCuenta: string): string {
  const { isFci } = _posOperable(p);
  const acc = encodeURIComponent(idCuenta);
  if (isFci) {
    return `/operar?tab=fci&account=${acc}&fci=${encodeURIComponent(_fciSearchSeed(p))}`;
  }
  return `/operar?account=${acc}&ticker=${encodeURIComponent(p.ticker)}`;
}

interface PosicionesResp {
  id_cuenta: string;
  fecha: string | null;
  posiciones: Posicion[];
  total: number;
  n: number;
}

interface Movimiento {
  fecha: string;
  comprobante: string | null;
  categoria: string;
  importe: number;       // En la moneda original (USD, ARS, etc).
  importe_ars: number;   // Convertido a ARS al MEP de la fecha.
  mep_rate: number | null;  // El MEP usado para la conversión, null si moneda=ARS.
  moneda: string | null;
  op: string | null;
  ticker: string | null;
  informacion: string | null;
  cuenta: string | null;
}

interface MovimientosResp {
  id_cuenta: string;
  mes: string;
  movimientos: Movimiento[];
  n: number;
  total_depositos: number;
  total_extracciones: number;
  total_neto: number;
}

// Descomposición de la variación del portfolio vs el mes anterior.
interface VariacionFila {
  unidad: string;
  tipo: string | null;
  val_anterior: number;
  val_actual: number;
  delta_mercado: number;   // (precio_act − precio_prev) × cantidad_prev
  delta_operado: number;   // (cantidad_act − cantidad_prev) × precio_act
  delta_total: number;
  estado: "ambos" | "nuevo" | "cerrado";
}
interface VariacionAgg {
  delta_mercado: number;
  delta_operado: number;
  delta_total: number;
  val_anterior: number;
  val_actual: number;
  n?: number;
}
interface VariacionResp {
  id_cuenta: string;
  fecha: string;
  fecha_anterior: string | null;
  filas: VariacionFila[];
  otros: VariacionAgg | null;
  totales: VariacionAgg | null;
  error?: string;
}

interface Props { idCuenta: string; nombreCuenta?: string }

// ── Helpers ───────────────────────────────────────────────────────────────

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return sign + "$" + (abs / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return sign + "$" + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(1) + "K";
  return sign + "$" + abs.toFixed(0);
}

function fmtSigned(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return (n >= 0 ? "+" : "") + fmtCompact(n);
}

function fmtFechaCorta(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y.slice(-2)}`;
}

function fmtMesCorto(s: string): string {
  // "YYYY-MM" o "YYYY-MM-DD" → "Abr 26"
  const [y, m] = s.split("-").map(Number);
  return `${MESES[m - 1]} ${String(y).slice(-2)}`;
}

function fmtMesAnio(s: string): string {
  const [y, m] = s.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

function fmtQty(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

// Escala "nice" para Y-axis: no forzar 0, redondear a valores limpios
// alrededor del rango real. Mismo helper que aum-view.tsx.
function niceScale(
  min: number,
  max: number,
  maxTicks = 5,
): { min: number; max: number; ticks: number[] } {
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) {
    const d = Math.abs(min) || 1;
    return { min: min - d, max: max + d, ticks: [min - d, min, min + d] };
  }
  const range = max - min;
  const roughStep = range / Math.max(1, maxTicks - 1);
  const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / pow10;
  const niceStep =
    normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  const step = niceStep * pow10;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step / 2; t += step)
    ticks.push(+t.toFixed(10));
  return { min: niceMin, max: niceMax, ticks };
}

// Calcula rango del Y-axis con dos objetivos:
//  1) ZOOM IN: el último/menor valor real NO debe quedar pegado al eje X.
//     Padding 15% abajo + 15% arriba sobre el rango "core" para que la
//     línea ocupe el centro del chart, no el borde.
//  2) Outliers (mes con data sucia, ej. cuenta cerrada que cayó a 0 o
//     un spike a $2.5T por bug del job) NO contaminan el rango — usamos
//     percentiles P10/P90 cuando se detectan outliers (>5× o <0.2× mediana).
//     El punto outlier sigue en la serie pero queda fuera del chart con
//     allowDataOverflow — señal visual de que esa fecha está rota.
function computeYRange(vals: number[]): { min: number; max: number; ticks: number[] } {
  if (vals.length === 0) return { min: 0, max: 1, ticks: [0, 1] };
  if (vals.length === 1) {
    const v = vals[0];
    const pad = (Math.abs(v) || 1) * 0.15;
    return niceScale(v - pad, v + pad, 5);
  }
  const sorted = [...vals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  let coreMin = sorted[0];
  let coreMax = sorted[sorted.length - 1];
  if (median > 0) {
    if (coreMax > 5 * median) {
      coreMax = sorted[Math.floor(sorted.length * 0.9)] || median * 2;
    }
    if (coreMin < 0.2 * median) {
      coreMin = sorted[Math.floor(sorted.length * 0.1)] || median * 0.5;
    }
  }
  // Padding 15% sobre el rango core. Si todo el rango es trivialmente chico
  // (variación <1%), usamos 15% del valor absoluto como piso de padding.
  const range = coreMax - coreMin;
  const pad = Math.max(range * 0.15, Math.abs(coreMax) * 0.05);
  return niceScale(coreMin - pad, coreMax + pad, 5);
}

// ── Componente ────────────────────────────────────────────────────────────

export function ValuacionesView({ idCuenta, nombreCuenta }: Props) {
  const router = useRouter();
  // Menú contextual (click derecho) para operar una posición desde el portfolio.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pos: Posicion } | null>(null);
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  const [serieResp, setSerieResp] = useState<SerieResp | null>(null);
  const [mensualResp, setMensualResp] = useState<MensualResp | null>(null);
  const [posResp, setPosResp] = useState<PosicionesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Fecha seleccionada para el panel Posición Actual. null = última disponible.
  const [selectedFecha, setSelectedFecha] = useState<string | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  // Movimientos del mes — solo se fetcha cuando hay fecha seleccionada.
  const [movResp, setMovResp] = useState<MovimientosResp | null>(null);
  const [movLoading, setMovLoading] = useState(false);
  // Tab del panel PORTFOLIO (fila inferior, full width): posiciones o
  // variación vs mes anterior. La variación necesita una fecha seleccionada.
  // Los flujos del mes ya no viven acá — se despliegan inline en la tabla mensual.
  const [portfolioTab, setPortfolioTab] = useState<"posiciones" | "variacion">("posiciones");
  // Variación del portfolio vs el snapshot anterior — solo con fecha.
  const [varResp, setVarResp] = useState<VariacionResp | null>(null);
  const [varLoading, setVarLoading] = useState(false);
  // Ventana del chart de evolución mensual:
  // "6M" default — 6 meses para que outliers viejos no apaguen el rango Y.
  // "3M" / "1A" / "ALL" presets, ◀ ▶ para mover offset.
  const [chartRango, setChartRango] = useState<"3M" | "6M" | "1A" | "ALL">("6M");
  const [chartOffset, setChartOffset] = useState<number>(0);
  // Métrica del chart: un solo eje Y por vez (Valor $ o Rendimiento %). Meter
  // las dos juntas con doble eje hacía la escala ilegible.
  const [chartMetric, setChartMetric] = useState<"valor" | "rendimiento">("valor");
  // Moneda de visualización: ARS (default) o USD. Backend devuelve campos
  // paralelos `*_usd` con MEP por fecha aplicado al cashflow XIRR — toggle
  // solo cambia qué columna se muestra.
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");
  const esUSD = moneda === "USD";

  // Initial load: serie + mensual son one-shot, posiciones se refetcha al
  // cambiar selectedFecha (handler separado).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const base = `/api/valuaciones/${encodeURIComponent(idCuenta)}`;
        const [s, m] = await Promise.all([
          fetch(`${base}/serie`, { cache: "no-store" }).then((r) => {
            if (!r.ok) throw new Error(`serie HTTP ${r.status}`);
            return r.json() as Promise<SerieResp>;
          }),
          fetch(`${base}/mensual`, { cache: "no-store" }).then((r) => {
            if (!r.ok) throw new Error(`mensual HTTP ${r.status}`);
            return r.json() as Promise<MensualResp>;
          }),
        ]);
        if (cancelled) return;
        setSerieResp(s);
        setMensualResp(m);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [idCuenta]);

  // Posiciones — refetcha cuando cambia idCuenta o selectedFecha.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPosLoading(true);
      try {
        const base = `/api/valuaciones/${encodeURIComponent(idCuenta)}`;
        const url = selectedFecha
          ? `${base}/posiciones-actuales?fecha=${selectedFecha}`
          : `${base}/posiciones-actuales`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`pos HTTP ${r.status}`);
        const j: PosicionesResp = await r.json();
        if (!cancelled) setPosResp(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setPosLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [idCuenta, selectedFecha]);

  // Movimientos — solo cuando hay fecha seleccionada (panel oculto sino).
  useEffect(() => {
    if (!selectedFecha) {
      setMovResp(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setMovLoading(true);
      try {
        const url = `/api/valuaciones/${encodeURIComponent(idCuenta)}/movimientos?fecha=${selectedFecha}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`mov HTTP ${r.status}`);
        const j: MovimientosResp = await r.json();
        if (!cancelled) setMovResp(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setMovLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [idCuenta, selectedFecha]);

  // Variación vs mes anterior — solo cuando hay fecha seleccionada.
  useEffect(() => {
    if (!selectedFecha) {
      setVarResp(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setVarLoading(true);
      try {
        const url = `/api/valuaciones/${encodeURIComponent(idCuenta)}/variacion?fecha=${selectedFecha}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`var HTTP ${r.status}`);
        const j: VariacionResp = await r.json();
        if (!cancelled) setVarResp(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setVarLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [idCuenta, selectedFecha]);

  // Datos del chart: mensual (ascendente). El último mes se actualiza con el
  // ultimo fecha_snapshot disponible (ya está en valuacion_cierre del último
  // doc del mes — backend hace $last). El user quiere ver el valor "live" del
  // mes actual, lo cual ya está cubierto.
  type ChartPoint = { mes: string; valuacion: number; rendimiento: number; ultimo: string };
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!mensualResp) return [];
    // El backend devuelve descendente; reversa para chart cronológico.
    return mensualResp.meses
      .slice()
      .reverse()
      .map((r) => ({
        mes:          r.mes,
        valuacion:    esUSD ? r.valuacion_cierre_usd : r.valuacion_cierre,
        rendimiento:  esUSD ? r.twr_base100_usd : r.twr_base100,
        ultimo:       r.ultimo_dia,
      }));
  }, [mensualResp, esUSD]);

  // Slice de chart: aplicamos rango (3M / 6M / 1A / ALL) con pan offset.
  // offset=0 = ventana más reciente; offset=1 = anterior; etc.
  const chartDataVisible = useMemo<ChartPoint[]>(() => {
    if (chartRango === "ALL" || chartData.length === 0) return chartData;
    const n = chartRango === "3M" ? 3 : chartRango === "6M" ? 6 : 12;
    const end = chartData.length - chartOffset * n;
    const start = Math.max(0, end - n);
    return chartData.slice(Math.max(0, start), Math.max(0, end));
  }, [chartData, chartRango, chartOffset]);

  // Pan navigation flags.
  const chartPuedeAtras = chartRango !== "ALL" && (() => {
    const n = chartRango === "3M" ? 3 : chartRango === "6M" ? 6 : 12;
    return chartData.length - (chartOffset + 1) * n > 0;
  })();
  const chartPuedeAdelante = chartOffset > 0;

  // Y-axis: zoom-in con padding (15% arriba/abajo) y robustez a outliers.
  // Ver computeYRange — el último valor nunca queda pegado al eje X y un
  // mes con data sucia (Jul 25 a $2.5T) se sale del chart sin aplastar el
  // resto contra el piso.
  const yScale = useMemo(
    () => computeYRange(chartDataVisible.map((d) => d.valuacion)),
    [chartDataVisible],
  );
  const yScaleRend = useMemo(
    () => computeYRange(chartDataVisible.map((d) => d.rendimiento)),
    [chartDataVisible],
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">
        Cargando valuaciones…
      </div>
    );
  }
  // Solo pantalla de error completa si NO cargó la data primaria (mensual).
  // Un fallo de un panel secundario (movimientos/variación) no debe tapar la
  // vista entera con datos válidos ya cargados.
  if (error && !mensualResp) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-neg)] text-sm p-4">
        Error: {error}
      </div>
    );
  }

  const meses = mensualResp?.meses ?? [];
  // tea_mensual y twr_base100 vienen del backend (api/services/valuaciones.py).
  // PnL acumulado se calcula en cliente — suma simple de delta_real desde el
  // primer mes (cronológico) hasta cada mes. Se hace en ambas monedas y se
  // guarda en un map para lookup O(1) al renderizar la tabla descendente.
  const pnlAcumByMes: Record<string, { ars: number; usd: number }> = (() => {
    const out: Record<string, { ars: number; usd: number }> = {};
    let accArs = 0;
    let accUsd = 0;
    // meses viene descendente → iteramos de viejo a nuevo.
    for (let i = meses.length - 1; i >= 0; i--) {
      const m = meses[i];
      if (m.delta_real != null) accArs += m.delta_real;
      if (m.delta_real_usd != null) accUsd += m.delta_real_usd;
      out[m.mes] = { ars: accArs, usd: accUsd };
    }
    return out;
  })();
  const posiciones = posResp?.posiciones ?? [];
  const totalPos = posResp?.total ?? 0;
  const ultimoSnap = posResp?.fecha;

  if (chartData.length === 0 && meses.length === 0 && posiciones.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm p-6 text-center">
        Sin datos de valuación para cuenta [{idCuenta}].
        <br />
        <span className="text-[var(--t-text-muted)] text-xs">
          Asegurate que jobs/aum.py haya generado snapshots en Valuaciones.AuM.
        </span>
      </div>
    );
  }

  const colorDelta = (n: number | null | undefined) =>
    n == null ? "#888" : n >= 0 ? "var(--t-pos)" : "var(--t-neg)";

  return (
    <div className="h-full flex flex-col gap-3 p-3 overflow-hidden">

      {/* FILA SUPERIOR: gráfico (50%) + tabla mensual (50%), juntos */}
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">

        {/* Chart panel — izquierda (más ancho que la tabla mensual) */}
        <div className="w-[58%] border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden min-w-0 min-h-0">
          <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 gap-2">
            {/* Tabs VALOR / RENDIMIENTO — un solo eje Y por vez */}
            <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
              {([["valor", "VALOR"], ["rendimiento", "RENDIMIENTO"]] as const).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setChartMetric(k)}
                  className={
                    "px-2 py-0 text-[9px] font-semibold uppercase tracking-wider " +
                    (chartMetric === k
                      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                      : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                  }
                >{label}</button>
              ))}
            </div>
            {/* Range filter + pan */}
            <div className="ml-auto inline-flex items-center gap-1">
              <button
                onClick={() => setChartOffset((o) => o + 1)}
                disabled={!chartPuedeAtras}
                title="Período anterior"
                className="px-1 py-0 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
              >◀</button>
              <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                {(["3M", "6M", "1A", "ALL"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => { setChartRango(k); setChartOffset(0); }}
                    className={
                      "px-2 py-0 text-[9px] uppercase tracking-wider " +
                      (chartRango === k
                        ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                        : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                    }
                  >{k}</button>
                ))}
              </div>
              <button
                onClick={() => setChartOffset((o) => Math.max(0, o - 1))}
                disabled={!chartPuedeAdelante}
                title="Período siguiente"
                className="px-1 py-0 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
              >▶</button>
            </div>
            {chartData.length > 0 && (
              <span className="text-[10px] text-[var(--t-text-dim)] font-mono">
                Último:{" "}
                {chartMetric === "valor" ? (
                  <>
                    <span className="text-[#4a9eff] font-semibold">
                      {fmtCompact(chartData[chartData.length - 1].valuacion)}
                    </span>
                    <span className="text-[var(--t-text-muted)] ml-1">{esUSD ? "USD" : "ARS"}</span>
                  </>
                ) : (
                  <span className="text-[#ff9900] font-semibold">
                    {(() => {
                      const r = chartData[chartData.length - 1].rendimiento - 100;
                      return `${r >= 0 ? "+" : ""}${r.toFixed(2)}%`;
                    })()}
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 p-2 relative">
            {chartDataVisible.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">
                Sin meses con data en este rango.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartDataVisible}
                  margin={{ top: 12, right: 16, bottom: 4, left: 4 }}
                >
                  <CartesianGrid stroke="var(--t-border)" vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                    axisLine={{ stroke: "var(--t-border-2)" }}
                    tickLine={false}
                    tickFormatter={(v: string) => fmtMesCorto(v)}
                    minTickGap={24}
                    tickMargin={8}
                    height={26}
                    padding={{ left: 16, right: 16 }}
                  />
                  {chartMetric === "valor" ? (
                    <YAxis
                      domain={[yScale.min, yScale.max]}
                      ticks={yScale.ticks}
                      allowDataOverflow
                      tick={{ fill: "#4a9eff", fontSize: 10 }}
                      axisLine={{ stroke: "var(--t-border-2)" }}
                      tickLine={false}
                      tickFormatter={(v: number) => fmtCompact(v)}
                      width={56}
                    />
                  ) : (
                    <YAxis
                      domain={[yScaleRend.min, yScaleRend.max]}
                      ticks={yScaleRend.ticks}
                      allowDataOverflow
                      tick={{ fill: "#ff9900", fontSize: 10 }}
                      axisLine={{ stroke: "var(--t-border-2)" }}
                      tickLine={false}
                      tickFormatter={(v: number) => `${(v - 100) >= 0 ? "+" : ""}${(v - 100).toFixed(0)}%`}
                      width={48}
                    />
                  )}
                  <Tooltip
                    contentStyle={{
                      background: "var(--t-surface)",
                      border: "1px solid var(--t-border-2)",
                      fontSize: 11,
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                    labelStyle={{ color: "var(--t-text-dim)" }}
                    itemStyle={{ color: "var(--t-text)" }}
                    labelFormatter={(v) => fmtMesAnio(String(v))}
                    formatter={(value) => {
                      if (chartMetric === "rendimiento") {
                        const n = Number(value);
                        const pct = n - 100;
                        return [`${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`, "Rendimiento"];
                      }
                      return [fmtCompact(Number(value)), "Valor"];
                    }}
                  />
                  {chartMetric === "valor" ? (
                    <Line
                      type="monotone"
                      dataKey="valuacion"
                      name="Valor"
                      stroke="#4a9eff"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#4a9eff" }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  ) : (
                    <Line
                      type="monotone"
                      dataKey="rendimiento"
                      name="Rendimiento"
                      stroke="#ff9900"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#ff9900" }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tabla mensual compacta — derecha (con flujos inline al seleccionar un mes) */}
        <div className="w-[42%] border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden min-w-0 min-h-0">
          <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 gap-2">
            <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
              Mensual
            </span>
            {/* ARS/USD toggle — afecta chart + tabla mensual + label de valor */}
            <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
              {(["ARS", "USD"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMoneda(m)}
                  className={
                    "px-2 py-0 text-[9px] uppercase tracking-wider " +
                    (moneda === m
                      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                      : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                  }
                  title={
                    m === "USD"
                      ? "Dolarizar valores y XIRR usando MEP por fecha (cashflow USD nativo)"
                      : "Pesos argentinos (original)"
                  }
                >{m}</button>
              ))}
            </div>
            <span className="ml-auto text-[10px] text-[var(--t-text-dim)] font-mono">
              {meses.length} mes{meses.length !== 1 ? "es" : ""}
            </span>
            <DownloadButton
              className="ml-2"
              title="Descargar Excel (evolución mensual de la cuenta)"
              onClick={async () => {
                const cta = mensualResp?.id_cuenta ?? idCuenta ?? "cuenta";
                // tea/tem en backend = decimal (0.2682). xlsx "percent" espera × 100.
                const rowsExport = meses.map((m) => {
                  const b100 = esUSD ? m.twr_base100_usd : m.twr_base100;
                  const acum = pnlAcumByMes[m.mes];
                  return {
                    mes:        m.mes,
                    ultimo_dia: m.ultimo_dia,
                    cierre:     esUSD ? m.valuacion_cierre_usd : m.valuacion_cierre,
                    flujo_neto: esUSD ? m.flujo_neto_usd : m.flujo_neto,
                    delta_real: esUSD ? m.delta_real_usd : m.delta_real,
                    pnl_acum:   esUSD ? (acum?.usd ?? null) : (acum?.ars ?? null),
                    tem_pct:    (() => {
                      const v = esUSD ? m.tem_periodo_usd : m.tem_periodo;
                      return v != null ? v * 100 : null;
                    })(),
                    // TEA CARTERA = rendimiento acumulado del TWR (base100 - 100).
                    tea_cartera_pct: b100 - 100,
                  };
                });
                const titulo = nombreCuenta
                  ? `Cuenta: [${cta}] ${nombreCuenta} — ${moneda}`
                  : `Cuenta: [${cta}] — ${moneda}`;
                await exportToXlsx({
                  sheets: [
                    {
                      name: `Mensual ${moneda}`,
                      title: titulo,
                      rows: rowsExport,
                      columns: [
                        { header: "MES",        key: "mes",        format: "text",     width: 12 },
                        { header: "ÚLT. DÍA",   key: "ultimo_dia", format: "text",     width: 14 },
                        { header: `CIERRE ${moneda}`, key: "cierre", format: "currency", width: 18 },
                        { header: `FLUJO NETO ${moneda}`, key: "flujo_neto", format: "currency", width: 18 },
                        { header: `Δ VALOR ${moneda}`, key: "delta_real", format: "currency", width: 18 },
                        { header: `PNL ACUM ${moneda}`, key: "pnl_acum", format: "currency", width: 18 },
                        { header: "TEM MES",    key: "tem_pct",    format: "percent",  width: 12 },
                        { header: "TEA CARTERA",key: "tea_cartera_pct", format: "percent", width: 14 },
                      ],
                    },
                  ],
                  filename: `valuaciones-mensual-${cta}-${moneda}-${timestampSuffix()}.xlsx`,
                });
              }}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {meses.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">
                Sin datos mensuales.
              </div>
            ) : (
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[var(--t-surface-2)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                  <tr>
                    <th className="px-2 py-1 text-left border-b border-[var(--t-border)]">Mes</th>
                    <th
                      className="px-2 py-1 text-right border-b border-[var(--t-border)]"
                      title={esUSD ? "Cierre en USD (V_cierre_ARS / MEP_cierre)" : "Cierre en ARS"}
                    >Cierre</th>
                    <th
                      className="px-2 py-1 text-right border-b border-[var(--t-border)]"
                      title="Depósitos − extracciones del mes"
                    >Flujo neto</th>
                    <th
                      className="px-2 py-1 text-right border-b border-[var(--t-border)]"
                      title="Δ valor REAL = (cierre_t − cierre_t−1) − flujo_neto. Aísla performance de inversiones."
                    >Δ valor</th>
                    <th
                      className="px-2 py-1 text-right border-b border-[var(--t-border)]"
                      title="PnL acumulado — suma de Δ valor desde el primer mes. Sumatoria simple, no compone. Útil para ver ganancia/pérdida total en $."
                    >PnL acum.</th>
                    <th
                      className="px-2 py-1 text-right border-b border-[var(--t-border)]"
                      title="TEM del MES — Tasa Efectiva del período. TEA des-anualizada a los días reales del mes: (1 + TEA)^(días/365) − 1."
                    >TEM MES</th>
                    <th
                      className="px-2 py-1 text-right border-b border-[var(--t-border)]"
                      title="TEA Cartera — rendimiento acumulado del TWR puro desde el primer mes. (base100/100 − 1). Sin depender de aportes/retiros."
                    >TEA CARTERA</th>
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m) => {
                    const active = selectedFecha === m.ultimo_dia;
                    const cierre     = esUSD ? m.valuacion_cierre_usd : m.valuacion_cierre;
                    const flujo_neto = esUSD ? m.flujo_neto_usd        : m.flujo_neto;
                    const delta_real = esUSD ? m.delta_real_usd        : m.delta_real;
                    const base100    = esUSD ? m.twr_base100_usd       : m.twr_base100;
                    const tem        = esUSD ? m.tem_periodo_usd       : m.tem_periodo;
                    const tea        = esUSD ? m.tea_mensual_usd       : m.tea_mensual;
                    return (
                      <Fragment key={m.mes}>
                      <tr
                        onClick={() => setSelectedFecha(active ? null : m.ultimo_dia)}
                        className={
                          "cursor-pointer border-t border-[var(--t-border)] transition-colors " +
                          (active
                            ? "bg-[var(--t-accent)]/15"
                            : "hover:bg-[var(--t-surface-2)]")
                        }
                        title={
                          active
                            ? "Click de nuevo para volver al snapshot más reciente"
                            : `Ver posición al cierre de ${fmtMesAnio(m.mes)} (${m.ultimo_dia})` +
                              (esUSD && m.mep_cierre ? ` · MEP ${m.mep_cierre.toLocaleString("es-AR")}` : "")
                        }
                      >
                        <td className={
                          "px-2 py-1 font-semibold " +
                          (active ? "text-[var(--t-accent)]" : "text-[var(--t-accent)]")
                        }>
                          {active && "▶ "}{fmtMesCorto(m.mes)}
                        </td>
                        <td className="px-2 py-1 text-right text-[var(--t-text)] font-semibold">
                          {fmtCompact(cierre)}
                        </td>
                        <td
                          className="px-2 py-1 text-right"
                          style={{ color: flujo_neto !== 0 ? colorDelta(flujo_neto) : "#666" }}
                        >
                          {flujo_neto !== 0 ? fmtSigned(flujo_neto) : "—"}
                        </td>
                        <td
                          className="px-2 py-1 text-right font-semibold"
                          style={{ color: colorDelta(delta_real) }}
                        >
                          {delta_real != null ? fmtSigned(delta_real) : "—"}
                        </td>
                        <td
                          className="px-2 py-1 text-right font-semibold"
                          style={{ color: colorDelta(esUSD ? pnlAcumByMes[m.mes]?.usd : pnlAcumByMes[m.mes]?.ars) }}
                        >
                          {fmtSigned(esUSD ? pnlAcumByMes[m.mes]?.usd : pnlAcumByMes[m.mes]?.ars)}
                        </td>
                        <td
                          className="px-2 py-1 text-right"
                          style={{ color: tem != null ? colorDelta(tem) : "#666" }}
                        >
                          {tem != null
                            ? `${tem >= 0 ? "+" : ""}${(tem * 100).toFixed(2)}%`
                            : "—"}
                        </td>
                        <td
                          className="px-2 py-1 text-right font-semibold"
                          style={{ color: colorDelta(base100 - 100) }}
                        >
                          {`${base100 - 100 >= 0 ? "+" : ""}${(base100 - 100).toFixed(2)}%`}
                        </td>
                      </tr>
                      {/* Flujos del mes — se despliegan inline debajo del mes seleccionado */}
                      {active && (
                        <tr className="bg-[var(--t-panel)]">
                          <td colSpan={7} className="p-0 border-t border-[var(--t-border)]">
                            <div className="px-2 py-1.5">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-[9px] uppercase tracking-widest text-[var(--t-accent)]">Flujo del mes</span>
                                {movResp && <span className="text-[9px] text-[var(--t-text-muted)] font-mono">{fmtMesAnio(movResp.mes)}</span>}
                                {movLoading && <span className="text-[9px] text-[var(--t-text-dim)]">cargando…</span>}
                                {movResp && (
                                  <span className="ml-auto text-[9px] text-[var(--t-text-dim)] font-mono">
                                    {movResp.n} · <span className="text-[#4a9eff] font-semibold">neto {fmtSigned(movResp.total_neto)}</span>
                                  </span>
                                )}
                              </div>
                              <div className="max-h-[220px] overflow-auto border border-[var(--t-border)]">
                                <FlujoTabla movResp={movResp} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* FILA INFERIOR: PORTFOLIO a todo el ancho, con tabs Posiciones / Variación */}
      <div className="flex-1 min-w-0 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
        <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
            Portfolio
          </span>
          <span className="text-[9px] text-[var(--t-text-muted)] font-mono uppercase">
            {!selectedFecha ? "actual" : "histórica"}
          </span>
          {ultimoSnap && (
            <span className="text-[9px] text-[var(--t-text-muted)] font-mono">
              {fmtFechaCorta(ultimoSnap)}
            </span>
          )}
          {/* Tabs Posiciones / Variación */}
          <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)] ml-1">
            {(["posiciones", "variacion"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setPortfolioTab(t)}
                className={
                  "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                  (portfolioTab === t
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                    : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                }
                title={t === "variacion" ? "Variación vs mes anterior (requiere mes seleccionado)" : "Posiciones del portfolio"}
              >
                {t === "posiciones" ? "Posiciones" : "Variación"}
              </button>
            ))}
          </div>
          {portfolioTab === "variacion" && varLoading && (
            <span className="text-[9px] text-[var(--t-text-dim)]">cargando…</span>
          )}

          {selectedFecha && (
            <button
              onClick={() => setSelectedFecha(null)}
              className="text-[9px] uppercase tracking-wider px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10"
              title="Volver al snapshot más reciente"
            >
              Hoy ×
            </button>
          )}

          {posLoading && (
            <span className="text-[9px] text-[var(--t-text-dim)]">cargando…</span>
          )}

          {/* Download button — exporta posición + flujos (si hay fecha) en hojas */}
          <DownloadButton
            className="ml-auto"
            title={
              selectedFecha
                ? "Descargar Excel (posiciones + flujos del mes en hojas separadas)"
                : "Descargar Excel (posición actual)"
            }
            onClick={async () => {
              const cta = idCuenta;
              const fechaSnap = ultimoSnap ?? selectedFecha ?? "actual";
              const sheets: Parameters<typeof exportToXlsx>[0]["sheets"] = [];

              // ── Hoja 1: Posiciones ─────────────────────────────────────
              if (posiciones.length > 0) {
                sheets.push({
                  name: selectedFecha ? `Posición ${fechaSnap}` : "Posición actual",
                  title: nombreCuenta
                    ? `Cuenta: [${cta}] ${nombreCuenta} · ${fechaSnap}`
                    : `Cuenta: [${cta}] · ${fechaSnap}`,
                  rows: posiciones.map((p) => ({
                    ticker:        p.ticker,
                    emisor:        p.emisor ?? "",
                    clase_activo:  p.clase_activo ?? "",
                    cartera:       p.cartera ?? "",
                    calificacion:  p.calificacion ?? "",
                    vencimiento:   p.vencimiento ?? "",
                    cantidad:      p.cantidad,
                    precio:        p.precio,
                    valuacion:     p.valuacion,
                    share:         p.share != null ? p.share : null,  // % directo (no /100)
                  })),
                  columns: [
                    { header: "TICKER",       key: "ticker",       format: "text",     width: 14 },
                    { header: "EMISOR",       key: "emisor",       format: "text",     width: 22 },
                    { header: "CLASE",        key: "clase_activo", format: "text",     width: 14 },
                    { header: "CARTERA",      key: "cartera",      format: "text",     width: 14 },
                    { header: "CALIF.",       key: "calificacion", format: "text",     width: 10 },
                    { header: "VTO.",         key: "vencimiento",  format: "text",     width: 12 },
                    { header: "CANTIDAD",     key: "cantidad",     format: "number",   width: 16 },
                    { header: "PRECIO",       key: "precio",       format: "number",   width: 14 },
                    { header: "VALUACIÓN",    key: "valuacion",    format: "currency", width: 18 },
                    { header: "%",            key: "share",        format: "percent",  width: 10 },
                  ],
                });
              }

              // ── Hoja 2: Flujos del mes (solo si hay fecha seleccionada) ──
              if (selectedFecha && movResp && movResp.movimientos.length > 0) {
                sheets.push({
                  name: `Flujos ${movResp.mes}`,
                  title: `Movimientos de ${fmtMesAnio(movResp.mes)} · [${cta}]`,
                  rows: movResp.movimientos.map((m) => ({
                    fecha:        m.fecha,
                    categoria:    m.categoria,
                    importe:      m.importe,
                    moneda:       m.moneda ?? "",
                    mep_rate:     m.mep_rate,
                    importe_ars:  m.importe_ars,
                    op:           m.op ?? "",
                    ticker:       m.ticker ?? "",
                    comprobante:  m.comprobante ?? "",
                    informacion:  m.informacion ?? "",
                  })),
                  columns: [
                    { header: "FECHA",      key: "fecha",       format: "text",     width: 12 },
                    { header: "TIPO",       key: "categoria",   format: "text",     width: 14 },
                    { header: "IMPORTE",    key: "importe",     format: "currency", width: 16 },
                    { header: "MONEDA",     key: "moneda",      format: "text",     width: 8  },
                    { header: "MEP",        key: "mep_rate",    format: "number",   width: 10 },
                    { header: "IMPORTE ARS",key: "importe_ars", format: "currency", width: 18 },
                    { header: "OP",         key: "op",          format: "text",     width: 10 },
                    { header: "TICKER",     key: "ticker",      format: "text",     width: 14 },
                    { header: "COMPROBANTE",key: "comprobante", format: "text",     width: 16 },
                    { header: "DETALLE",    key: "informacion", format: "text",     width: 40 },
                  ],
                });
              }

              if (sheets.length === 0) return;
              const sufijoFecha = selectedFecha ?? "actual";
              await exportToXlsx({
                sheets,
                filename: `valuaciones-portfolio-${cta}-${sufijoFecha}-${timestampSuffix()}.xlsx`,
              });
            }}
          />

          {/* Header right: posiciones + total, o Δ total en la tab variación */}
          <span className="text-[10px] text-[var(--t-text-dim)] font-mono">
            {portfolioTab === "posiciones"
              ? <>{posiciones.length} · <span className="text-[#4a9eff] font-semibold">{fmtCompact(totalPos)}</span></>
              : varResp?.totales && (
                  <>Δ total <span className="font-semibold" style={{ color: colorDeltaMod(varResp.totales.delta_total) }}>{fmtSigned(varResp.totales.delta_total)}</span></>
                )}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {portfolioTab === "variacion" ? (
            !selectedFecha ? (
              <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)] p-4 text-center">
                Seleccioná un mes en la tabla mensual para ver la variación vs el mes anterior.
              </div>
            ) : (
              <VariacionTabla varResp={varResp} />
            )
          ) : posiciones.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">
                Sin posiciones activas.
              </div>
            ) : (
              <table className="w-full table-fixed text-[11px] font-mono tabular-nums">
                <colgroup>
                  <col className="w-[13%]" />
                  <col className="w-[17%]" />
                  <col className="w-[11%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[10%]" />
                  <col className="w-[9%]" />
                  <col className="w-[8%]" />
                  <col className="w-[11%]" />
                  <col className="w-[5%]" />
                </colgroup>
                <thead className="sticky top-0 bg-[var(--t-surface-2)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                  <tr>
                    <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Ticker</th>
                    <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Emisor</th>
                    <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Clase</th>
                    <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Cart.</th>
                    <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Calif.</th>
                    <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Vto.</th>
                    <th className="px-2 py-1 text-right align-top border-b border-[var(--t-border)]">Cant.</th>
                    <th className="px-2 py-1 text-right align-top border-b border-[var(--t-border)]">Precio</th>
                    <th className="px-2 py-1 text-right align-top border-b border-[var(--t-border)]">Valuación</th>
                    <th className="px-2 py-1 text-right align-top border-b border-[var(--t-border)]">%</th>
                  </tr>
                </thead>
                <tbody>
                  {posiciones.map((p) => (
                    <tr
                      key={p.unidad ?? p.ticker}
                      onContextMenu={(e) => {
                        if (!_posOperable(p).operable) return; // cash: menú nativo
                        e.preventDefault();
                        setCtxMenu({ x: e.clientX, y: e.clientY, pos: p });
                      }}
                      className={`border-t border-[var(--t-border)] hover:bg-[var(--t-surface-2)] ${
                        _posOperable(p).operable ? "cursor-context-menu" : ""
                      }`}
                    >
                      <td className="px-2 py-1 align-top whitespace-normal break-words text-[var(--t-accent)] font-semibold">{p.ticker}</td>
                      <td className="px-2 py-1 align-top whitespace-normal break-words text-[var(--t-text)]">{p.emisor || "—"}</td>
                      <td className="px-2 py-1 align-top whitespace-normal break-words text-[var(--t-text-dim)]">{p.clase_activo || "—"}</td>
                      <td className="px-2 py-1 align-top">
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                            style={{ background: carteraColor(p.cartera) }}
                          />
                          <span style={{ color: carteraColor(p.cartera) }}>
                            {carteraShort(p.cartera)}
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-1 align-top whitespace-normal break-words text-[var(--t-text-dim)]">{p.calificacion || "—"}</td>
                      <td className="px-2 py-1 align-top whitespace-normal break-words text-[var(--t-text-dim)]">
                        {p.vencimiento ? fmtFechaCorta(p.vencimiento) : "—"}
                      </td>
                      <td className="px-2 py-1 align-top text-right text-[var(--t-text)]">{fmtQty(p.cantidad)}</td>
                      <td className="px-2 py-1 align-top text-right text-[var(--t-text-dim)]">{fmtPrice(p.precio)}</td>
                      <td
                        className="px-2 py-1 align-top text-right font-semibold"
                        style={{ color: p.valuacion >= 0 ? "#d0d0d0" : "var(--t-neg)" }}
                      >
                        {fmtCompact(p.valuacion)}
                      </td>
                      <td className="px-2 py-1 align-top text-right text-[var(--t-text-dim)]">
                        {p.share != null ? p.share.toFixed(1) + "%" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>

      {/* Menú contextual (click derecho en una posición) → operar en Trading. */}
      {ctxMenu && (
        <div
          className="fixed z-50 min-w-[210px] bg-[var(--t-surface)] border border-[var(--t-border-2)] shadow-xl text-[11px]"
          style={{
            top: Math.min(ctxMenu.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 120),
            left: Math.min(ctxMenu.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 230),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-[var(--t-border)] text-[var(--t-text-dim)] flex items-center gap-1">
            <span
              className="text-[var(--t-accent)] font-semibold truncate max-w-[150px]"
              title={ctxMenu.pos.ticker}
            >
              {ctxMenu.pos.ticker}
            </span>
            <span className="text-[9px] uppercase">{ctxMenu.pos.clase_activo}</span>
          </div>
          <button
            onClick={() => {
              const href = _operarHref(ctxMenu.pos, idCuenta);
              setCtxMenu(null);
              router.push(href);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--t-tint-amber)] text-[#ffcf66] flex items-center gap-2"
          >
            <span>▸</span>
            <span>
              OPERAR{_posOperable(ctxMenu.pos).isFci ? " (FCI)" : ""} ·{" "}
              <span className="text-[var(--t-text-dim)]">cuenta {idCuenta}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Color de variación (compartido) ─────────────────────────────────────────
function colorDeltaMod(n: number | null | undefined): string {
  return n == null ? "#888" : n >= 0 ? "var(--t-pos)" : "var(--t-neg)";
}

// ── Tabla FLUJO del mes (depósitos / extracciones / transferencias) ─────────
function FlujoTabla({ movResp }: { movResp: MovimientosResp | null }) {
  if (!movResp || movResp.movimientos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)] p-4 text-center">
        Sin depósitos / extracciones / transferencias en el mes.
      </div>
    );
  }
  return (
    <table className="w-full table-fixed text-[11px] font-mono tabular-nums">
      <colgroup>
        <col className="w-[12%]" />
        <col className="w-[16%]" />
        <col className="w-[15%]" />
        <col className="w-[8%]" />
        <col className="w-[15%]" />
        <col className="w-[34%]" />
      </colgroup>
      <thead className="sticky top-0 bg-[var(--t-surface-2)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
        <tr>
          <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Fecha</th>
          <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Tipo</th>
          <th className="px-2 py-1 text-right align-top border-b border-[var(--t-border)]">Importe orig</th>
          <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Mon</th>
          <th
            className="px-2 py-1 text-right align-top border-b border-[var(--t-border)]"
            title="Importe convertido a ARS al MEP de la fecha del movimiento"
          >Importe ARS</th>
          <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Detalle</th>
        </tr>
      </thead>
      <tbody>
        {movResp.movimientos.map((m) => {
          const isDep = m.categoria === "deposito" || m.categoria === "transferencia";
          return (
            <tr key={m.comprobante ?? m.fecha} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
              <td className="px-2 py-1 align-top text-[var(--t-text-dim)]">{fmtFechaCorta(m.fecha)}</td>
              <td className="px-2 py-1 align-top whitespace-normal break-words">
                <span style={{ color: isDep ? "var(--t-pos)" : "#ff5d6c" }}>
                  {m.categoria === "deposito"
                    ? "Depósito"
                    : m.categoria === "extraccion"
                      ? "Extracción"
                      : m.categoria === "transferencia"
                        ? "Transferencia"
                        : m.categoria}
                </span>
              </td>
              <td
                className="px-2 py-1 align-top text-right text-[var(--t-text-dim)]"
                title={m.mep_rate ? `MEP usado: ${m.mep_rate.toLocaleString("es-AR")}` : ""}
              >
                {fmtSigned(m.importe)}
              </td>
              <td className="px-2 py-1 align-top text-[var(--t-text-dim)]">{m.moneda ?? "—"}</td>
              <td
                className="px-2 py-1 align-top text-right font-semibold"
                style={{ color: (m.importe_ars ?? 0) >= 0 ? "var(--t-pos)" : "#ff5d6c" }}
              >
                {fmtSigned(m.importe_ars)}
              </td>
              <td className="px-2 py-1 align-top whitespace-normal break-words text-[var(--t-text-dim)]" title={m.informacion ?? ""}>
                {m.informacion ?? "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Tabla VARIACIÓN vs mes anterior ─────────────────────────────────────────
function VariacionTabla({ varResp }: { varResp: VariacionResp | null }) {
  if (!varResp || varResp.error || !varResp.totales) {
    return (
      <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)] p-4 text-center">
        {varResp?.error ?? "Sin datos de variación."}
      </div>
    );
  }
  return (
    <table className="w-full table-fixed text-[11px] font-mono tabular-nums">
      <colgroup>
        <col className="w-[26%]" />
        <col className="w-[12%]" />
        <col className="w-[12%]" />
        <col className="w-[12%]" />
        <col className="w-[13%]" />
        <col className="w-[12%]" />
        <col className="w-[13%]" />
      </colgroup>
      <thead className="sticky top-0 bg-[var(--t-surface-2)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
        <tr>
          <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Título</th>
          <th className="px-2 py-1 text-left align-top border-b border-[var(--t-border)]">Tipo</th>
          <th className="px-2 py-1 text-right align-top border-b border-[var(--t-border)]">Val. ant.</th>
          <th className="px-2 py-1 text-right align-top border-b border-[var(--t-border)]">Val. actual</th>
          <th
            className="px-2 py-1 text-right align-top border-b border-[var(--t-border)]"
            title="Variación por movimiento de precio — el título rindió (a cantidad del mes anterior)."
          >Δ mercado</th>
          <th
            className="px-2 py-1 text-right align-top border-b border-[var(--t-border)]"
            title="Variación por compra/venta — cambió la cantidad."
          >Δ operado</th>
          <th className="px-2 py-1 text-right align-top border-b border-[var(--t-border)]">Δ total</th>
        </tr>
      </thead>
      <tbody>
        {varResp.filas.map((f) => (
          <tr key={f.unidad} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
            <td className="px-2 py-1 align-top whitespace-normal break-words text-[var(--t-accent)]" title={f.unidad}>
              {f.unidad}
              {f.estado !== "ambos" && (
                <span className="text-[var(--t-text-muted)] ml-1">
                  {f.estado === "nuevo" ? "(nuevo)" : "(cerrado)"}
                </span>
              )}
            </td>
            <td className="px-2 py-1 align-top whitespace-normal break-words text-[var(--t-text-dim)]">{f.tipo ?? "—"}</td>
            <td className="px-2 py-1 align-top text-right text-[var(--t-text-dim)]">{fmtCompact(f.val_anterior)}</td>
            <td className="px-2 py-1 align-top text-right text-[var(--t-text)]">{fmtCompact(f.val_actual)}</td>
            <td className="px-2 py-1 align-top text-right" style={{ color: colorDeltaMod(f.delta_mercado) }}>
              {fmtSigned(f.delta_mercado)}
            </td>
            <td className="px-2 py-1 align-top text-right" style={{ color: colorDeltaMod(f.delta_operado) }}>
              {fmtSigned(f.delta_operado)}
            </td>
            <td className="px-2 py-1 align-top text-right font-semibold" style={{ color: colorDeltaMod(f.delta_total) }}>
              {fmtSigned(f.delta_total)}
            </td>
          </tr>
        ))}
        {varResp.otros && varResp.otros.delta_total !== 0 && (
          <tr className="border-t border-[var(--t-border-2)] bg-[var(--t-surface-2)]">
            <td className="px-2 py-1 align-top text-[var(--t-text-dim)] italic">
              OTROS · efectivo ({varResp.otros.n ?? 0})
            </td>
            <td className="px-2 py-1 align-top text-[var(--t-text-dim)]">—</td>
            <td className="px-2 py-1 align-top text-right text-[var(--t-text-dim)]">{fmtCompact(varResp.otros.val_anterior)}</td>
            <td className="px-2 py-1 align-top text-right text-[var(--t-text)]">{fmtCompact(varResp.otros.val_actual)}</td>
            <td className="px-2 py-1 align-top text-right" style={{ color: colorDeltaMod(varResp.otros.delta_mercado) }}>
              {fmtSigned(varResp.otros.delta_mercado)}
            </td>
            <td className="px-2 py-1 align-top text-right" style={{ color: colorDeltaMod(varResp.otros.delta_operado) }}>
              {fmtSigned(varResp.otros.delta_operado)}
            </td>
            <td className="px-2 py-1 align-top text-right font-semibold" style={{ color: colorDeltaMod(varResp.otros.delta_total) }}>
              {fmtSigned(varResp.otros.delta_total)}
            </td>
          </tr>
        )}
        <tr className="border-t-2 border-[var(--t-border-2)] bg-[var(--t-surface-2)] font-semibold">
          <td className="px-2 py-1 align-top text-[var(--t-accent)]" colSpan={2}>TOTAL</td>
          <td className="px-2 py-1 align-top text-right text-[var(--t-text-dim)]">{fmtCompact(varResp.totales.val_anterior)}</td>
          <td className="px-2 py-1 align-top text-right text-[var(--t-text)]">{fmtCompact(varResp.totales.val_actual)}</td>
          <td className="px-2 py-1 align-top text-right" style={{ color: colorDeltaMod(varResp.totales.delta_mercado) }}>
            {fmtSigned(varResp.totales.delta_mercado)}
          </td>
          <td className="px-2 py-1 align-top text-right" style={{ color: colorDeltaMod(varResp.totales.delta_operado) }}>
            {fmtSigned(varResp.totales.delta_operado)}
          </td>
          <td className="px-2 py-1 align-top text-right" style={{ color: colorDeltaMod(varResp.totales.delta_total) }}>
            {fmtSigned(varResp.totales.delta_total)}
          </td>
        </tr>
      </tbody>
    </table>
  );
}
