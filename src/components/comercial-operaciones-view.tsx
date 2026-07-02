"use client";

import { useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fmtMoney } from "@/lib/fmt-money";
import { exportToXlsx, timestampSuffix } from "@/lib/xlsx-export";

import { ComercialInforme } from "./comercial-informe-view";
import { CobrosFuturosView } from "./cobros-futuros-view";
import { ComercialControlView } from "./comercial-control-view";

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
  operador_nombre: string | null;
  telefono: string | null;
  email: string | null;
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
  referido: string | null;
};
type Cliente = {
  id_cuenta: string;
  denominacion: string;
  aum: number;
  volumen_ytd: number;
  ficha: Ficha;
};
type OperadorResp = { operador: string; moneda: string; resumen: Resumen; clientes: Cliente[] };
// Cliente que operó en el período de la barra clickeada (interactividad del chart).
type ClientePeriodo = {
  id_cuenta: string;
  denominacion: string;
  aum: number;
  volumen_periodo: number;
  ficha: Ficha;
};
type ClientesPeriodoResp = { clientes: ClientePeriodo[] };
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
// Montos: formato compacto compartido (M/MM/B), unificado con el resto de Comercial.
const fmtAum = fmtMoney;
// Variante para mostrar EXPLÍCITAMENTE en USD (cupo): "$1,2 M" → "USD 1,2 M".
// Reemplaza el "$" hardcodeado de fmtMoney por "USD " para que la mesa vea
// la moneda sin confundir con ARS.
const fmtUsd = (n: number | null | undefined): string => {
  const s = fmtAum(n);
  return s === "—" ? s : "USD " + s.replace("$", "").trimStart();
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

// Rango [desde, hasta] ISO que cubre un bucket del chart (para la tabla interactiva:
// click en una barra → clientes que operaron en ese día / esa semana / ese mes).
function rangoDeBucket(key: string, agg: AggKey): { desde: string; hasta: string } {
  if (agg === "MENSUAL") {
    const [y, m] = key.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { desde: `${key}-01`, hasta: `${key}-${String(last).padStart(2, "0")}` };
  }
  if (agg === "SEMANAL") {
    const d = new Date(key + "T00:00:00Z");
    return { desde: key, hasta: new Date(d.getTime() + 6 * 86400000).toISOString().slice(0, 10) };
  }
  return { desde: key, hasta: key };
}

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
  ["operador_nombre", "Operador"],
  ["telefono", "Teléfono"], ["email", "Email"],
  ["nivel_1", "Nivel 1"], ["nivel_2", "Nivel 2"], ["nivel_3", "Nivel 3"],
  ["nivel_4", "Nivel 4"], ["nivel_5", "Nivel 5"],
  ["primer_contacto_comercial", "1er contacto"], ["riesgo_la_ft", "Riesgo LA/FT"],
  ["division", "División"], ["adc", "ADC"], ["dma", "DMA"], ["referido", "Referido"],
];

// Sub-vistas de COMERCIAL (sub-nav arriba-izquierda).
type SubView = "portfolio" | "analisis" | "informe" | "cobros_futuros" | "control_comercial";

// Estado comercial: color + label para las badges de la vista Análisis.
const ESTADO_COLOR: Record<string, string> = {
  ACTIVA: "#3fbf6f", ENFRIANDOSE: "#ff9900", DORMIDA: "#ff5d6c", NUEVA: "#5fa8d0",
};
const ESTADO_LABEL: Record<string, string> = {
  ACTIVA: "Activa", ENFRIANDOSE: "Enfriándose", DORMIDA: "Dormida", NUEVA: "Sin Operaciones",
};
type AnalisisCliente = {
  id_cuenta: string;
  denominacion: string;
  telefono: string | null;
  aum: number;
  ultima_op: string | null;
  dias_sin_operar: number | null;
  estado: string;
  opero_ytd: boolean;
  opero_mtd: boolean;
  // Cupo de fondeo del custodio — SIEMPRE en USD al MEP del día (decisión de
  // producto), independiente del toggle ARS/USD global. null si no hay carga.
  cupo_transaccional_usd: number | null;
  cupo_usado_usd: number | null;
  nivel_1: string | null;
  nivel_2: string | null;
  nivel_3: string | null;
  nivel_4: string | null;
  nivel_5: string | null;
};

// `operador` (email) lo controla el selector que vive en la barra de tabs de
// operaciones-view.tsx (margen superior derecho) → llega como prop.
// Query-string de los filtros madre nivel_1/nivel_3/referido (vacío = sin filtro).
// Se appendea a cada fetch comercial para que el backend cruce el scope.
// Query-params REPETIDOS para un filtro multi-valor: ?key=a&key=b (= ANY en el backend).
const arrQS = (key: string, vals: string[]) =>
  (vals ?? []).map((v) => `&${key}=${encodeURIComponent(v)}`).join("");
const nivelQS = (nivel1: string[], nivel2: string[], nivel3: string[], referido: string[],
                 nivel4: string[] = [], nivel5: string[] = []) =>
  arrQS("nivel_1", nivel1) + arrQS("nivel_2", nivel2) + arrQS("nivel_3", nivel3)
  + arrQS("nivel_4", nivel4) + arrQS("nivel_5", nivel5) + arrQS("referido", referido);

