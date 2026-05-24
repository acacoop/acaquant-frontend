"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Vista COMERCIAL (en OPERACIONES) — lente por operador.
// Layout:
//   · Header slim: selector de operador + KPIs (métricas generales, no interactivas).
//   · Izq: gráfico de evolución (chico) + ficha del cliente con tabs (tab "Datos").
//   · Der: tabla de clientes (60%) + portafolio/tenencia del cliente (40%).
// Seleccionar un cliente re-scopea el gráfico, llena la ficha (embebida, sin
// fetch) y carga su tenencia. Consume /api/operaciones/comercial/*.
// Ver docs/TABLERO_COMERCIAL.md [5].

export type Operador = { operador_email: string; operador_nombre: string | null; n_cuentas: number };
type Resumen = {
  aum_gestionado: number;
  n_clientes: number;
  volumen_mtd: number;
  volumen_ytd: number;
};
type Ficha = {
  denominacion: string | null;
  nivel_1: string | null;
  nivel_2: string | null;
  nivel_3: string | null;
  nivel_4: string | null;
  nivel_5: string | null;
  primer_contacto_comercial: string | null;
  riesgo_la_ft: string | null;
  division: string | null;
  adc: string | null;
  dma: string | null;
};
type Cliente = {
  id_cuenta: string;
  denominacion: string;
  aum: number;
  volumen_ytd: number;
  ficha: Ficha;
};
type OperadorResp = { operador: string; moneda: string; resumen: Resumen; clientes: Cliente[] };
type SeriePoint = { fecha: string; valor: number };
type Posicion = { unidad: string; valuacion: number; pct: number };
type Portafolio = { id_cuenta: string; fecha_snapshot: string | null; total: number; posiciones: Posicion[] };
type Operacion = {
  fecha: string;
  comprobante: string;
  categoria: string;
  op: string | null;
  ticker: string | null;
  cantidad: number | null;
  precio: number | null;
  importe: number | null;
  moneda: string | null;
  plazo: string | null;
};
type PortTab = "tenencia" | "operaciones";

const OP_CAT_LABEL: Record<string, string> = {
  compra: "Compra", venta: "Venta",
  suscripcion_fci: "Susc FCI", solicitud_suscripcion_fci: "Sol. susc",
  rescate_fci: "Rescate FCI", solicitud_rescate_fci: "Sol. rescate",
  caucion_tom_ap: "Cauc tom", caucion_col_ap: "Cauc col",
};
const OP_CAT_COLOR: Record<string, string> = {
  compra: "#3fbf6f", venta: "#ff5d6c",
  suscripcion_fci: "#94e7b3", solicitud_suscripcion_fci: "#94e7b3",
  rescate_fci: "#e7b394", solicitud_rescate_fci: "#e7b394",
  caucion_tom_ap: "#d09060", caucion_col_ap: "#5fd0d0",
};

// ── Helpers ──────────────────────────────────────────────────────────────
const fmtN = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtAum = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return sign + "$" + (abs / 1e9).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + "B";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 }) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 0 }) + "k";
  return sign + "$" + fmtN(abs);
};

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