export function ComercialOperacionesView(
  { operador, moneda = "ARS", nivel1 = [], nivel2 = [], nivel3 = [], nivel4 = [], nivel5 = [], referido = [],
    controlComercial = false }:
  { operador: string[]; moneda?: "ARS" | "USD"; nivel1?: string[]; nivel2?: string[]; nivel3?: string[];
    nivel4?: string[]; nivel5?: string[]; referido?: string[]; controlComercial?: boolean },
) {
  const nQS = nivelQS(nivel1, nivel2, nivel3, referido, nivel4, nivel5);
  const opQS = arrQS("operador", operador);
  const [subview, setSubview] = usePersistedState<SubView>("comercial.subview", "portfolio");
  // Si el user no tiene permiso de Control Comercial pero quedó parado ahí (estado
  // persistido), lo devolvemos a Portfolio → nunca ve la vista restringida.
  useEffect(() => {
    if (subview === "control_comercial" && !controlComercial) setSubview("portfolio");
  }, [subview, controlComercial, setSubview]);
  // Corte = HASTA de la vista (Informe + Análisis). Vacío = hoy (live).
  const [fechaCorte, setFechaCorte] = useState<string>("");
  // Inicio del período (Desde). Vacío = mes del corte (comportamiento viejo). Si se setea,
  // las columnas MES (volumen/arancel/ctas ops) pasan a ser la suma de [Desde, Hasta].
  const [desdeCorte, setDesdeCorte] = useState<string>("");
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [metric, setMetric] = usePersistedState<"volumen" | "aum">("comercial.metric", "volumen");
  const [serie, setSerie] = useState<SeriePoint[]>([]);
  const [portafolio, setPortafolio] = useState<Portafolio | null>(null);
  const [portTab, setPortTab] = usePersistedState<PortTab>("comercial.portTab", "tenencia");
  const [operaciones, setOperaciones] = useState<Operacion[]>([]);
  const [loadingOps, setLoadingOps] = useState(false);
  const [fichaTab, setFichaTab] = useState<"datos">("datos");
  const [agg, setAgg] = usePersistedState<AggKey>("comercial.agg", "DIARIO");
  const [rango, setRango] = usePersistedState<RangoKey>("comercial.rango", "YTD");
  const [rangoOffset, setRangoOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  // Interactividad chart→tabla: barra clickeada + clientes que operaron en ese período.
  const [selBar, setSelBar] = useState<{ key: string; desde: string; hasta: string } | null>(null);
  const [periodo, setPeriodo] = useState<ClientePeriodo[]>([]);
  const [loadingPeriodo, setLoadingPeriodo] = useState(false);
  const [errPeriodo, setErrPeriodo] = useState<string | null>(null);
  const [loadingSerie, setLoadingSerie] = useState(false);
  const [loadingPort, setLoadingPort] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [qCuenta, setQCuenta] = useState("");

  // Búsqueda por cuenta/nombre dentro de los clientes del operador (no cambia el scope).
  const clientesFiltrados = useMemo(() => {
    const q = qCuenta.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) => c.id_cuenta.toLowerCase().includes(q) || c.denominacion.toLowerCase().includes(q),
    );
  }, [clientes, qCuenta]);

  // Mismo filtro de búsqueda para la tabla en modo "período" (barra clickeada).
  const periodoFiltrado = useMemo(() => {
    const q = qCuenta.trim().toLowerCase();
    if (!q) return periodo;
    return periodo.filter(
      (c) => c.id_cuenta.toLowerCase().includes(q) || c.denominacion.toLowerCase().includes(q),
    );
  }, [periodo, qCuenta]);

  // Resumen + clientes del operador (una pasada). Limpia el cliente elegido.
  useEffect(() => {
    if (!operador) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setSelCuenta(null);
    void (async () => {
      try {
        const fQS = (fechaCorte ? `&fecha=${fechaCorte}` : "") + (desdeCorte ? `&desde=${desdeCorte}` : "");
        const d = await getJson<OperadorResp>(
          `/api/operaciones/comercial/operador?moneda=${moneda}${opQS}${nQS}${fQS}`,
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
  }, [opQS, moneda, nQS, fechaCorte, desdeCorte]);

  // Serie del gráfico: operador completo o, si hay cliente, esa cuenta.
  useEffect(() => {
    if (!operador) return;
    let cancelled = false;
    setLoadingSerie(true);
    void (async () => {
      try {
        let q = `metric=${metric}&moneda=${moneda}${opQS}${nQS}`;
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
  }, [opQS, metric, selCuenta, moneda, nQS]);

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

  // Si cambia el scope/granularidad/rango, el período seleccionado deja de tener
  // sentido (las barras cambian) → limpiar la selección interactiva.
  useEffect(() => {
    setSelBar(null);
    setPeriodo([]);
    setErrPeriodo(null);
  }, [operador, moneda, nQS, agg, rango, rangoOffset, metric, selCuenta]);

  // Click en una barra del chart de volumen → tabla de clientes que operaron ese período.
  function onBarClick(data: unknown) {
    const key = (data as { payload?: { fecha?: string }; fecha?: string })?.payload?.fecha
      ?? (data as { fecha?: string })?.fecha;
    if (!key) return;
    if (selBar?.key === key) { setSelBar(null); setPeriodo([]); setErrPeriodo(null); return; }
    const { desde, hasta } = rangoDeBucket(key, agg);
    setSelBar({ key, desde, hasta });
    setErrPeriodo(null);
    setLoadingPeriodo(true);
    void (async () => {
      try {
        const q = `desde=${desde}&hasta=${hasta}&moneda=${moneda}${opQS}${nQS}`;
        const d = await getJson<ClientesPeriodoResp>(`/api/operaciones/comercial/clientes-por-fecha?${q}`);
        setPeriodo(Array.isArray(d.clientes) ? d.clientes : []);
      } catch (e) {
        setPeriodo([]);
        setErrPeriodo(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingPeriodo(false);
      }
    })();
  }

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

  // ── Export a Excel (item 4) ──────────────────────────────────────────────
  const dlClientes = () => void exportToXlsx({
    filename: `comercial-clientes-${timestampSuffix()}.xlsx`,
    // Volcamos TODA la ficha (no solo cuenta/AuM/YTD): la ficha ya viaja completa
    // en cada cliente. Las columnas de ficha se generan de FICHA_DATOS → mismo set
    // y orden que la ficha en pantalla (queda siempre sincronizado).
    sheets: [{ name: "Clientes", rows: clientesFiltrados.map((c) => ({
      ...c.ficha,
      id_cuenta: c.id_cuenta, denominacion: c.denominacion,
      aum: c.aum, volumen_ytd: c.volumen_ytd,
    })), columns: [
      { header: "Cuenta", key: "id_cuenta", format: "text", width: 10 },
      { header: "Cliente", key: "denominacion", format: "text", width: 32 },
      { header: "AuM", key: "aum", format: "currency", width: 16 },
      { header: "Vol. YTD", key: "volumen_ytd", format: "currency", width: 16 },
      ...FICHA_DATOS.map(([k, label]) => ({
        header: label, key: k as string, format: "text" as const, width: 18,
      })),
    ] }],
  });
  const dlPortafolio = () => void exportToXlsx({
    filename: `comercial-${portTab}-${timestampSuffix()}.xlsx`,
    sheets: portTab === "tenencia"
      ? [{ name: "Tenencia", rows: portafolio?.posiciones ?? [], columns: [
          { header: "Unidad", key: "unidad", format: "text", width: 32 },
          { header: "Valuación", key: "valuacion", format: "currency", width: 16 },
          { header: "%", key: "pct", format: "percent" },
        ] }]
      : [{ name: "Operaciones", rows: operaciones, columns: [
          { header: "Fecha", key: "fecha", format: "text", width: 12 },
          { header: "Categoría", key: "categoria", format: "text", width: 14 },
          { header: "Ticker", key: "ticker", format: "text", width: 14 },
          { header: "Cantidad", key: "cantidad", format: "number" },
          { header: "Precio", key: "precio", format: "number" },
          { header: "Importe", key: "importe", format: "currency", width: 16 },
          { header: "Moneda", key: "moneda", format: "text", width: 8 },
        ] }],
  });

  return (
    <div className="h-full flex flex-col min-h-0 bg-[var(--t-panel)] text-[var(--t-text)] overflow-hidden">

      {/* ── HEADER: sub-nav (izq) + KPIs generales (der) ─────────────────── */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {([["portfolio", "Portfolio & Operaciones"], ["analisis", "Análisis Comercial"], ["cobros_futuros", "Cobros Futuros"], ["informe", "Informe"], ...(controlComercial ? [["control_comercial", "Control Comercial"] as [SubView, string]] : [])] as [SubView, string][]).map(
            ([v, label]) => (
              <button
                key={v}
                onClick={() => setSubview(v)}
                className={
                  "px-3 py-1 text-[11px] font-semibold tracking-wide " +
                  (subview === v ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-transparent text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                }
              >
                {label}
              </button>
            ),
          )}
        </div>
        {/* Fecha de corte ÚNICA: Informe + Análisis se recalculan a esta fecha. Vacío = hoy. */}
        <label className={"inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] " + ((fechaCorte || desdeCorte) ? "border-[var(--t-accent)] bg-[var(--t-accent)]/10" : "border-[var(--t-border-2)] bg-[var(--t-panel)]")} title="Período Desde/Hasta: TOTAL acumula hasta HASTA; las columnas MES (volumen/arancel/ctas ops) se calculan en [Desde, Hasta]. AuM = snapshot a HASTA. Vacío = hoy / mes del corte.">
          <span className="text-[10px] uppercase tracking-widest text-[var(--t-text-muted)]">Desde</span>
          {/* Sin min/max en el DOM: las restricciones cruzadas (Desde≤Hasta) + max=hoy hacían
              que el input nativo clampee a HOY mientras tipeás. El orden lo resuelve el backend. */}
          <input type="date" value={desdeCorte}
            onChange={(e) => setDesdeCorte(e.target.value)}
            className="bg-transparent text-[11px] tabular-nums text-[var(--t-text)] outline-none" />
          <span className="text-[10px] uppercase tracking-widest text-[var(--t-text-muted)]">Hasta</span>
          <input type="date" value={fechaCorte}
            onChange={(e) => setFechaCorte(e.target.value)}
            className="bg-transparent text-[11px] tabular-nums text-[var(--t-text)] outline-none" />
          {(fechaCorte || desdeCorte) && <button onClick={() => { setFechaCorte(""); setDesdeCorte(""); }} title="Volver a hoy" className="text-[10px] text-[var(--t-accent)] hover:underline">hoy</button>}
        </label>
        {loading && <span className="text-[9px] text-[var(--t-text-dim)]">cargando…</span>}
        {err && <span className="text-[9px] text-[#ff7777]">{err}</span>}
        {subview !== "informe" && (
          <div className="ml-auto flex items-center gap-3">
            <KpiChip label="AUM" value={resumen ? fmtAum(resumen.aum_gestionado) : "—"} />
            <KpiChip label="CLIENTES" value={resumen ? fmtN(resumen.n_clientes) : "—"} />
            <KpiChip label="VOL. MTD" value={resumen ? fmtAum(resumen.volumen_mtd) : "—"} />
            <KpiChip label="VOL. YTD" value={resumen ? fmtAum(resumen.volumen_ytd) : "—"} />
          </div>
        )}
      </div>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      {subview === "informe" && <ComercialInforme moneda={moneda} fecha={fechaCorte} desde={desdeCorte} />}
      {subview === "control_comercial" && controlComercial && <ComercialControlView moneda={moneda} />}
      {/* CobrosFuturos (acreencias, Mongo) sigue siendo single → toma el 1er valor de cada filtro. */}
      {subview === "cobros_futuros" && <CobrosFuturosView operador={operador[0] ?? "__todos__"} moneda={moneda} nivel1={nivel1[0] ?? ""} nivel2={nivel2[0] ?? ""} nivel3={nivel3[0] ?? ""} referido={referido[0] ?? ""} />}
      {subview === "analisis" && <AnalisisComercial operador={operador} moneda={moneda} nivel1={nivel1} nivel2={nivel2} nivel3={nivel3} nivel4={nivel4} nivel5={nivel5} referido={referido} fecha={fechaCorte} desde={desdeCorte} />}
      {subview === "portfolio" && (
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">

        {/* IZQUIERDA: gráfico (chico) + ficha con tabs */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">

          {/* GRÁFICO DE EVOLUCIÓN */}
          <div className="flex-[3_1_0%] min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
                {metric === "aum" ? "AUM" : "Volumen operado"} · ARS
              </span>
              {visDesde && visHasta && (
                <span className="text-[9px] text-[var(--t-text-muted)] font-mono">
                  {fmtFechaCorta(visDesde)} → {fmtFechaCorta(visHasta)}
                </span>
              )}
              {serieRango.length > 0 && (
                <span className="text-[10px] font-mono">
                  <span className="text-[var(--t-text-muted)] uppercase tracking-wider">
                    {metric === "aum" ? "Último: " : "Total período: "}
                  </span>
                  <span className="text-[var(--t-accent)] font-semibold">{fmtAum(resumenSerie)}</span>
                </span>
              )}
              {cliente && (
                <span className="text-[10px] text-[var(--t-text-dim)] font-mono truncate max-w-[35%]">
                  · {cliente.denominacion}
                  <button
                    onClick={() => setSelCuenta(null)}
                    className="ml-1 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] text-[12px] leading-none"
                    title="Volver a la cartera del operador"
                  >×</button>
                </span>
              )}
              {loadingSerie && <span className="text-[9px] text-[var(--t-text-dim)]">cargando…</span>}

              {/* Volumen / AuM */}
              <div className="ml-auto inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                {(["volumen", "aum"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={
                      "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                      (metric === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                    }
                  >
                    {m === "volumen" ? "Volumen" : "AuM"}
                  </button>
                ))}
              </div>
              {/* Agregación */}
              <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                {(["DIARIO", "SEMANAL", "MENSUAL"] as AggKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setAgg(k)}
                    className={
                      "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                      (agg === k ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
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
                  className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
                >◀</button>
                <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                  {(["1W", "1M", "3M", "6M", "YTD", "1A", "ALL"] as RangoKey[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => { setRango(k); setRangoOffset(0); }}
                      className={
                        "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                        (rango === k ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
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
                  className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
                >▶</button>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-2">
              {chartData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">
                  Sin datos de {metric === "aum" ? "AuM" : "volumen"} en este rango.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {metric === "aum" ? (
                    // AuM es saldo continuo → línea.
                    <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
                      <CartesianGrid stroke="var(--t-border)" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                        axisLine={{ stroke: "var(--t-border-2)" }}
                        tickLine={false}
                        tickFormatter={(v: string) => fmtBucket(v, agg)}
                        interval={tickInterval}
                        angle={-35}
                        textAnchor="end"
                        height={32}
                        minTickGap={4}
                      />
                      <YAxis
                        tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                        axisLine={{ stroke: "var(--t-border-2)" }}
                        tickLine={false}
                        tickFormatter={(v) => fmtAum(Number(v))}
                        width={56}
                        // AuM no arranca en 0: zoom al rango real (±2%) para que la
                        // variación se vea y no quede una línea plana arriba.
                        domain={[
                          (min: number) => Math.floor(min * 0.98),
                          (max: number) => Math.ceil(max * 1.02),
                        ]}
                        tickCount={6}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{ background: "var(--t-surface)", border: "1px solid var(--t-border-2)", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                        labelStyle={{ color: "var(--t-text-dim)" }}
                        itemStyle={{ color: "var(--t-text)" }}
                        labelFormatter={(v) => fmtBucket(String(v), agg)}
                        formatter={(v) => [fmtAum(Number(v)), "AuM"]}
                      />
                      <Line type="monotone" dataKey="valor" stroke="var(--t-brand)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  ) : (
                    // Volumen es flujo → barras.
                    <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 20, left: 8 }}>
                      <CartesianGrid stroke="var(--t-border)" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                        axisLine={{ stroke: "var(--t-border-2)" }}
                        tickLine={false}
                        tickFormatter={(v: string) => fmtBucket(v, agg)}
                        interval={tickInterval}
                        angle={-35}
                        textAnchor="end"
                        height={32}
                        minTickGap={4}
                      />
                      <YAxis
                        tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                        axisLine={{ stroke: "var(--t-border-2)" }}
                        tickLine={false}
                        tickFormatter={(v) => fmtAum(Number(v))}
                        width={56}
                      />
                      <Tooltip
                        cursor={{ fill: "color-mix(in srgb, var(--t-text) 8%, transparent)" }}
                        contentStyle={{ background: "var(--t-surface)", border: "1px solid var(--t-border-2)", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                        labelStyle={{ color: "var(--t-text-dim)" }}
                        itemStyle={{ color: "var(--t-text)" }}
                        labelFormatter={(v) => fmtBucket(String(v), agg)}
                        formatter={(v) => [fmtAum(Number(v)), "Volumen"]}
                      />
                      <Bar
                        dataKey="valor"
                        fill="var(--t-brand)"
                        maxBarSize={40}
                        isAnimationActive={false}
                        onClick={onBarClick}
                        cursor="pointer"
                      >
                        {chartData.map((d) => (
                          <Cell
                            key={d.fecha}
                            fill={selBar?.key === d.fecha ? "var(--t-accent)" : "var(--t-brand)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* FICHA DEL CLIENTE (con tabs) — alineada con el portafolio (40%) */}
          <div className="flex-[2_1_0%] min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">Ficha</span>
              {cliente && (
                <span className="text-[10px] text-[var(--t-text-dim)] font-mono truncate">
                  [{cliente.id_cuenta}] {cliente.ficha.denominacion || cliente.denominacion}
                </span>
              )}
              <div className="ml-auto inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                {(["datos"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFichaTab(t)}
                    className={
                      "px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                      (fichaTab === t ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                    }
                  >
                    {t === "datos" ? "Datos" : t}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-3">
              {!cliente ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)] text-center">
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
          <div className="flex-[3_1_0%] min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">Clientes</span>
              <input
                value={qCuenta}
                onChange={(e) => setQCuenta(e.target.value)}
                placeholder="buscar cuenta o nombre…"
                className="ml-2 flex-1 max-w-[220px] bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-2 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none"
              />
              {selBar && (
                <button
                  onClick={() => { setSelBar(null); setPeriodo([]); }}
                  className="ml-auto inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10"
                  title="Volver a la vista anual (limpiar período)"
                >
                  {fmtBucket(selBar.key, agg)} ✕
                </button>
              )}
              <span className={(selBar ? "" : "ml-auto ") + "text-[10px] text-[var(--t-text-dim)] font-mono"}>
                {(selBar ? periodoFiltrado : clientesFiltrados).length}
              </span>
              <DownloadBtn onClick={dlClientes} />
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                  <tr>
                    <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cuenta</th>
                    <th className="px-2 py-1.5 text-right border-b border-[var(--t-border)]">AuM</th>
                    <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">
                      {selBar ? `Vol. ${fmtBucket(selBar.key, agg)}` : "Vol. YTD"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {selBar ? (
                    <>
                      {loadingPeriodo && (
                        <tr><td colSpan={3} className="text-center text-[var(--t-text-muted)] py-6">Cargando…</td></tr>
                      )}
                      {!loadingPeriodo && errPeriodo && (
                        <tr><td colSpan={3} className="text-center text-[var(--t-neg)] py-6">Error al cargar: {errPeriodo}</td></tr>
                      )}
                      {!loadingPeriodo && !errPeriodo && periodoFiltrado.length === 0 && (
                        <tr><td colSpan={3} className="text-center text-[var(--t-text-muted)] py-6">Nadie operó en este período.</td></tr>
                      )}
                      {!loadingPeriodo && periodoFiltrado.map((c) => {
                        const active = c.id_cuenta === selCuenta;
                        return (
                          <tr
                            key={c.id_cuenta}
                            onClick={() => setSelCuenta(active ? null : c.id_cuenta)}
                            className={
                              "border-t border-[var(--t-border)] cursor-pointer transition-colors " +
                              (active ? "bg-[var(--t-accent)]/10" : "hover:bg-[var(--t-surface)]")
                            }
                            title="Click: ficha + tenencia de este cliente"
                          >
                            <td className="px-3 py-1.5 text-[var(--t-text)] truncate max-w-[260px]" title={c.denominacion}>
                              <span className="text-[var(--t-text-muted)]">[{c.id_cuenta}]</span> {c.denominacion}
                            </td>
                            <td className="px-2 py-1.5 text-right font-semibold text-[var(--t-accent)]">{fmtAum(c.aum)}</td>
                            <td className="px-3 py-1.5 text-right text-[var(--t-text)]">{fmtAum(c.volumen_periodo)}</td>
                          </tr>
                        );
                      })}
                    </>
                  ) : (
                    <>
                      {clientesFiltrados.length === 0 && !loading && (
                        <tr><td colSpan={3} className="text-center text-[var(--t-text-muted)] py-6">Sin clientes.</td></tr>
                      )}
                      {clientesFiltrados.map((c) => {
                        const active = c.id_cuenta === selCuenta;
                        return (
                          <tr
                            key={c.id_cuenta}
                            onClick={() => setSelCuenta(active ? null : c.id_cuenta)}
                            className={
                              "border-t border-[var(--t-border)] cursor-pointer transition-colors " +
                              (active ? "bg-[var(--t-accent)]/10" : "hover:bg-[var(--t-surface)]")
                            }
                            title="Click: ficha + tenencia + gráfico de este cliente"
                          >
                            <td className="px-3 py-1.5 text-[var(--t-text)] truncate max-w-[260px]" title={c.denominacion}>
                              <span className="text-[var(--t-text-muted)]">[{c.id_cuenta}]</span> {c.denominacion}
                            </td>
                            <td className="px-2 py-1.5 text-right font-semibold text-[var(--t-accent)]">{fmtAum(c.aum)}</td>
                            <td className="px-3 py-1.5 text-right text-[var(--t-text)]">{fmtAum(c.volumen_ytd)}</td>
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* PORTAFOLIO — tabs Tenencia / Operaciones del cliente */}
          <div className="flex-[2_1_0%] min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">Portafolio</span>
              {portTab === "tenencia" && portafolio?.fecha_snapshot && (
                <span className="text-[9px] text-[var(--t-text-muted)] font-mono">{portafolio.fecha_snapshot}</span>
              )}
              {(loadingPort || loadingOps) && <span className="text-[9px] text-[var(--t-text-dim)]">cargando…</span>}
              {portTab === "tenencia" && portafolio && portafolio.posiciones.length > 0 && (
                <span className="text-[10px] text-[var(--t-text-dim)] font-mono">Total {fmtAum(portafolio.total)}</span>
              )}
              {portTab === "operaciones" && cliente && operaciones.length > 0 && (
                <span className="text-[10px] text-[var(--t-text-dim)] font-mono">{operaciones.length} ops</span>
              )}
              <div className="ml-auto inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                {(["tenencia", "operaciones"] as PortTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPortTab(t)}
                    className={
                      "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                      (portTab === t ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                    }
                  >
                    {t === "tenencia" ? "Tenencia" : "Operaciones"}
                  </button>
                ))}
              </div>
              <DownloadBtn onClick={dlPortafolio} />
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {!cliente ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)] text-center">
                  Seleccioná un cliente para ver su {portTab === "operaciones" ? "actividad" : "tenencia"}.
                </div>
              ) : portTab === "tenencia" ? (
                !portafolio || portafolio.posiciones.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">
                    {loadingPort ? "cargando…" : "Sin posiciones."}
                  </div>
                ) : (
                  <table className="w-full text-[11px] font-mono tabular-nums">
                    <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                      <tr>
                        <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Unidad</th>
                        <th className="px-2 py-1.5 text-right border-b border-[var(--t-border)]">Valuación</th>
                        <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portafolio.posiciones.map((p) => (
                        <tr key={p.unidad} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                          <td className="px-3 py-1.5 text-[var(--t-text)] truncate max-w-[280px]" title={p.unidad}>{p.unidad}</td>
                          <td className="px-2 py-1.5 text-right font-semibold text-[var(--t-accent)]">{fmtAum(p.valuacion)}</td>
                          <td className="px-3 py-1.5 text-right text-[var(--t-text-dim)]">{p.pct.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              ) : operaciones.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">
                  {loadingOps ? "cargando…" : "Sin operaciones."}
                </div>
              ) : (
                <table className="w-full text-[10px] font-mono tabular-nums">
                  <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                    <tr>
                      <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Fecha</th>
                      <th className="px-2 py-1.5 text-left border-b border-[var(--t-border)]">Categ</th>
                      <th className="px-2 py-1.5 text-left border-b border-[var(--t-border)]">Ticker</th>
                      <th className="px-2 py-1.5 text-right border-b border-[var(--t-border)]">Cant</th>
                      <th className="px-2 py-1.5 text-right border-b border-[var(--t-border)]">Precio</th>
                      <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {operaciones.map((o) => {
                      const color = OP_CAT_COLOR[o.categoria] ?? "#666";
                      const imp = o.importe ?? 0;
                      return (
                        <tr key={o.comprobante} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                          <td className="px-3 py-1 text-[var(--t-text-dim)] whitespace-nowrap">{fmtFechaCorta(o.fecha.slice(0, 10))}</td>
                          <td className="px-2 py-1">
                            <span className="inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 inline-block shrink-0" style={{ background: color }} />
                              <span className="text-[var(--t-text-dim)] whitespace-nowrap">{OP_CAT_LABEL[o.categoria] ?? o.categoria}</span>
                            </span>
                          </td>
                          <td className="px-2 py-1 text-[var(--t-accent)] truncate max-w-[90px]" title={o.ticker ?? ""}>{o.ticker ?? "—"}</td>
                          <td className="px-2 py-1 text-right text-[var(--t-text)]">
                            {o.cantidad != null ? o.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
                          </td>
                          <td className="px-2 py-1 text-right text-[var(--t-text)]">
                            {o.precio != null ? o.precio.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
                          </td>
                          <td className={"px-3 py-1 text-right whitespace-nowrap " + (imp > 0 ? "text-[var(--t-pos)]" : imp < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]")}>
                            {o.importe != null ? fmtAum(o.importe) : "—"}
                            {o.moneda === "USD" && <span className="text-[var(--t-text-muted)] ml-0.5">u$s</span>}
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

function DownloadBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Descargar a Excel"
      className="text-[9px] tracking-wider text-[var(--t-text-dim)] hover:text-[var(--t-accent)] border border-[var(--t-border-2)] hover:border-[var(--t-accent)] px-1.5 py-0.5 uppercase"
    >
      ⬇ xls
    </button>
  );
}

function KpiChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-[11px] font-mono">
      <span className="text-[var(--t-text-muted)] tracking-wider">{label} </span>
      <span className="text-[var(--t-text)] font-semibold">{value}</span>
    </span>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-[var(--t-text-muted)] tracking-wide">{label}</span>
      <span className="text-[11px] font-mono text-[var(--t-text)] truncate" title={value ?? "—"}>
        {value ?? "—"}
      </span>
    </div>
  );
}

// ── Vista ANÁLISIS: estado comercial + riesgo de churn + distribución por nivel.
// Todo de un solo dataset (/comercial/analisis), scopeado al operador elegido.
function AnalisisComercial(
  { operador, moneda = "ARS", nivel1 = [], nivel2 = [], nivel3 = [], nivel4 = [], nivel5 = [], referido = [], fecha = "", desde = "" }:
  { operador: string[]; moneda?: "ARS" | "USD"; nivel1?: string[]; nivel2?: string[]; nivel3?: string[];
    nivel4?: string[]; nivel5?: string[]; referido?: string[]; fecha?: string; desde?: string },
) {
  const nQS = nivelQS(nivel1, nivel2, nivel3, referido, nivel4, nivel5);
  const opQS = arrQS("operador", operador);
  const [clientes, setClientes] = useState<AnalisisCliente[]>([]);
  const [loading, setLoading] = useState(false);
  type SortCol = "cuenta" | "estado" | "dias" | "aum" | "cupo_trans" | "cupo_usado";
  const [sortCol, setSortCol] = usePersistedState<SortCol>("comercial.analisis.sortCol", "aum");
  const [sortDir, setSortDir] = usePersistedState<"asc" | "desc">("comercial.analisis.sortDir", "desc");
  const [nivelSel, setNivelSel] = useState<string | null>(null);
  const [nivel3Sel, setNivel3Sel] = useState<string | null>(null);
  const [estadoSel, setEstadoSel] = useState<string | null>(null);

  // Orden lógico de Estado (Activa primero, Sin Operaciones al fondo).
  const ESTADO_ORDER: Record<string, number> = {
    ACTIVA: 0, ENFRIANDOSE: 1, DORMIDA: 2, NUEVA: 3,
  };

  const onSortClick = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      // Default por tipo: texto = asc, numérico = desc.
      setSortDir(col === "cuenta" || col === "estado" ? "asc" : "desc");
    }
  };

  const sortArrow = (col: SortCol) => (sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "");
  const [umbral, setUmbral] = useState<{ activa: number; dormida: number }>({ activa: 30, dormida: 90 });

  useEffect(() => {
    if (!operador) { setClientes([]); return; }
    let cancelled = false;
    setLoading(true);
    setNivelSel(null);
    setNivel3Sel(null);
    setEstadoSel(null);
    void (async () => {
      try {
        const fQS = (fecha ? `&fecha=${fecha}` : "") + (desde ? `&desde=${desde}` : "");
        const d = await getJson<{ clientes: AnalisisCliente[]; dias_activa?: number; dias_dormida?: number }>(
          `/api/operaciones/comercial/analisis?moneda=${moneda}${opQS}${nQS}${fQS}`,
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
  }, [opQS, moneda, nQS, fecha, desde]);

  const nivelDe = (c: AnalisisCliente) => c.nivel_1 || "(sin segmentar)";

  const counts = useMemo(() => {
    const c: Record<string, number> = { ACTIVA: 0, ENFRIANDOSE: 0, DORMIDA: 0, NUEVA: 0 };
    for (const x of clientes) c[x.estado] = (c[x.estado] ?? 0) + 1;
    return c;
  }, [clientes]);
  const sinAum = useMemo(() => clientes.filter((c) => c.aum <= 0).length, [clientes]);
  const sinOperarYtd = useMemo(() => clientes.filter((c) => !c.opero_ytd).length, [clientes]);

  // KPIs de cupo (USD al MEP del día), totales del operador — independientes
  // de los filtros de la tabla (mismo criterio que los counts de estado).
  const cupoTotales = useMemo(() => {
    let trans = 0;
    let usado = 0;
    for (const c of clientes) {
      if (c.cupo_transaccional_usd != null) trans += c.cupo_transaccional_usd;
      if (c.cupo_usado_usd != null) usado += c.cupo_usado_usd;
    }
    const libre = Math.max(0, trans - usado);
    const pct = trans > 0 ? (usado / trans) * 100 : null;
    return { trans, usado, libre, pct };
  }, [clientes]);

  // Distribución por nivel_1 — cuentas totales, activas del mes (operó en el mes
  // calendario) + % activas/total y AuM consolidado.
  const porNivel = useMemo(() => {
    const m = new Map<string, { nivel: string; aum: number; n: number; activas: number }>();
    for (const c of clientes) {
      const k = nivelDe(c);
      const cur = m.get(k) ?? { nivel: k, aum: 0, n: 0, activas: 0 };
      cur.aum += c.aum; cur.n += 1; if (c.opero_mtd) cur.activas += 1;
      m.set(k, cur);
    }
    return [...m.values()]
      .map((r) => ({ ...r, pctActivas: r.n > 0 ? (r.activas / r.n) * 100 : 0 }))
      .sort((a, b) => b.aum - a.aum);
  }, [clientes]);

  const nivel3De = (c: AnalisisCliente) => c.nivel_3 || "(sin nivel 3)";

  // Estado comercial — filtrado por nivel_1 (click en distribución) + nivel_3
  // (click en la tabla de Nivel 3) + estado. Los 3 filtros son aditivos.
  const ordenados = useMemo(() => {
    const matchEstado = (c: AnalisisCliente) => {
      if (!estadoSel) return true;
      if (estadoSel === "SIN_AUM") return c.aum <= 0;
      if (estadoSel === "SIN_OP_YTD") return !c.opero_ytd;
      return c.estado === estadoSel;
    };
    let arr = nivelSel ? clientes.filter((c) => nivelDe(c) === nivelSel) : [...clientes];
    if (nivel3Sel) arr = arr.filter((c) => nivel3De(c) === nivel3Sel);
    arr = arr.filter(matchEstado);

    // Nullable numeric comparator: los null siempre van al FONDO (sin importar dir).
    const cmpN = (a: number | null | undefined, b: number | null | undefined, dir: number): number => {
      const an = a ?? null; const bn = b ?? null;
      if (an === null && bn === null) return 0;
      if (an === null) return 1;
      if (bn === null) return -1;
      return dir * (an - bn);
    };

    const dir = sortDir === "asc" ? 1 : -1;
    const out = [...arr];
    out.sort((a, b) => {
      switch (sortCol) {
        case "cuenta": return dir * a.id_cuenta.localeCompare(b.id_cuenta, "es-AR", { numeric: true });
        case "estado": return dir * ((ESTADO_ORDER[a.estado] ?? 99) - (ESTADO_ORDER[b.estado] ?? 99));
        case "dias":   return cmpN(a.dias_sin_operar, b.dias_sin_operar, dir);
        case "aum":    return dir * (a.aum - b.aum);
        case "cupo_trans": return cmpN(a.cupo_transaccional_usd, b.cupo_transaccional_usd, dir);
        case "cupo_usado": return cmpN(a.cupo_usado_usd, b.cupo_usado_usd, dir);
        default: return 0;
      }
    });
    return out;
  }, [clientes, sortCol, sortDir, nivelSel, nivel3Sel, estadoSel]);

  // Desglose por nivel_3 — por default agrupa TODOS los clientes; si hay un
  // nivel_1 seleccionado (click en Distribución), se restringe a ese subset.
  // Click en una fila filtra el Estado comercial por ese nivel_3.
  const nivel3Det = useMemo(() => {
    type Acc = {
      n3: string;
      cupo_trans_usd: number;
      cupo_usado_usd: number;
      n_activas: number;
      n_enfriandose: number;
      aum: number;
      n: number;
    };
    const m = new Map<string, Acc>();
    for (const c of clientes) {
      if (nivelSel && nivelDe(c) !== nivelSel) continue;
      const k = nivel3De(c);
      const cur = m.get(k) ?? {
        n3: k, cupo_trans_usd: 0, cupo_usado_usd: 0,
        n_activas: 0, n_enfriandose: 0, aum: 0, n: 0,
      };
      cur.cupo_trans_usd += c.cupo_transaccional_usd ?? 0;
      cur.cupo_usado_usd += c.cupo_usado_usd ?? 0;
      if (c.estado === "ACTIVA") cur.n_activas += 1;
      if (c.estado === "ENFRIANDOSE") cur.n_enfriandose += 1;
      cur.aum += c.aum;
      cur.n += 1;
      m.set(k, cur);
    }
    return [...m.values()]
      .map((r) => ({ ...r, cupo_libre_usd: Math.max(0, r.cupo_trans_usd - r.cupo_usado_usd) }))
      .sort((a, b) => b.cupo_trans_usd - a.cupo_trans_usd);
  }, [clientes, nivelSel]);

  // ── Export a Excel (item 4) ──────────────────────────────────────────────
  const dlEstado = () => void exportToXlsx({
    filename: `comercial-estado-${timestampSuffix()}.xlsx`,
    sheets: [{ name: "Estado comercial", rows: ordenados.map((c) => ({
      id_cuenta: c.id_cuenta, denominacion: c.denominacion,
      estado: ESTADO_LABEL[c.estado] ?? c.estado, dias_sin_operar: c.dias_sin_operar,
      aum: c.aum, ultima_op: c.ultima_op, nivel_1: c.nivel_1, nivel_2: c.nivel_2, nivel_3: c.nivel_3,
      cupo_transaccional_usd: c.cupo_transaccional_usd,
      cupo_usado_usd: c.cupo_usado_usd,
    })), columns: [
      { header: "Cuenta", key: "id_cuenta", format: "text", width: 10 },
      { header: "Cliente", key: "denominacion", format: "text", width: 32 },
      { header: "Estado", key: "estado", format: "text", width: 16 },
      { header: "Días s/operar", key: "dias_sin_operar", format: "integer" },
      { header: "AuM", key: "aum", format: "currency", width: 16 },
      { header: "Cupo Trans. (USD)", key: "cupo_transaccional_usd", format: "currency", width: 16 },
      { header: "Cupo Usado (USD)", key: "cupo_usado_usd", format: "currency", width: 16 },
      { header: "Última op", key: "ultima_op", format: "text", width: 12 },
      { header: "Nivel 1", key: "nivel_1", format: "text", width: 18 },
      { header: "Nivel 2", key: "nivel_2", format: "text", width: 18 },
      { header: "Nivel 3", key: "nivel_3", format: "text", width: 18 },
    ] }],
  });
  const dlPorNivel = () => void exportToXlsx({
    filename: `comercial-distribucion-nivel1-${timestampSuffix()}.xlsx`,
    sheets: [{ name: "Distribución nivel 1", rows: porNivel, columns: [
      { header: "Nivel 1", key: "nivel", format: "text", width: 24 },
      { header: "Cuentas totales", key: "n", format: "integer" },
      { header: "Activas (mes)", key: "activas", format: "integer" },
      { header: "% activas", key: "pctActivas", format: "integer" },
      { header: "AuM", key: "aum", format: "currency", width: 16 },
    ] }],
  });
  const dlNivel3 = () => void exportToXlsx({
    filename: `comercial-nivel3-${timestampSuffix()}.xlsx`,
    sheets: [{ name: "Nivel 3", rows: nivel3Det, columns: [
      { header: "Nivel 3", key: "n3", format: "text", width: 22 },
      { header: "Cupo Trans. (USD)", key: "cupo_trans_usd", format: "currency", width: 18 },
      { header: "Cupo Libre (USD)", key: "cupo_libre_usd", format: "currency", width: 18 },
      { header: "Activas", key: "n_activas", format: "integer" },
      { header: "Enfriándose", key: "n_enfriandose", format: "integer" },
      { header: "AuM", key: "aum", format: "currency", width: 16 },
      { header: "# clientes", key: "n", format: "integer" },
    ] }],
  });

  if (!operador) return <Empty msg="Elegí un operador." />;
  if (loading && clientes.length === 0) return <Empty msg="cargando…" />;
  if (clientes.length === 0) return <Empty msg="Sin clientes." />;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 p-3 overflow-hidden">
      {/* Resumen por estado */}
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        {(["ACTIVA", "ENFRIANDOSE", "DORMIDA", "NUEVA"] as const).map((e) => (
          <button
            key={e}
            onClick={() => setEstadoSel((s) => (s === e ? null : e))}
            title="Filtrar la tabla por este estado"
            className={
              "inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] " +
              (estadoSel === e ? "border-[var(--t-accent)] bg-[var(--t-accent)]/10" : "border-[var(--t-border)] bg-[var(--t-panel)] hover:border-[var(--t-border-2)]")
            }
          >
            <span className="w-2 h-2 inline-block" style={{ background: ESTADO_COLOR[e] }} />
            <span className="text-[var(--t-text-dim)]">{ESTADO_LABEL[e]}</span>
            <span className="font-semibold tabular-nums text-[var(--t-text)]">{counts[e] ?? 0}</span>
          </button>
        ))}
        <button
          onClick={() => setEstadoSel((s) => (s === "SIN_AUM" ? null : "SIN_AUM"))}
          title="Filtrar: cuentas sin AuM"
          className={
            "inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] " +
            (estadoSel === "SIN_AUM" ? "border-[var(--t-accent)] bg-[var(--t-accent)]/10" : "border-[var(--t-border)] bg-[var(--t-panel)] hover:border-[var(--t-border-2)]")
          }
        >
          <span className="text-[var(--t-text-dim)]">Sin AuM</span>
          <span className="font-semibold tabular-nums text-[var(--t-text)]">{sinAum}</span>
        </button>
        <button
          onClick={() => setEstadoSel((s) => (s === "SIN_OP_YTD" ? null : "SIN_OP_YTD"))}
          title="Filtrar: sin operar en el año"
          className={
            "inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] " +
            (estadoSel === "SIN_OP_YTD" ? "border-[var(--t-accent)] bg-[var(--t-accent)]/10" : "border-[var(--t-border)] bg-[var(--t-panel)] hover:border-[var(--t-border-2)]")
          }
        >
          <span className="text-[var(--t-text-dim)]">Sin operar (año)</span>
          <span className="font-semibold tabular-nums text-[var(--t-text)]">{sinOperarYtd}</span>
        </button>

        {/* KPIs de cupo — totales del operador, SIEMPRE en USD al MEP del día. El selector de
            fecha de corte vive en el header global de la vista (maneja Informe + Análisis). */}
        <div className="ml-auto flex items-center gap-2">
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2 inline-flex flex-col gap-0.5" title="Cupo transaccional asignado por el custodio (suma USD).">
            <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-widest leading-none">Cupo trans.</span>
            <span className="text-[15px] font-semibold tabular-nums text-[var(--t-text)] leading-tight">{fmtUsd(cupoTotales.trans)}</span>
          </div>
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2 inline-flex flex-col gap-0.5" title="Cupo usado (suma USD).">
            <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-widest leading-none">Cupo usado</span>
            <span className="text-[15px] font-semibold tabular-nums text-[var(--t-text)] leading-tight">{fmtUsd(cupoTotales.usado)}</span>
          </div>
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2 inline-flex flex-col gap-0.5" title="% utilización = usado / transaccional.">
            <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-widest leading-none">% util.</span>
            <span className="text-[15px] font-semibold tabular-nums text-[var(--t-text)] leading-tight">
              {cupoTotales.pct != null ? `${cupoTotales.pct.toFixed(1)}%` : "—"}
            </span>
          </div>
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2 inline-flex flex-col gap-0.5" title="Cupo libre = transaccional − usado.">
            <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-widest leading-none">Cupo libre</span>
            <span className="text-[15px] font-semibold tabular-nums text-[var(--t-pos)] leading-tight">{fmtUsd(cupoTotales.libre)}</span>
          </div>

          {/* Ayuda: definiciones de los estados + umbrales (reales del backend) */}
          <div className="relative group">
          <span className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-[var(--t-border-2)] text-[var(--t-text-dim)] text-[10px] cursor-help group-hover:border-[var(--t-accent)] group-hover:text-[var(--t-accent)]">
            ?
          </span>
          <div className="hidden group-hover:block absolute right-0 top-5 z-50 w-[320px] border border-[var(--t-border-2)] bg-[var(--t-surface)] p-3 text-[10px] leading-relaxed shadow-lg">
            <div className="text-[var(--t-accent)] uppercase tracking-widest text-[9px] mb-1.5">Cómo se calcula</div>
            <p><span style={{ color: ESTADO_COLOR.ACTIVA }}>● Activa</span><span className="text-[var(--t-text-dim)]">: operó hace ≤ {umbral.activa} días.</span></p>
            <p><span style={{ color: ESTADO_COLOR.ENFRIANDOSE }}>● Enfriándose</span><span className="text-[var(--t-text-dim)]">: última op entre {umbral.activa} y {umbral.dormida} días.</span></p>
            <p><span style={{ color: ESTADO_COLOR.DORMIDA }}>● Dormida</span><span className="text-[var(--t-text-dim)]">: operó alguna vez, pero hace más de {umbral.dormida} días.</span></p>
            <p><span style={{ color: ESTADO_COLOR.NUEVA }}>● Sin Operaciones</span><span className="text-[var(--t-text-dim)]">: nunca operó.</span></p>
            <p className="mt-1.5 text-[var(--t-text-dim)]"><span className="text-[var(--t-text)]">Sin AuM</span>: cuenta con AuM = $0 en el último snapshot.</p>
            <p className="text-[var(--t-text-dim)]"><span className="text-[var(--t-text)]">Sin operar (año)</span>: sin operaciones en el año calendario en curso.</p>
            <p className="mt-1.5 text-[var(--t-text-muted)]">&quot;Operar&quot; = compra / venta / suscripción-rescate FCI / cauciones. Los días se cuentan contra la última operación real (cualquier antigüedad).</p>
          </div>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[11fr_9fr] gap-3 overflow-hidden">
        {/* IZQ — Estado comercial (todos) — 55%; las tablas de nivel ganan ~5% */}
        <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">Estado comercial</span>
            {nivelSel && (
              <span className="text-[10px] text-[var(--t-accent)] font-mono inline-flex items-center gap-1">
                · {nivelSel}
                <button onClick={() => { setNivelSel(null); setNivel3Sel(null); }} className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)]" title="Quitar filtro de nivel">×</button>
              </span>
            )}
            <span className="text-[10px] text-[var(--t-text-dim)] font-mono">{ordenados.length}</span>
            <span className="ml-auto text-[9px] text-[var(--t-text-muted)]">click en cualquier header para ordenar</span>
            <DownloadBtn onClick={dlEstado} />
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                <tr>
                  <th onClick={() => onSortClick("cuenta")}     className="px-3 py-1.5 text-left border-b border-[var(--t-border)] cursor-pointer select-none hover:text-[var(--t-accent)]">Cuenta{sortArrow("cuenta")}</th>
                  <th onClick={() => onSortClick("estado")}     className="px-2 py-1.5 text-left border-b border-[var(--t-border)] cursor-pointer select-none hover:text-[var(--t-accent)]">Estado{sortArrow("estado")}</th>
                  <th onClick={() => onSortClick("dias")}       className="px-2 py-1.5 text-right border-b border-[var(--t-border)] cursor-pointer select-none hover:text-[var(--t-accent)]">Días sin operar{sortArrow("dias")}</th>
                  <th onClick={() => onSortClick("aum")}        className="px-3 py-1.5 text-right border-b border-[var(--t-border)] cursor-pointer select-none hover:text-[var(--t-accent)]">AuM{sortArrow("aum")}</th>
                  <th onClick={() => onSortClick("cupo_trans")} className="px-2 py-1.5 text-right border-b border-[var(--t-border)] cursor-pointer select-none hover:text-[var(--t-accent)]" title="Cupo transaccional del custodio (USD al MEP).">Cupo Trans. (USD){sortArrow("cupo_trans")}</th>
                  <th onClick={() => onSortClick("cupo_usado")} className="px-2 py-1.5 text-right border-b border-[var(--t-border)] cursor-pointer select-none hover:text-[var(--t-accent)]" title="Cupo usado (USD al MEP).">Cupo Usado (USD){sortArrow("cupo_usado")}</th>
                </tr>
              </thead>
              <tbody>
                {ordenados.map((c) => (
                  <tr key={c.id_cuenta} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    <td className="px-3 py-1.5 text-[var(--t-text)] truncate max-w-[220px]" title={c.denominacion}>
                      <span className="text-[var(--t-text-muted)]">[{c.id_cuenta}]</span> {c.denominacion}
                    </td>
                    <td className="px-2 py-1.5"><EstadoBadge estado={c.estado} /></td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{c.dias_sin_operar ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-[var(--t-accent)]">{fmtAum(c.aum)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{c.cupo_transaccional_usd != null ? fmtUsd(c.cupo_transaccional_usd) : "—"}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{c.cupo_usado_usd != null ? fmtUsd(c.cupo_usado_usd) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* DER — Distribución por nivel (arriba, click = filtra clientes) + Riesgo de churn (abajo) */}
        <div className="min-h-0 flex flex-col gap-3 overflow-hidden">
          <div className="flex-[2_1_0%] min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
            {/* Barra fina: solo el botón de descarga (sin título — el nombre de
                columna ya lo dice). */}
            <div className="flex items-center px-3 py-1 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="ml-auto"><DownloadBtn onClick={dlPorNivel} /></span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 z-10 text-[9px] uppercase tracking-widest text-[var(--t-accent)]">
                  <tr>
                    <th className="px-3 py-1.5 text-left bg-[var(--t-surface)] border-b border-[var(--t-border-2)]">Nivel 1</th>
                    <th className="px-2 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]" title="Cuentas totales asignadas al segmento">Ctas. Tot.</th>
                    <th className="px-2 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]" title="Cuentas que operaron en el mes calendario actual">Activas</th>
                    <th className="px-2 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]" title="% activas sobre el total del segmento">%</th>
                    <th className="px-3 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]">AuM</th>
                  </tr>
                </thead>
                <tbody>
                  {porNivel.map((n) => {
                    const active = nivelSel === n.nivel;
                    return (
                      <tr
                        key={n.nivel}
                        onClick={() => {
                          // Cambiar de nivel_1 invalida el nivel_3 seleccionado
                          // (era de otro nivel_1) — siempre resetearlo.
                          setNivel3Sel(null);
                          setNivelSel(active ? null : n.nivel);
                        }}
                        className={
                          "border-t border-[var(--t-border)] cursor-pointer transition-colors " +
                          (active ? "bg-[var(--t-accent)]/10" : "hover:bg-[var(--t-surface)]")
                        }
                        title="Click: filtrar la tabla de Estado comercial por este nivel"
                      >
                        <td className="px-3 py-1.5 text-[var(--t-text)] truncate max-w-[180px]" title={n.nivel}>{n.nivel}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{n.n}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--t-pos)]">{n.activas}</td>
                        <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{n.pctActivas.toFixed(0)}%</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-[var(--t-accent)]">{fmtAum(n.aum)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex-[3_1_0%] min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
            {/* Barra fina: chips de filtro activos (si hay) + botón descarga. Sin título. */}
            <div className="flex items-center gap-2 px-3 py-1 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 min-h-[26px]">
              {nivelSel && <span className="text-[10px] text-[var(--t-accent)] font-mono truncate max-w-[160px]">· {nivelSel}</span>}
              {nivel3Sel && (
                <span className="text-[10px] text-[var(--t-accent)] font-mono inline-flex items-center gap-1">
                  · {nivel3Sel}
                  <button onClick={() => setNivel3Sel(null)} className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)]" title="Quitar filtro de nivel 3">×</button>
                </span>
              )}
              <span className="ml-auto"><DownloadBtn onClick={dlNivel3} /></span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              {nivel3Det.length === 0 ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">Sin datos.</div>
              ) : (
                <table className="w-full text-[11px] font-mono tabular-nums">
                  <thead className="sticky top-0 z-10 text-[9px] uppercase tracking-widest text-[var(--t-accent)]">
                    <tr>
                      <th className="px-3 py-1.5 text-left bg-[var(--t-surface)] border-b border-[var(--t-border-2)]">Nivel 3</th>
                      <th className="px-2 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]" title="Suma del cupo transaccional (USD al MEP) del segmento.">Cupo Trans. (USD)</th>
                      <th className="px-2 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]" title="Suma del cupo libre = transaccional − usado (USD).">Cupo Libre (USD)</th>
                      <th className="px-2 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]" title="Total de cuentas en este nivel 3 (todas, sin importar estado).">Cuentas</th>
                      <th className="px-2 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]" title="Cuentas con estado Activa.">Activas</th>
                      <th className="px-2 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]" title="Cuentas con estado Enfriándose.">Enfr.</th>
                      <th className="px-3 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]">AuM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nivel3Det.map((r) => {
                      const active = nivel3Sel === r.n3;
                      return (
                        <tr
                          key={r.n3}
                          onClick={() => setNivel3Sel(active ? null : r.n3)}
                          className={
                            "border-t border-[var(--t-border)] cursor-pointer transition-colors " +
                            (active ? "bg-[var(--t-accent)]/10" : "hover:bg-[var(--t-surface)]")
                          }
                          title="Click: filtrar la tabla de Estado comercial por este nivel 3"
                        >
                          <td className="px-3 py-1.5 text-[var(--t-text)] truncate max-w-[180px]" title={r.n3}>{r.n3}</td>
                          <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{fmtUsd(r.cupo_trans_usd)}</td>
                          <td className="px-2 py-1.5 text-right text-[var(--t-pos)]">{fmtUsd(r.cupo_libre_usd)}</td>
                          <td className="px-2 py-1.5 text-right text-[var(--t-text)] font-semibold">{r.n}</td>
                          <td className="px-2 py-1.5 text-right text-[var(--t-pos)]">{r.n_activas}</td>
                          <td className="px-2 py-1.5 text-right text-[var(--t-accent)]">{r.n_enfriandose}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-[var(--t-accent)]">{fmtAum(r.aum)}</td>
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
  return <div className="flex-1 min-h-0 flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">{msg}</div>;
}