// ── Agregación + rango del gráfico (estilo NEGOCIO/AUM) ───────────────────
type AggKey = "DIARIO" | "SEMANAL" | "MENSUAL";
type RangoKey = "1W" | "1M" | "3M" | "6M" | "YTD" | "1A" | "ALL";
// Cuentas de días hábiles aprox por preset (los datos son L-V).
const RANGO_N: Record<Exclude<RangoKey, "YTD" | "ALL">, number> = {
  "1W": 5, "1M": 22, "3M": 65, "6M": 130, "1A": 252,
};
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const fmtFechaCorta = (s: string) => {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y.slice(-2)}`;
};
const fmtMesCorto = (s: string) => {
  const [y, m] = s.split("-").map(Number);
  return `${MESES[m - 1]} ${String(y).slice(-2)}`;
};
function lunesDeSemana(fechaIso: string): string {
  const d = new Date(fechaIso + "T00:00:00Z");
  const dow = d.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return new Date(d.getTime() + offset * 86400000).toISOString().slice(0, 10);
}
const bucketKey = (f: string, agg: AggKey) =>
  agg === "MENSUAL" ? f.slice(0, 7) : agg === "SEMANAL" ? lunesDeSemana(f) : f;
const fmtBucket = (k: string, agg: AggKey) =>
  agg === "MENSUAL" ? fmtMesCorto(k) : fmtFechaCorta(k);

// Volumen es flujo → suma por bucket; AuM es stock → último del bucket.
function aggregateSerie(serie: SeriePoint[], agg: AggKey, metric: "volumen" | "aum"): SeriePoint[] {
  if (agg === "DIARIO") return serie;
  const buckets = new Map<string, SeriePoint[]>();
  for (const p of serie) {
    const k = bucketKey(p.fecha, agg);
    const arr = buckets.get(k);
    if (arr) arr.push(p); else buckets.set(k, [p]);
  }
  const out: SeriePoint[] = [];
  for (const [k, pts] of buckets) {
    const valor = metric === "aum"
      ? pts.reduce((acc, p) => (p.fecha >= acc.fecha ? p : acc), pts[0]).valor
      : pts.reduce((a, p) => a + p.valor, 0);
    out.push({ fecha: k, valor });
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Slice por rango + offset (pan). offset=0 = ventana más reciente.
function filtrarRango(serie: SeriePoint[], rango: RangoKey, offset = 0): SeriePoint[] {
  if (rango === "ALL" || serie.length === 0) return serie;
  if (rango === "YTD") {
    const yyyy = new Date().getFullYear() - offset;
    return serie.filter((s) => s.fecha.startsWith(`${yyyy}-`));
  }
  const n = RANGO_N[rango];
  const end = serie.length - offset * n;
  const start = Math.max(0, end - n);
  return serie.slice(Math.max(0, start), Math.max(0, end));
}

// Campos de la ficha (tab "Datos") — se muestran SIEMPRE, incluso null.
const FICHA_DATOS: [keyof Ficha, string][] = [
  ["nivel_1", "Nivel 1"], ["nivel_2", "Nivel 2"], ["nivel_3", "Nivel 3"],
  ["nivel_4", "Nivel 4"], ["nivel_5", "Nivel 5"],
  ["primer_contacto_comercial", "1er contacto"], ["riesgo_la_ft", "Riesgo LA/FT"],
  ["division", "División"], ["adc", "ADC"], ["dma", "DMA"],
];

// Sub-vistas de COMERCIAL (sub-nav arriba-izquierda).
type SubView = "portfolio" | "analisis";

// Estado comercial: color + label para las badges de la vista Análisis.
const ESTADO_COLOR: Record<string, string> = {
  ACTIVA: "#3fbf6f", ENFRIANDOSE: "#ff9900", DORMIDA: "#ff5d6c", NUEVA: "#5fa8d0",
};
const ESTADO_LABEL: Record<string, string> = {
  ACTIVA: "Activa", ENFRIANDOSE: "Enfriándose", DORMIDA: "Dormida", NUEVA: "Nueva",
};
type AnalisisCliente = {
  id_cuenta: string;
  denominacion: string;
  aum: number;
  ultima_op: string | null;
  dias_sin_operar: number | null;
  estado: string;
  opero_ytd: boolean;
  nivel_1: string | null;
  nivel_2: string | null;
  nivel_3: string | null;
  nivel_4: string | null;
  nivel_5: string | null;
};

// `operador` (email) lo controla el selector que vive en la barra de tabs de
// operaciones-view.tsx (margen superior derecho) → llega como prop.
export function ComercialOperacionesView({ operador }: { operador: string }) {
  const [subview, setSubview] = useState<SubView>("portfolio");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [metric, setMetric] = useState<"volumen" | "aum">("volumen");
  const [serie, setSerie] = useState<SeriePoint[]>([]);
  const [portafolio, setPortafolio] = useState<Portafolio | null>(null);
  const [portTab, setPortTab] = useState<PortTab>("tenencia");
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [loadingOps, setLoadingOps] = useState(false);
  const [fichaTab, setFichaTab] = useState<"datos">("datos");
  const [agg, setAgg] = useState<AggKey>("DIARIO");
  const [rango, setRango] = useState<RangoKey>("YTD");
  const [rangoOffset, setRangoOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingSerie, setLoadingSerie] = useState(false);
  const [loadingPort, setLoadingPort] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Resumen + clientes del operador (una pasada). Limpia el cliente elegido.
  useEffect(() => {
    if (!operador) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setSelCuenta(null);
    void (async () => {
      try {
        const d = await getJson<OperadorResp>(
          `/api/operaciones/comercial/operador?operador=${encodeURIComponent(operador)}`,
        );
        if (cancelled) return;
        setResumen(d.resumen);
        setClientes(Array.isArray(d.clientes) ? d.clientes : []);
      } catch (e) {
        if (cancelled) return;
        setResumen(null);
        setClientes([]);
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [operador]);

  // Serie del gráfico: operador completo o, si hay cliente, esa cuenta.
  useEffect(() => {
    if (!operador) return;
    let cancelled = false;
    setLoadingSerie(true);
    void (async () => {
      try {
        let q = `operador=${encodeURIComponent(operador)}&metric=${metric}`;
        if (selCuenta) q += `&id_cuenta=${encodeURIComponent(selCuenta)}`;
        const d = await getJson<{ serie: SeriePoint[] }>(`/api/operaciones/comercial/serie?${q}`);
        if (!cancelled) setSerie(Array.isArray(d.serie) ? d.serie : []);
      } catch {
        if (!cancelled) setSerie([]);
      } finally {
        if (!cancelled) setLoadingSerie(false);
      }
    })();
    return () => { cancelled = true; };
  }, [operador, metric, selCuenta]);

  // Tenencia del cliente seleccionado.
  useEffect(() => {
    if (!selCuenta) { setPortafolio(null); return; }
    let cancelled = false;
    setLoadingPort(true);
    void (async () => {
      try {
        const d = await getJson<Portafolio>(
          `/api/operaciones/comercial/portafolio?id_cuenta=${encodeURIComponent(selCuenta)}`,
        );
        if (!cancelled) setPortafolio(d);
      } catch {
        if (!cancelled) setPortafolio(null);
      } finally {
        if (!cancelled) setLoadingPort(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selCuenta]);

  // Operaciones del cliente — solo cuando la tab Operaciones está activa.
  useEffect(() => {
    if (!selCuenta || portTab !== "operaciones") { setOperaciones([]); return; }
    let cancelled = false;
    setLoadingOps(true);
    void (async () => {
      try {
        const d = await getJson<{ operaciones: Operacion[] }>(
          `/api/operaciones/comercial/operaciones?id_cuenta=${encodeURIComponent(selCuenta)}`,
        );
        if (!cancelled) setOperaciones(Array.isArray(d.operaciones) ? d.operaciones : []);
      } catch {
        if (!cancelled) setOperaciones([]);
      } finally {
        if (!cancelled) setLoadingOps(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selCuenta, portTab]);

  const cliente = useMemo(
    () => clientes.find((c) => c.id_cuenta === selCuenta) ?? null,
    [clientes, selCuenta],
  );

  // Volver al inicio del rango cuando cambia el scope o el preset/métrica.
  useEffect(() => { setRangoOffset(0); }, [rango, metric, operador, selCuenta]);

  const serieRango = useMemo(
    () => filtrarRango(serie, rango, rangoOffset),
    [serie, rango, rangoOffset],
  );
  const chartData = useMemo(
    () => aggregateSerie(serieRango, agg, metric),
    [serieRango, agg, metric],
  );
  const visDesde = serieRango[0]?.fecha ?? null;
  const visHasta = serieRango[serieRango.length - 1]?.fecha ?? null;
  // Volumen (flujo) → total del período; AuM (stock) → último valor visible.
  const resumenSerie = useMemo(() => {
    if (metric === "aum") return serieRango[serieRango.length - 1]?.valor ?? 0;
    return serieRango.reduce((a, p) => a + p.valor, 0);
  }, [serieRango, metric]);

  const puedeAtras = rango !== "ALL" && serieRango.length > 0 && (
    rango === "YTD"
      ? serie.some((s) => s.fecha.startsWith(`${new Date().getFullYear() - rangoOffset - 1}-`))
      : serie.length - (rangoOffset + 1) * RANGO_N[rango] > 0
  );
  const puedeAdelante = rangoOffset > 0;
  const tickInterval = Math.max(0, Math.floor(chartData.length / 12));

  return (
    <div className="h-full flex flex-col min-h-0 bg-[#0a0a0a] text-[#d0d0d0] overflow-hidden">

      {/* ── HEADER: sub-nav (izq) + KPIs generales (der) ─────────────────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#080808] shrink-0 flex-wrap">
        <div className="inline-flex items-stretch border border-[#2a2a2a] divide-x divide-[#2a2a2a]">
          {([["portfolio", "Portfolio & Operaciones"], ["analisis", "Análisis"]] as [SubView, string][]).map(
            ([v, label]) => (
              <button
                key={v}
                onClick={() => setSubview(v)}
                className={
                  "px-3 py-1 text-[11px] font-semibold tracking-wide " +
                  (subview === v ? "bg-[#ff9900] text-black" : "bg-transparent text-[#888] hover:text-[#ff9900]")
                }
              >
                {label}
              </button>
            ),
          )}
        </div>
        {loading && <span className="text-[9px] text-[#888]">cargando…</span>}
        {err && <span className="text-[9px] text-[#ff7777]">{err}</span>}
        <div className="ml-auto flex items-center gap-3">
          <KpiChip label="AUM" value={resumen ? fmtAum(resumen.aum_gestionado) : "—"} />
          <KpiChip label="CLIENTES" value={resumen ? fmtN(resumen.n_clientes) : "—"} />
          <KpiChip label="VOL. MTD" value={resumen ? fmtAum(resumen.volumen_mtd) : "—"} />
          <KpiChip label="VOL. YTD" value={resumen ? fmtAum(resumen.volumen_ytd) : "—"} />
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      {subview === "analisis" && <AnalisisComercial operador={operador} />}
      {subview === "portfolio" && (
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">

        {/* IZQUIERDA: gráfico (chico) + ficha con tabs */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">

          {/* GRÁFICO DE EVOLUCIÓN */}
          <div className="flex-[3_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] shrink-0 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest text-[#ff9900]">
                {metric === "aum" ? "AUM" : "Volumen operado"} · ARS
              </span>
              {visDesde && visHasta && (
                <span className="text-[9px] text-[#555] font-mono">
                  {fmtFechaCorta(visDesde)} → {fmtFechaCorta(visHasta)}
                </span>
              )}
              {serieRango.length > 0 && (
                <span className="text-[10px] font-mono">
                  <span className="text-[#666] uppercase tracking-wider">
                    {metric === "aum" ? "Último: " : "Total período: "}
                  </span>
                  <span className="text-[#ff9900] font-semibold">{fmtAum(resumenSerie)}</span>
                </span>
              )}
              {cliente && (
                <span className="text-[10px] text-[#888] font-mono truncate max-w-[35%]">
                  · {cliente.denominacion}
                  <button
                    onClick={() => setSelCuenta(null)}
                    className="ml-1 text-[#888] hover:text-[#ff9900] text-[12px] leading-none"
                    title="Volver a la cartera del operador"
                  >×</button>
                </span>
              )}
              {loadingSerie && <span className="text-[9px] text-[#888]">cargando…</span>}

              {/* Volumen / AuM */}
              <div className="ml-auto inline-flex items-stretch border border-[#2a2a2a] divide-x divide-[#2a2a2a]">
                {(["volumen", "aum"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={
                      "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                      (metric === m ? "bg-[#ff9900] text-black" : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
                    }
                  >
                    {m === "volumen" ? "Volumen" : "AuM"}
                  </button>
                ))}
              </div>
              {/* Agregación */}
              <div className="inline-flex items-stretch border border-[#2a2a2a] divide-x divide-[#2a2a2a]">
                {(["DIARIO", "SEMANAL", "MENSUAL"] as AggKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setAgg(k)}
                    className={
                      "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                      (agg === k ? "bg-[#ff9900] text-black" : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
                    }
                  >
                    {k}
                  </button>
                ))}
              </div>
              {/* Rango + pan */}
              <div className="inline-flex items-center gap-1">
                <button
                  onClick={() => setRangoOffset((o) => o + 1)}
                  disabled={!puedeAtras}
                  title="Período anterior"
                  className="px-1 py-0.5 text-[10px] text-[#888] border border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900] disabled:text-[#333] disabled:border-[#1a1a1a] disabled:cursor-not-allowed"
                >◀</button>
                <div className="inline-flex items-stretch border border-[#2a2a2a] divide-x divide-[#2a2a2a]">
                  {(["1W", "1M", "3M", "6M", "YTD", "1A", "ALL"] as RangoKey[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => { setRango(k); setRangoOffset(0); }}
                      className={
                        "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                        (rango === k ? "bg-[#ff9900] text-black" : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
                      }
                    >
                      {k}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setRangoOffset((o) => Math.max(0, o - 1))}
                  disabled={!puedeAdelante}
                  title="Período siguiente"
                  className="px-1 py-0.5 text-[10px] text-[#888] border border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900] disabled:text-[#333] disabled:border-[#1a1a1a] disabled:cursor-not-allowed"
                >▶</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-2">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[#555]">
                  Sin datos de {metric === "aum" ? "AuM" : "volumen"} en este rango.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {metric === "aum" ? (
                    // AuM es saldo continuo → línea.
                    <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
                      <CartesianGrid stroke="#161616" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fill: "#808080", fontSize: 10 }}
                        axisLine={{ stroke: "#2a2a2a" }}
                        tickLine={false}
                        tickFormatter={(v: string) => fmtBucket(v, agg)}
                        interval={tickInterval}
                        angle={-35}
                        textAnchor="end"
                        height={32}
                        minTickGap={4}
                      />
                      <YAxis
                        tick={{ fill: "#808080", fontSize: 10 }}
                        axisLine={{ stroke: "#2a2a2a" }}
                        tickLine={false}
                        tickFormatter={(v) => fmtAum(Number(v))}
                        width={56}
                      />
                      <Tooltip
                        contentStyle={{ background: "#0e0e0e", border: "1px solid #2a2a2a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                        labelStyle={{ color: "#808080" }}
                        itemStyle={{ color: "#d0d0d0" }}
                        labelFormatter={(v) => fmtBucket(String(v), agg)}
                        formatter={(v) => [fmtAum(Number(v)), "AuM"]}
                      />
                      <Line type="monotone" dataKey="valor" stroke="#ff9900" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  ) : (
                    // Volumen es flujo → barras.
                    <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
                      <CartesianGrid stroke="#161616" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fill: "#808080", fontSize: 10 }}
                        axisLine={{ stroke: "#2a2a2a" }}
                        tickLine={false}
                        tickFormatter={(v: string) => fmtBucket(v, agg)}
                        interval={tickInterval}
                        angle={-35}
                        textAnchor="end"
                        height={32}
                        minTickGap={4}
                      />
                      <YAxis
                        tick={{ fill: "#808080", fontSize: 10 }}
                        axisLine={{ stroke: "#2a2a2a" }}
                        tickLine={false}
                        tickFormatter={(v) => fmtAum(Number(v))}
                        width={56}
                      />
                      <Tooltip
                        cursor={{ fill: "#ffffff08" }}
                        contentStyle={{ background: "#0e0e0e", border: "1px solid #2a2a2a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                        labelStyle={{ color: "#808080" }}
                        itemStyle={{ color: "#d0d0d0" }}
                        labelFormatter={(v) => fmtBucket(String(v), agg)}
                        formatter={(v) => [fmtAum(Number(v)), "Volumen"]}
                      />
                      <Bar dataKey="valor" fill="#ff9900" maxBarSize={40} isAnimationActive={false} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* FICHA DEL CLIENTE (con tabs) — alineada con el portafolio (40%) */}
          <div className="flex-[2_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">Ficha</span>
              {cliente && (
                <span className="text-[10px] text-[#888] font-mono truncate">
                  [{cliente.id_cuenta}] {cliente.ficha.denominacion || cliente.denominacion}
                </span>
              )}
              <div className="ml-auto inline-flex items-stretch border border-[#2a2a2a] divide-x divide-[#2a2a2a]">
                {(["datos"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFichaTab(t)}
                    className={
                      "px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                      (fichaTab === t ? "bg-[#ff9900] text-black" : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
                    }
                  >
                    {t === "datos" ? "Datos" : t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-3">
              {!cliente ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[#555] text-center">
                  Seleccioná un cliente para ver su ficha.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-2">
                  {FICHA_DATOS.map(([k, label]) => (
                    <Field key={k} label={label} value={cliente.ficha[k]} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* DERECHA: clientes (60%) + portafolio (40%) */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">

          {/* TABLA DE CLIENTES */}
          <div className="flex-[3_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">Clientes</span>
              <span className="ml-auto text-[10px] text-[#888] font-mono">{clientes.length}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[#080808] z-10 text-[9px] uppercase tracking-widest text-[#666]">
                  <tr>
                    <th className="px-3 py-1.5 text-left border-b border-[#1a1a1a]">Cuenta</th>
                    <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">AuM</th>
                    <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">Vol. YTD</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.length === 0 && !loading && (
                    <tr><td colSpan={3} className="text-center text-[#555] py-6">Sin clientes.</td></tr>
                  )}
                  {clientes.map((c) => {
                    const active = c.id_cuenta === selCuenta;
                    return (
                      <tr
                        key={c.id_cuenta}
                        onClick={() => setSelCuenta(active ? null : c.id_cuenta)}
                        className={
                          "border-t border-[#111] cursor-pointer transition-colors " +
                          (active ? "bg-[#ff9900]/10" : "hover:bg-[#0e0e0e]")
                        }
                        title="Click: ficha + tenencia + gráfico de este cliente"
                      >
                        <td className="px-3 py-1.5 text-[#d0d0d0] truncate max-w-[260px]" title={c.denominacion}>
                          <span className="text-[#666]">[{c.id_cuenta}]</span> {c.denominacion}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-[#ff9900]">{fmtAum(c.aum)}</td>
                        <td className="px-3 py-1.5 text-right text-[#d0d0d0]">{fmtAum(c.volumen_ytd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PORTAFOLIO — tabs Tenencia / Operaciones del cliente */}
          <div className="flex-[2_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">Portafolio</span>
              {portTab === "tenencia" && portafolio?.fecha_snapshot && (
                <span className="text-[9px] text-[#555] font-mono">{portafolio.fecha_snapshot}</span>
              )}
              {(loadingPort || loadingOps) && <span className="text-[9px] text-[#888]">cargando…</span>}
              {portTab === "tenencia" && portafolio && portafolio.posiciones.length > 0 && (
                <span className="text-[10px] text-[#888] font-mono">Total {fmtAum(portafolio.total)}</span>
              )}
              {portTab === "operaciones" && cliente && operaciones.length > 0 && (
                <span className="text-[10px] text-[#888] font-mono">{operaciones.length} ops</span>
              )}
              <div className="ml-auto inline-flex items-stretch border border-[#2a2a2a] divide-x divide-[#2a2a2a]">
                {(["tenencia", "operaciones"] as PortTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPortTab(t)}
                    className={
                      "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                      (portTab === t ? "bg-[#ff9900] text-black" : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
                    }
                  >
                    {t === "tenencia" ? "Tenencia" : "Operaciones"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {!cliente ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[#555] text-center">
                  Seleccioná un cliente para ver su {portTab === "operaciones" ? "actividad" : "tenencia"}.
                </div>
              ) : portTab === "tenencia" ? (
                !portafolio || portafolio.posiciones.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[11px] text-[#555]">
                    {loadingPort ? "cargando…" : "Sin posiciones."}
                  </div>
                ) : (
                  <table className="w-full text-[11px] font-mono tabular-nums">
                    <thead className="sticky top-0 bg-[#080808] z-10 text-[9px] uppercase tracking-widest text-[#666]">
                      <tr>
                        <th className="px-3 py-1.5 text-left border-b border-[#1a1a1a]">Unidad</th>
                        <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">Valuación</th>
                        <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portafolio.posiciones.map((p) => (
                        <tr key={p.unidad} className="border-t border-[#111] hover:bg-[#0e0e0e]">
                          <td className="px-3 py-1.5 text-[#d0d0d0] truncate max-w-[280px]" title={p.unidad}>{p.unidad}</td>
                          <td className="px-2 py-1.5 text-right font-semibold text-[#ff9900]">{fmtAum(p.valuacion)}</td>
                          <td className="px-3 py-1.5 text-right text-[#888]">{p.pct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : operaciones.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[#555]">
                  {loadingOps ? "cargando…" : "Sin operaciones."}
                </div>
              ) : (
                <table className="w-full text-[10px] font-mono tabular-nums">
                  <thead className="sticky top-0 bg-[#080808] z-10 text-[9px] uppercase tracking-widest text-[#666]">
                    <tr>
                      <th className="px-3 py-1.5 text-left border-b border-[#1a1a1a]">Fecha</th>
                      <th className="px-2 py-1.5 text-left border-b border-[#1a1a1a]">Categ</th>
                      <th className="px-2 py-1.5 text-left border-b border-[#1a1a1a]">Ticker</th>
                      <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">Cant</th>
                      <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">Precio</th>
                      <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operaciones.map((o) => {
                      const color = OP_CAT_COLOR[o.categoria] ?? "#666";
                      const imp = o.importe ?? 0;
                      return (
                        <tr key={o.comprobante} className="border-t border-[#111] hover:bg-[#0e0e0e]">
                          <td className="px-3 py-1 text-[#888] whitespace-nowrap">{fmtFechaCorta(o.fecha.slice(0, 10))}</td>
                          <td className="px-2 py-1">
                            <span className="inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 inline-block shrink-0" style={{ background: color }} />
                              <span className="text-[#888] whitespace-nowrap">{OP_CAT_LABEL[o.categoria] ?? o.categoria}</span>
                            </span>
                          </td>
                          <td className="px-2 py-1 text-[#ff9900] truncate max-w-[90px]" title={o.ticker ?? ""}>{o.ticker ?? "—"}</td>
                          <td className="px-2 py-1 text-right text-[#d0d0d0]">
                            {o.cantidad != null ? o.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
                          </td>
                          <td className="px-2 py-1 text-right text-[#d0d0d0]">
                            {o.precio != null ? o.precio.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
                          </td>
                          <td className={"px-3 py-1 text-right whitespace-nowrap " + (imp > 0 ? "text-[#3fbf6f]" : imp < 0 ? "text-[#ff5d6c]" : "text-[#888]")}>
                            {o.importe != null ? fmtAum(o.importe) : "—"}
                            {o.moneda === "USD" && <span className="text-[#555] ml-0.5">u$s</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function KpiChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[11px] font-mono">
      <span className="text-[#666] tracking-wider">{label} </span>
      <span className="text-[#d0d0d0] font-semibold">{value}</span>
    </span>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-[#666] tracking-wide">{label}</span>
      <span className="text-[11px] font-mono text-[#d0d0d0] truncate" title={value ?? "—"}>
        {value ?? "—"}
      </span>
    </div>
  );
}

// ── Vista ANÁLISIS: estado comercial + riesgo de churn + distribución por nivel.
// Todo de un solo dataset (/comercial/analisis), scopeado al operador elegido.
function AnalisisComercial({ operador }: { operador: string }) {
  const [clientes, setClientes] = useState<AnalisisCliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<"aum" | "dias">("aum");
  const [nivelSel, setNivelSel] = useState<string | null>(null);
  const [umbral, setUmbral] = useState<{ activa: number; dormida: number }>({ activa: 30, dormida: 90 });

  useEffect(() => {
    if (!operador) { setClientes([]); return; }
    let cancelled = false;
    setLoading(true);
    setNivelSel(null);
    void (async () => {
      try {
        const d = await getJson<{ clientes: AnalisisCliente[]; dias_activa?: number; dias_dormida?: number }>(
          `/api/operaciones/comercial/analisis?operador=${encodeURIComponent(operador)}`,
        );
        if (cancelled) return;
        setUmbral({ activa: d.dias_activa ?? 30, dormida: d.dias_dormida ?? 90 });
        setClientes(Array.isArray(d.clientes) ? d.clientes : []);
      } catch {
        if (!cancelled) setClientes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [operador]);

  const nivelDe = (c: AnalisisCliente) => c.nivel_1 || "(sin segmentar)";

  const counts = useMemo(() => {
    const c: Record<string, number> = { ACTIVA: 0, ENFRIANDOSE: 0, DORMIDA: 0, NUEVA: 0 };
    for (const x of clientes) c[x.estado] = (c[x.estado] ?? 0) + 1;
    return c;
  }, [clientes]);
  const sinAum = useMemo(() => clientes.filter((c) => c.aum <= 0).length, [clientes]);
  const sinOperarYtd = useMemo(() => clientes.filter((c) => !c.opero_ytd).length, [clientes]);

  // Distribución por nivel_1 — # clientes, sin operar (año) y AuM consolidado.
  const porNivel = useMemo(() => {
    const m = new Map<string, { nivel: string; aum: number; n: number; sinOperar: number }>();
    for (const c of clientes) {
      const k = nivelDe(c);
      const cur = m.get(k) ?? { nivel: k, aum: 0, n: 0, sinOperar: 0 };
      cur.aum += c.aum; cur.n += 1; if (!c.opero_ytd) cur.sinOperar += 1;
      m.set(k, cur);
    }
    return [...m.values()].sort((a, b) => b.aum - a.aum);
  }, [clientes]);

  // Estado comercial — filtrado por el nivel elegido (click en distribución) + orden.
  const ordenados = useMemo(() => {
    const arr = (nivelSel ? clientes.filter((c) => nivelDe(c) === nivelSel) : [...clientes]);
    const out = [...arr];
    if (sort === "aum") out.sort((a, b) => b.aum - a.aum);
    else out.sort((a, b) => (b.dias_sin_operar ?? -1) - (a.dias_sin_operar ?? -1));
    return out;
  }, [clientes, sort, nivelSel]);

  // Riesgo de churn — respeta también el nivel elegido.
  const churn = useMemo(
    () => (nivelSel ? clientes.filter((c) => nivelDe(c) === nivelSel) : clientes)
      .filter((c) => (c.estado === "ENFRIANDOSE" || c.estado === "DORMIDA") && c.aum > 0)
      .sort((a, b) => b.aum - a.aum),
    [clientes, nivelSel],
  );

  if (!operador) return <Empty msg="Elegí un operador." />;
  if (loading && clientes.length === 0) return <Empty msg="cargando…" />;
  if (clientes.length === 0) return <Empty msg="Sin clientes." />;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 overflow-hidden">
      {/* Resumen por estado */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {(["ACTIVA", "ENFRIANDOSE", "DORMIDA", "NUEVA"] as const).map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5 border border-[#1a1a1a] bg-[#080808] px-2 py-1 text-[11px]">
            <span className="w-2 h-2 inline-block" style={{ background: ESTADO_COLOR[e] }} />
            <span className="text-[#888]">{ESTADO_LABEL[e]}</span>
            <span className="font-semibold tabular-nums text-[#d0d0d0]">{counts[e] ?? 0}</span>
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 border border-[#1a1a1a] bg-[#080808] px-2 py-1 text-[11px]">
          <span className="text-[#888]">Sin AuM</span>
          <span className="font-semibold tabular-nums text-[#d0d0d0]">{sinAum}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 border border-[#1a1a1a] bg-[#080808] px-2 py-1 text-[11px]">
          <span className="text-[#888]">Sin operar (año)</span>
          <span className="font-semibold tabular-nums text-[#d0d0d0]">{sinOperarYtd}</span>
        </span>

        {/* Ayuda: definiciones de los estados + umbrales (reales del backend) */}
        <div className="ml-auto relative group">
          <span className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-[#2a2a2a] text-[#888] text-[10px] cursor-help group-hover:border-[#ff9900] group-hover:text-[#ff9900]">
            ?
          </span>
          <div className="hidden group-hover:block absolute right-0 top-5 z-50 w-[320px] border border-[#2a2a2a] bg-[#0e0e0e] p-3 text-[10px] leading-relaxed shadow-lg">
            <div className="text-[#ff9900] uppercase tracking-widest text-[9px] mb-1.5">Cómo se calcula</div>
            <p><span style={{ color: ESTADO_COLOR.ACTIVA }}>● Activa</span><span className="text-[#888]">: operó hace ≤ {umbral.activa} días.</span></p>
            <p><span style={{ color: ESTADO_COLOR.ENFRIANDOSE }}>● Enfriándose</span><span className="text-[#888]">: última op entre {umbral.activa} y {umbral.dormida} días.</span></p>
            <p><span style={{ color: ESTADO_COLOR.DORMIDA }}>● Dormida</span><span className="text-[#888]">: operó alguna vez, pero hace más de {umbral.dormida} días.</span></p>
            <p><span style={{ color: ESTADO_COLOR.NUEVA }}>● Nueva</span><span className="text-[#888]">: nunca operó.</span></p>
            <p className="mt-1.5 text-[#888]"><span className="text-[#d0d0d0]">Sin AuM</span>: cuenta con AuM = $0 en el último snapshot.</p>
            <p className="text-[#888]"><span className="text-[#d0d0d0]">Sin operar (año)</span>: sin operaciones en el año calendario en curso.</p>
            <p className="mt-1.5 text-[#666]">&quot;Operar&quot; = compra / venta / suscripción-rescate FCI / cauciones. Los días se cuentan contra la última operación real (cualquier antigüedad).</p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 overflow-hidden">
        {/* IZQ — Estado comercial (todos) */}
        <div className="min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">Estado comercial</span>
            {nivelSel && (
              <span className="text-[10px] text-[#ff9900] font-mono inline-flex items-center gap-1">
                · {nivelSel}
                <button onClick={() => setNivelSel(null)} className="text-[#888] hover:text-[#ff9900]" title="Quitar filtro de nivel">×</button>
              </span>
            )}
            <span className="text-[10px] text-[#888] font-mono">{ordenados.length}</span>
            <div className="ml-auto inline-flex border border-[#2a2a2a] divide-x divide-[#2a2a2a]">
              {(["aum", "dias"] as const).map((s) => (
                <button key={s} onClick={() => setSort(s)}
                  className={"px-2 py-0.5 text-[9px] uppercase tracking-wider " + (sort === s ? "bg-[#ff9900] text-black" : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")}>
                  {s === "aum" ? "AuM" : "Días"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[#080808] z-10 text-[9px] uppercase tracking-widest text-[#666]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[#1a1a1a]">Cuenta</th>
                  <th className="px-2 py-1.5 text-left border-b border-[#1a1a1a]">Estado</th>
                  <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">Días</th>
                  <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">AuM</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((c) => (
                  <tr key={c.id_cuenta} className="border-t border-[#111] hover:bg-[#0e0e0e]">
                    <td className="px-3 py-1.5 text-[#d0d0d0] truncate max-w-[220px]" title={c.denominacion}>
                      <span className="text-[#666]">[{c.id_cuenta}]</span> {c.denominacion}
                    </td>
                    <td className="px-2 py-1.5"><EstadoBadge estado={c.estado} /></td>
                    <td className="px-2 py-1.5 text-right text-[#888]">{c.dias_sin_operar ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-[#ff9900]">{fmtAum(c.aum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* DER — Distribución por nivel (arriba, click = filtra clientes) + Riesgo de churn (abajo) */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
          <div className="flex-[2_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">Distribución por nivel 1</span>
              <span className="text-[10px] text-[#888] font-mono">{porNivel.length}</span>
              <span className="ml-auto text-[9px] text-[#666]">click = filtra clientes</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[#080808] z-10 text-[9px] uppercase tracking-widest text-[#666]">
                  <tr>
                    <th className="px-3 py-1.5 text-left border-b border-[#1a1a1a]">Nivel 1</th>
                    <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">#</th>
                    <th className="px-2 py-1.5 text-right border-b border-[#1a1a1a]">Sin oper.</th>
                    <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">AuM</th>
                  </tr>
                </thead>
                <tbody>
                  {porNivel.map((n) => {
                    const active = nivelSel === n.nivel;
                    return (
                      <tr
                        key={n.nivel}
                        onClick={() => setNivelSel(active ? null : n.nivel)}
                        className={
                          "border-t border-[#111] cursor-pointer transition-colors " +
                          (active ? "bg-[#ff9900]/10" : "hover:bg-[#0e0e0e]")
                        }
                        title="Click: filtrar la tabla de Estado comercial por este nivel"
                      >
                        <td className="px-3 py-1.5 text-[#d0d0d0] truncate max-w-[180px]" title={n.nivel}>{n.nivel}</td>
                        <td className="px-2 py-1.5 text-right text-[#888]">{n.n}</td>
                        <td className="px-2 py-1.5 text-right text-[#ff5d6c]">{n.sinOperar}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-[#ff9900]">{fmtAum(n.aum)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex-[3_1_0%] min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff5d6c]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[#ff5d6c] tracking-wide uppercase">Riesgo de churn</span>
              <span className="text-[10px] text-[#888] font-mono">{churn.length}</span>
              <span className="ml-auto text-[9px] text-[#666]">enfriándose / dormidas · por AuM</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {churn.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[#555]">Sin clientes en riesgo. 👍</div>
              ) : (
                <table className="w-full text-[11px] font-mono tabular-nums">
                  <tbody>
                    {churn.map((c) => (
                      <tr key={c.id_cuenta} className="border-t border-[#111] hover:bg-[#0e0e0e]">
                        <td className="px-3 py-1.5 text-[#d0d0d0] truncate max-w-[200px]" title={c.denominacion}>
                          <span className="text-[#666]">[{c.id_cuenta}]</span> {c.denominacion}
                        </td>
                        <td className="px-2 py-1.5"><EstadoBadge estado={c.estado} /></td>
                        <td className="px-2 py-1.5 text-right text-[#888]">{c.dias_sin_operar ?? "—"}d</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-[#ff9900]">{fmtAum(c.aum)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const c = ESTADO_COLOR[estado] ?? "#666";
  return (
    <span className="inline-flex items-center gap-1 text-[10px]">
      <span className="w-1.5 h-1.5 inline-block" style={{ background: c }} />
      <span style={{ color: c }}>{ESTADO_LABEL[estado] ?? estado}</span>
    </span>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="flex-1 min-h-0 flex items-center justify-center text-[11px] text-[#555]">{msg}</div>;
}
