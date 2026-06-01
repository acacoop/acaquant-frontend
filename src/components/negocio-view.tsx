"use client";

import { Fragment, useState, useMemo, useEffect } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────

// /api/operaciones/negocio?fecha=... ahora solo devuelve meta — el array
// completo de boletos no era usado por la UI rediseñada y costaba ~800ms.
// El detalle por cuenta vive en /negocio/cuentas (período).
interface NegocioResp {
  meta: {
    fecha: string;
    n_boletos: number;
    n_categorias: number;
    ultima_ingesta: string | null;
  };
}

interface SeriePoint {
  fecha: string;
  compra: number;
  venta: number;
  suscripciones: number;
  cauc_tom: number;
  cauc_col: number;
}

type Moneda = "ARS" | "USD";
type RangoKey = "1W" | "1M" | "3M" | "YTD" | "1A" | "ALL";
type AggKey = "DIARIO" | "SEMANAL" | "MENSUAL";
type CuentaFilter = "todas" | "accionistas" | "sin_accionistas" | "cooperativas" | "productores";
// Vista global: DIA = todo scopeado al día seleccionado en el calendario.
// TODOS = todo scopeado al período visible del chart (1W/1M/3M/ALL).
type VistaMode = "DIA" | "TODOS";

// Color de barras "muteadas" cuando hay un día seleccionado y queremos
// que el día elegido resalte sobre el resto.
const MUTED_BAR_COLOR = "var(--t-border-2)";

// El filtro accionistas/coop se resuelve server-side en /negocio/serie
// y /negocio/cuentas (mismo regex que cashflow). Acá solo declaramos
// las opciones del dropdown.
const FILTRO_LABEL: Record<CuentaFilter, string> = {
  todas:           "Todas",
  accionistas:     "Solo accionistas",
  sin_accionistas: "Sin accionistas",
  cooperativas:    "Solo cooperativas",
  productores:     "Solo productores",
};

// ── Constantes ────────────────────────────────────────────────────────────

const NEGOCIO_CATS = [
  "compra",
  "venta",
  "suscripciones",
  "cauc_tom",
  "cauc_col",
] as const;
type NegocioCat = (typeof NEGOCIO_CATS)[number];

// Mapeo categoría UI → categorías de boleto (suscripciones agrupa susc +
// sol_susc) está en el backend ahora — _NEGOCIO_UI_CAT_MAP en
// api/routers/operaciones.py. El frontend solo manda la cat UI y el
// servicio resuelve.

const CAT_COLOR: Record<NegocioCat, string> = {
  compra:        "#3fbf6f",
  venta:         "#ff5d6c",
  suscripciones: "#94e7b3",
  cauc_tom:      "#d09060",  // tomadora — naranja apagado (financia)
  cauc_col:      "#5fd0d0",  // colocadora — teal (presta/coloca cash)
};

const CAT_LABEL: Record<NegocioCat, string> = {
  compra:        "Compras",
  venta:         "Ventas",
  suscripciones: "Suscripciones",
  cauc_tom:      "Cauciones Tomadoras",
  cauc_col:      "Cauciones Colocadoras",
};

// ── Helpers ───────────────────────────────────────────────────────────────

const fmtCompact = (n: number | null | undefined): string => {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return sign + (abs / 1_000_000_000).toFixed(2) + "B";
  if (abs >= 1_000_000) return sign + (abs / 1_000_000).toFixed(2) + "M";
  if (abs >= 1_000) return sign + (abs / 1_000).toFixed(1) + "k";
  return sign + abs.toFixed(0);
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const utc = d.getTime();
    const ar = new Date(utc - 3 * 60 * 60_000);
    return ar.toISOString().slice(11, 19) + " ART";
  } catch {
    return "—";
  }
}

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtFechaDisplay(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

function fmtFechaCorta(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y.slice(-2)}`;
}

function fmtMesCorto(s: string): string {
  // "2026-04" → "Abr 26"
  const [y, m] = s.split("-").map(Number);
  return `${MESES[m - 1]} ${String(y).slice(-2)}`;
}

// ── Aggregation ───────────────────────────────────────────────────────────

// Datos son L-V; cualquier fecha de la serie es business day. El "lunes
// hábil" de la semana = restar (weekday - 1) días al fecha dada.
function lunesDeSemana(fechaIso: string): string {
  const d = new Date(fechaIso + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun .. 1=Mon ... 5=Fri
  const offset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d.getTime() + offset * 86400000);
  return monday.toISOString().slice(0, 10);
}

function bucketKey(fechaIso: string, agg: AggKey): string {
  if (agg === "MENSUAL") return fechaIso.slice(0, 7); // "YYYY-MM"
  if (agg === "SEMANAL") return lunesDeSemana(fechaIso);
  return fechaIso;
}

function fmtBucket(key: string, agg: AggKey): string {
  if (agg === "MENSUAL") return fmtMesCorto(key);
  return fmtFechaCorta(key);
}

function aggregateSerie(serie: SeriePoint[], agg: AggKey): SeriePoint[] {
  if (agg === "DIARIO") return serie;
  const m = new Map<string, SeriePoint>();
  for (const p of serie) {
    const k = bucketKey(p.fecha, agg);
    const cur = m.get(k);
    if (cur) {
      cur.compra += p.compra;
      cur.venta += p.venta;
      cur.suscripciones += p.suscripciones;
      cur.cauc_tom += p.cauc_tom;
      cur.cauc_col += p.cauc_col;
    } else {
      m.set(k, {
        fecha: k,
        compra: p.compra,
        venta: p.venta,
        suscripciones: p.suscripciones,
        cauc_tom: p.cauc_tom,
        cauc_col: p.cauc_col,
      });
    }
  }
  return [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// Slice de la serie según rango + offset. offset=0 = ventana más reciente;
// offset=1 = la anterior; offset=2 = aún antes; etc. Para YTD el offset
// retrocede el año (offset=0 = año en curso, 1 = año anterior...).
function filtrarRango(
  serie: SeriePoint[], rango: RangoKey, offset: number = 0,
): SeriePoint[] {
  if (rango === "ALL" || serie.length === 0) return serie;
  if (rango === "YTD") {
    const hoy = new Date();
    const yyyy = hoy.getFullYear() - offset;
    return serie.filter((s) => s.fecha.startsWith(`${yyyy}-`));
  }
  // Ventanas por count de días hábiles aprox.
  const n =
    rango === "1W"  ?   5 :
    rango === "1M"  ?  22 :
    rango === "3M"  ?  65 :
    /* "1A" */         252;
  const end   = serie.length - offset * n;
  const start = Math.max(0, end - n);
  return serie.slice(Math.max(0, start), Math.max(0, end));
}

// ── Vista principal ───────────────────────────────────────────────────────

export function NegocioView() {
  const [fecha, setFecha] = useState<string>("");
  const [fechasDisp, setFechasDisp] = useState<{ fecha: string; n: number }[]>([]);
  const [fechasLoaded, setFechasLoaded] = useState(false);
  const [data, setData] = useState<NegocioResp | null>(null);
  const [serie, setSerie] = useState<SeriePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSerie, setLoadingSerie] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [rango, setRango] = useState<RangoKey>("YTD");
  // offset: 0 = ventana más reciente, +1 = retroceder un período. Pan
  // lateral con botones ◀ ▶.
  const [rangoOffset, setRangoOffset] = useState<number>(0);
  const [agg, setAgg] = useState<AggKey>("DIARIO");
  const [catSel, setCatSel] = useState<NegocioCat | null>(null);
  const [filtroCta, setFiltroCta] = useState<CuentaFilter>("todas");
  // Modo global de vista — afecta POR CATEGORÍA y DETALLE simultáneamente:
  // DIA: día seleccionado vía calendar. TODOS: período visible del chart.
  const [vistaMode, setVistaMode] = useState<VistaMode>("DIA");
  // Foco día: cuando está ON (default) Y vistaMode=DIA, muteamos las barras
  // del chart que no pertenecen al bucket de la fecha seleccionada.
  const [focoDia, setFocoDia] = useState<boolean>(false);
  // Búsqueda de cuenta: si tiene un valor exacto en cuentasList, todas las
  // queries se scopean a esa cuenta (override del cuenta_filter).
  const [cuentaSearch, setCuentaSearch] = useState<string>("");
  const [cuentasList, setCuentasList] = useState<string[]>([]);
  const [cuentasPeriodo, setCuentasPeriodo] = useState<{ cuenta: string; importe_abs: number; n: number }[]>([]);
  const [loadingCuentas, setLoadingCuentas] = useState(false);
  // Matrix consolidada (cuenta × las 5 categorías) — default cuando no
  // hay catSel. Permite ver de un vistazo qué hace cada cuenta sin tener
  // que clickear de a una categoría.
  type MatrixRow = {
    cuenta: string;
    compra: number;
    venta: number;
    suscripciones: number;
    cauc_tom: number;
    cauc_col: number;
    total: number;
    n: number;
  };
  const [matrix, setMatrix] = useState<MatrixRow[]>([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  // Expand inline: en modo DIA, cuando user clickea una cuenta vemos
  // los boletos individuales del día para esa cuenta. Caché por
  // (cuenta, categoria, fecha) — al colapsar y re-expandir no refetch.
  type BoletoRow = {
    comprobante: string;
    categoria: string;
    op: string | null;
    ticker: string | null;
    cantidad: number | null;
    precio: number | null;
    importe: number | null;
    plazo: string | null;
    lugar: string | null;
    estado: string | null;
    informacion: string | null;
  };
  const [expandedCuenta, setExpandedCuenta] = useState<string | null>(null);
  const [boletosCache, setBoletosCache] = useState<Record<string, BoletoRow[]>>({});
  const [loadingBoletos, setLoadingBoletos] = useState(false);

  // ── Fetch: lista de fechas con data ────────────────────────────────────
  useEffect(() => {
    const loadFechas = async () => {
      try {
        const res = await fetch("/api/operaciones/negocio/fechas", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: { fechas: { fecha: string; n: number }[] } = await res.json();
        setFechasDisp(j.fechas);
        if (j.fechas.length > 0 && !fecha) {
          setFecha(j.fechas[0].fecha);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setFechasLoaded(true);
      }
    };
    void loadFechas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch: detalle del día ─────────────────────────────────────────────
  const fetchData = async (f: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/operaciones/negocio?fecha=${f}`, { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
      }
      const j: NegocioResp = await res.json();
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fecha) void fetchData(fecha);
  }, [fecha]);

  // Cuenta efectiva: si el user escribió en el search Y el texto coincide
  // exactamente con una cuenta de la lista, se manda como override. Si el
  // texto no matchea, ignoramos (no scopeamos a un valor que no existe).
  const cuentaExacta = useMemo(
    () => (cuentasList.includes(cuentaSearch) ? cuentaSearch : null),
    [cuentaSearch, cuentasList],
  );

  // ── Fetch: serie histórica (depende de moneda + cuenta_filter + cuenta) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSerie(true);
      try {
        let url = `/api/operaciones/negocio/serie?moneda=${moneda}&cuenta_filter=${filtroCta}`;
        if (cuentaExacta) url += `&cuenta=${encodeURIComponent(cuentaExacta)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: { serie: SeriePoint[] } = await res.json();
        if (cancelled) return;
        setSerie(Array.isArray(j.serie) ? j.serie : []);
      } catch (e) {
        if (!cancelled) {
          setSerie([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingSerie(false);
      }
    })();
    return () => { cancelled = true; };
  }, [moneda, filtroCta, cuentaExacta]);

  // ── Fetch: lista completa de cuentas (autocomplete) — una vez ─────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/operaciones/negocio/cuentas-list", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const j: { cuentas: string[] } = await res.json();
        if (cancelled) return;
        setCuentasList(Array.isArray(j.cuentas) ? j.cuentas : []);
      } catch {
        // Silencioso — el autocomplete simplemente no muestra sugerencias.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Derivados ────────────────────────────────────────────────────────────

  const fechasOrdenadasAsc = useMemo(
    () => [...fechasDisp].map((f) => f.fecha).sort(),
    [fechasDisp],
  );
  const idxActual = fechasOrdenadasAsc.indexOf(fecha);
  const hayPrev = idxActual > 0;
  const hayNext = idxActual >= 0 && idxActual < fechasOrdenadasAsc.length - 1;
  const ultimaFecha = fechasOrdenadasAsc[fechasOrdenadasAsc.length - 1];
  const isLatest = fecha === ultimaFecha;

  const goPrev = () => { if (hayPrev) setFecha(fechasOrdenadasAsc[idxActual - 1]); };
  const goNext = () => { if (hayNext) setFecha(fechasOrdenadasAsc[idxActual + 1]); };
  const goLatest = () => { if (ultimaFecha) setFecha(ultimaFecha); };

  // Totales para POR CATEGORÍA: depende del vistaMode global.
  // - DIA: solo la fila de la fecha seleccionada en la serie.
  // - TODOS: suma de las filas dentro del rango visible (serieRango más abajo).
  // Se computa una vez serieRango está disponible — definido más abajo.

  // Pre-aggregation: serie filtrada por rango (DIARIO). Sirve para
  // obtener desde/hasta exactos del período visible — necesario para la
  // query a /negocio/cuentas que requiere fechas YYYY-MM-DD.
  const serieRango = useMemo(
    () => filtrarRango(serie, rango, rangoOffset),
    [serie, rango, rangoOffset],
  );

  // Si la ventana actual queda vacía (retrocediste demasiado), prevenir
  // permitir ir más atrás. Si offset==0 ya estás en el más reciente, no
  // permitir ir hacia adelante.
  const puedeIrAtras    = rango !== "ALL" && serieRango.length > 0 && (
    rango === "YTD"
      ? serie.some((s) => s.fecha.startsWith(`${new Date().getFullYear() - rangoOffset - 1}-`))
      : (serie.length - (rangoOffset + 1) * (
          rango === "1W" ? 5 : rango === "1M" ? 22 : rango === "3M" ? 65 : 252
        )) > 0
  );
  const puedeIrAdelante = rangoOffset > 0;

  // Datos para el chart: aggregation aplicada a la serie filtrada.
  const chartData = useMemo(() => aggregateSerie(serieRango, agg), [serieRango, agg]);

  // desde/hasta del período visible (días reales, no buckets).
  const periodoDesde = serieRango[0]?.fecha ?? null;
  const periodoHasta = serieRango[serieRango.length - 1]?.fecha ?? null;

  // Total del período (sumar todas las categorías de todos los días visibles).
  const totalPeriodo = useMemo(() => {
    let s = 0;
    for (const p of serieRango) {
      s += p.compra + p.venta + p.suscripciones + p.cauc_tom + p.cauc_col;
    }
    return s;
  }, [serieRango]);

  // Totales para POR CATEGORÍA — bifurcación según vistaMode.
  const totalesActuales = useMemo<Record<NegocioCat, number>>(() => {
    const empty: Record<NegocioCat, number> = {
      compra: 0, venta: 0, suscripciones: 0, cauc_tom: 0, cauc_col: 0,
    };
    if (vistaMode === "DIA") {
      const row = serie.find((s) => s.fecha === fecha);
      if (!row) return empty;
      return {
        compra:        row.compra,
        venta:         row.venta,
        suscripciones: row.suscripciones,
        cauc_tom:      row.cauc_tom,
        cauc_col:      row.cauc_col,
      };
    }
    // TODOS: sum de todo el rango visible.
    const acc = { ...empty };
    for (const p of serieRango) {
      acc.compra        += p.compra;
      acc.venta         += p.venta;
      acc.suscripciones += p.suscripciones;
      acc.cauc_tom      += p.cauc_tom;
      acc.cauc_col      += p.cauc_col;
    }
    return acc;
  }, [vistaMode, serie, fecha, serieRango]);

  const totalActual = useMemo(
    () => NEGOCIO_CATS.reduce((a, c) => a + totalesActuales[c], 0),
    [totalesActuales],
  );

  // Drill-down DETALLE: cuentas para la categoría seleccionada. Rango y
  // scope determinados por vistaMode (DIA = solo fecha, TODOS = período
  // visible) y cuentaExacta (override del cuenta_filter si está en lista).
  const detalleDesde = vistaMode === "DIA" ? fecha : periodoDesde;
  const detalleHasta = vistaMode === "DIA" ? fecha : periodoHasta;

  useEffect(() => {
    if (!catSel || !detalleDesde || !detalleHasta) {
      setCuentasPeriodo([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingCuentas(true);
      try {
        let url =
          `/api/operaciones/negocio/cuentas?moneda=${moneda}` +
          `&cuenta_filter=${filtroCta}` +
          `&categoria=${catSel}` +
          `&desde=${detalleDesde}` +
          `&hasta=${detalleHasta}`;
        if (cuentaExacta) url += `&cuenta=${encodeURIComponent(cuentaExacta)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: { cuentas: { cuenta: string; importe_abs: number; n: number }[] } = await res.json();
        if (cancelled) return;
        setCuentasPeriodo(Array.isArray(j.cuentas) ? j.cuentas : []);
      } catch (e) {
        if (!cancelled) {
          setCuentasPeriodo([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingCuentas(false);
      }
    })();
    return () => { cancelled = true; };
  }, [catSel, moneda, filtroCta, detalleDesde, detalleHasta, cuentaExacta]);

  // Alias por consistencia con el render abajo (mismo nombre que antes).
  const cuentasDetalle = cuentasPeriodo;

  // Fetch del matrix consolidado (default cuando no hay catSel).
  // Mismas dependencies que cuentasDetalle pero NO categoria.
  useEffect(() => {
    if (catSel || !detalleDesde || !detalleHasta) {
      // Cuando hay categoría seleccionada, mostramos cuentasDetalle (single cat).
      setMatrix([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingMatrix(true);
      try {
        let url =
          `/api/operaciones/negocio/cuentas-matrix?moneda=${moneda}` +
          `&cuenta_filter=${filtroCta}` +
          `&desde=${detalleDesde}` +
          `&hasta=${detalleHasta}`;
        if (cuentaExacta) url += `&cuenta=${encodeURIComponent(cuentaExacta)}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: { cuentas: MatrixRow[] } = await res.json();
        if (cancelled) return;
        setMatrix(Array.isArray(j.cuentas) ? j.cuentas : []);
      } catch (e) {
        if (!cancelled) {
          setMatrix([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingMatrix(false);
      }
    })();
    return () => { cancelled = true; };
  }, [catSel, moneda, filtroCta, detalleDesde, detalleHasta, cuentaExacta]);

  const matrixTotal = useMemo(
    () => matrix.reduce((a, r) => a + r.total, 0),
    [matrix],
  );

  // Tabla unificada: misma shape para default y single-cat. cuenta,
  // importe (total o per-cat), n. La fuente difiere para mantener n
  // fiel a la categoría seleccionada cuando aplica.
  const tableRows = useMemo<{ cuenta: string; importe: number; n: number }[]>(() => {
    if (!catSel) {
      return matrix.map((r) => ({ cuenta: r.cuenta, importe: r.total, n: r.n }));
    }
    return cuentasDetalle.map((r) => ({
      cuenta: r.cuenta, importe: r.importe_abs, n: r.n,
    }));
  }, [catSel, matrix, cuentasDetalle]);

  const tableTotal = useMemo(
    () => tableRows.reduce((a, r) => a + r.importe, 0),
    [tableRows],
  );

  // Limpiar expand cuando cambia cualquier filtro / scope — los boletos
  // expandidos ya no son válidos.
  useEffect(() => {
    setExpandedCuenta(null);
  }, [catSel, vistaMode, moneda, filtroCta, fecha, rango, rangoOffset, cuentaExacta]);

  // Clave de cache de boletos: (fecha + cuenta + categoria_o_all).
  const boletosKey = (cuenta: string, fecha_d: string, cat: string | null) =>
    `${fecha_d}|${cuenta}|${cat ?? "all"}`;

  // Fetch boletos cuando se expande una cuenta — solo en modo DIA.
  useEffect(() => {
    if (!expandedCuenta || vistaMode !== "DIA" || !fecha) return;
    const key = boletosKey(expandedCuenta, fecha, catSel);
    if (boletosCache[key]) return; // ya cacheado
    let cancelled = false;
    (async () => {
      setLoadingBoletos(true);
      try {
        let url =
          `/api/operaciones/negocio/boletos?fecha=${fecha}` +
          `&cuenta=${encodeURIComponent(expandedCuenta)}` +
          `&moneda=${moneda}`;
        if (catSel) url += `&categoria=${catSel}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: { boletos: BoletoRow[] } = await res.json();
        if (cancelled) return;
        setBoletosCache((prev) => ({
          ...prev,
          [key]: Array.isArray(j.boletos) ? j.boletos : [],
        }));
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoadingBoletos(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedCuenta, vistaMode, fecha, moneda, catSel]);

  const totalCatSel = useMemo(
    () => cuentasDetalle.reduce((a, c) => a + c.importe_abs, 0),
    [cuentasDetalle],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)] flex flex-col">

      {/* HEADER */}
      <div className="px-4 py-3 border-b border-[var(--t-border)] flex flex-wrap items-center gap-3 shrink-0">
        <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          <button
            onClick={goPrev}
            disabled={!hayPrev}
            className="px-2 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:text-[#333]"
            title="Día anterior con data"
          >‹</button>
          {/* Calendario nativo: el browser muestra picker de mes. Constrained
              por min/max al rango con data. Si el user elige un día sin data
              (feriado, fin de semana, día previo a la primera fecha) hacemos
              snap al próximo día disponible. */}
          <input
            type="date"
            value={fecha}
            min={fechasOrdenadasAsc[0] || undefined}
            max={ultimaFecha || undefined}
            disabled={fechasDisp.length === 0}
            onChange={(e) => {
              const picked = e.target.value;
              if (!picked) return;
              if (fechasOrdenadasAsc.includes(picked)) {
                setFecha(picked);
                return;
              }
              // Snap forward: primer día con data >= picked. Si no hay,
              // último (más reciente).
              const nextAvail =
                fechasOrdenadasAsc.find((f) => f >= picked) ??
                fechasOrdenadasAsc[fechasOrdenadasAsc.length - 1];
              if (nextAvail) setFecha(nextAvail);
            }}
            className="bg-[var(--t-panel)] px-2 py-1 text-[12px] font-mono text-[var(--t-text)] outline-none disabled:opacity-50 [color-scheme:dark]"
          />
          <button
            onClick={goNext}
            disabled={!hayNext}
            className="px-2 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:text-[#333]"
            title="Día siguiente con data"
          >›</button>
          <button
            onClick={goLatest}
            disabled={isLatest || !ultimaFecha}
            className="px-2 text-[10px] uppercase tracking-wider bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:text-[var(--t-text-muted)]"
            title="Última fecha con data"
          >Última</button>
        </div>

        {/* Modo global DIA/TODOS — afecta POR CATEGORÍA + DETALLE */}
        <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["DIA", "TODOS"] as VistaMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setVistaMode(m)}
              className={
                "px-3 py-1 text-[10px] uppercase tracking-wider " +
                (vistaMode === m
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                  : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
              }
              title={m === "DIA"
                ? "Vista del día seleccionado"
                : "Vista de todo el período visible del chart"}
            >
              {m === "DIA" ? "Día" : "Todos"}
            </button>
          ))}
        </div>

        <div className={
          "text-[14px] font-mono " + (vistaMode === "DIA" ? "text-[var(--t-accent)]" : "text-[var(--t-text-dim)]")
        }>
          {vistaMode === "DIA"
            ? (fecha ? fmtFechaDisplay(fecha) : "—")
            : (periodoDesde && periodoHasta
                ? `${fmtFechaCorta(periodoDesde)} → ${fmtFechaCorta(periodoHasta)}`
                : "—")}
        </div>

        {data && (
          <>
            <span className="text-[#333]">│</span>
            <div className="text-[10px]">
              <span className="text-[var(--t-text-muted)] uppercase tracking-wider">Boletos: </span>
              <span className="text-[var(--t-text)] font-mono">{data.meta.n_boletos}</span>
            </div>
            <div className="text-[10px]">
              <span className="text-[var(--t-text-muted)] uppercase tracking-wider">Última ingesta: </span>
              <span className="text-[var(--t-text)] font-mono">
                {formatTime(data.meta.ultima_ingesta)}
              </span>
            </div>
          </>
        )}

        {(loading || loadingSerie) && (
          <span className="text-[10px] text-[var(--t-text-dim)]">cargando…</span>
        )}

        {/* Búsqueda de cuenta — autocomplete via datalist nativo. Si el
            valor matchea una cuenta de cuentasList, se manda como override
            al backend y todos los paneles se re-scopean a esa cuenta. */}
        <input
          type="text"
          list="negocio-cuentas-list"
          value={cuentaSearch}
          onChange={(e) => setCuentaSearch(e.target.value)}
          placeholder="Buscar cuenta…"
          className={
            "ml-auto bg-[var(--t-panel)] border px-2 py-1 text-[11px] font-mono outline-none w-[200px] " +
            (cuentaExacta ? "border-[var(--t-accent)] text-[var(--t-accent)]" : "border-[var(--t-border-2)] text-[var(--t-text)]")
          }
          title="Escribí parte del nombre de cuenta. Las sugerencias filtran live; al elegir una, todos los paneles muestran solo esa cuenta."
        />
        <datalist id="negocio-cuentas-list">
          {cuentasList.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {cuentaSearch && (
          <button
            onClick={() => setCuentaSearch("")}
            className="text-[10px] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
            title="Limpiar búsqueda de cuenta"
          >×</button>
        )}

        {/* Filtro de tipo de cuenta — mirror del de cashflow-view */}
        <select
          value={filtroCta}
          onChange={(e) => setFiltroCta(e.target.value as CuentaFilter)}
          disabled={!!cuentaExacta}
          className={
            "bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-1 text-[10px] uppercase tracking-wider outline-none " +
            (cuentaExacta
              ? "text-[var(--t-text-muted)] cursor-not-allowed"
              : "text-[var(--t-text)] hover:text-[var(--t-accent)]")
          }
          title={cuentaExacta
            ? "Deshabilitado: hay una cuenta específica seleccionada"
            : "Filtrar por tipo de cuenta"}
        >
          {(Object.keys(FILTRO_LABEL) as CuentaFilter[]).map((k) => (
            <option key={k} value={k}>
              {FILTRO_LABEL[k]}
            </option>
          ))}
        </select>

        <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["ARS", "USD"] as Moneda[]).map((m) => (
            <button
              key={m}
              onClick={() => setMoneda(m)}
              className={
                "px-3 py-1 text-[10px] uppercase tracking-wider " +
                (moneda === m
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                  : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
              }
            >
              {m}
            </button>
          ))}
        </div>

        <button
          onClick={() => fecha && void fetchData(fecha)}
          className="bg-[var(--t-surface-2)] border border-[var(--t-border-2)] px-3 py-1 text-[10px] uppercase tracking-wider text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 border border-[#aa3333] bg-[var(--t-tint-red)] p-3 text-[11px] text-[#ff7777]">
          {error}
        </div>
      )}

      {fechasLoaded && fechasDisp.length === 0 && !loading && (
        <div className="m-4 border border-[var(--t-border)] p-8 text-center text-[12px] text-[var(--t-text-muted)]">
          Aún no hay datos persistidos en CashFlow.NegocioMovimientos.
        </div>
      )}

      {fechasDisp.length > 0 && (
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">

          {/* COLUMNA IZQUIERDA — POR CATEGORÍA arriba, chart debajo */}
          <div className="min-h-0 flex flex-col gap-3 overflow-hidden">

            {/* CHART panel (queda como flex-1 para ocupar el resto del alto) */}
            <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden order-2">
              <div className="flex items-center px-3 py-2 border-b border-[var(--t-border)] shrink-0 flex-wrap gap-2">
                <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
                  Volumen operado · {moneda}
                </span>
                {chartData.length > 0 && (
                  <span className="text-[9px] text-[var(--t-text-muted)] font-mono">
                    {fmtBucket(chartData[0].fecha, agg)} → {fmtBucket(chartData[chartData.length - 1].fecha, agg)}
                  </span>
                )}
                {totalPeriodo > 0 && (
                  <span className="text-[10px] font-mono">
                    <span className="text-[var(--t-text-muted)] uppercase tracking-wider">Total período: </span>
                    <span className="text-[var(--t-accent)] font-semibold">{fmtCompact(totalPeriodo)}</span>
                  </span>
                )}
                {/* Aggregation toggle */}
                <div className="ml-auto inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                  {(["DIARIO", "SEMANAL", "MENSUAL"] as AggKey[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setAgg(k)}
                      className={
                        "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                        (agg === k
                          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                          : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                      }
                    >
                      {k}
                    </button>
                  ))}
                </div>
                {/* Range filter — preset + pan ◀ ▶ */}
                <div className="inline-flex items-center gap-1">
                  <button
                    onClick={() => setRangoOffset((o) => o + 1)}
                    disabled={!puedeIrAtras}
                    title="Período anterior"
                    className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
                  >◀</button>
                  <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                    {(["1W", "1M", "3M", "YTD", "1A", "ALL"] as RangoKey[]).map((k) => (
                      <button
                        key={k}
                        onClick={() => { setRango(k); setRangoOffset(0); }}
                        className={
                          "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                          (rango === k
                            ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                            : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                        }
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setRangoOffset((o) => Math.max(0, o - 1))}
                    disabled={!puedeIrAdelante}
                    title="Período siguiente"
                    className="px-1 py-0.5 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:text-[#333] disabled:border-[var(--t-border)] disabled:cursor-not-allowed"
                  >▶</button>
                </div>
                {/* Foco día: ON = highlight selected day, OFF = todas las
                    barras en color (modo report/print). */}
                <button
                  onClick={() => setFocoDia((v) => !v)}
                  className={
                    "px-2 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--t-border-2)] " +
                    (focoDia
                      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                      : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")
                  }
                  title={focoDia
                    ? "Foco día activo: el día elegido resalta. Apagá para imprimir / report."
                    : "Foco día apagado: todas las barras en color (modo report)."}
                >
                  Foco día {focoDia ? "✓" : "○"}
                </button>
              </div>

              <div className="flex-1 min-h-0 p-2">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">
                    Sin datos para {moneda} en este rango.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 8, right: 12, bottom: 24, left: 4 }}
                      onClick={(state) => {
                        if (agg !== "DIARIO") return;
                        const f = state?.activeLabel;
                        if (typeof f === "string" && fechasOrdenadasAsc.includes(f)) {
                          setFecha(f);
                        }
                      }}
                    >
                      <CartesianGrid stroke="var(--t-border)" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                        axisLine={{ stroke: "var(--t-border-2)" }}
                        tickLine={false}
                        tickFormatter={(v: string) => fmtBucket(v, agg)}
                        interval={Math.max(0, Math.floor(chartData.length / 14))}
                        angle={-35}
                        textAnchor="end"
                        height={40}
                        minTickGap={4}
                      />
                      <YAxis
                        tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                        axisLine={{ stroke: "var(--t-border-2)" }}
                        tickLine={false}
                        tickFormatter={(v: number) => fmtCompact(v)}
                        width={56}
                      />
                      <Tooltip
                        cursor={{ fill: "#ffffff08" }}
                        contentStyle={{
                          background: "#0e0e0e",
                          border: "1px solid #2a2a2a",
                          fontSize: 11,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                        labelStyle={{ color: "#808080" }}
                        // Forzamos color del texto del tooltip — recharts por
                        // default usa el fill del Cell, lo cual queda invisible
                        // sobre fondo oscuro cuando la barra está muteada (#222).
                        itemStyle={{ color: "#d0d0d0" }}
                        labelFormatter={(v) => fmtBucket(String(v), agg)}
                        formatter={(v, name) => [
                          fmtCompact(Number(v)),
                          CAT_LABEL[name as NegocioCat] ?? String(name),
                        ]}
                      />
                      {/* Stacked bars: si focoDia=ON el bucket que contiene
                          la fecha seleccionada conserva su color de categoría
                          y el resto va a gris muted (#222). Si focoDia=OFF
                          (modo report/print) todas las barras en color normal. */}
                      {NEGOCIO_CATS.map((cat) => (
                        <Bar
                          key={cat}
                          dataKey={cat}
                          stackId="total"
                          isAnimationActive={false}
                        >
                          {chartData.map((d, i) => {
                            // Todas las barras en color de empresa. Dos focos que
                            // atenúan el resto (var(--t-border-2)):
                            //  - foco categoría: catSel seleccionada (clic leyenda)
                            //    → segmentos de otras categorías se atenúan.
                            //  - foco día (modo DIA): el día elegido resalta.
                            const sel = vistaMode === "DIA" && focoDia && fecha
                              ? bucketKey(fecha, agg)
                              : null;
                            const selInData = !!sel && chartData.some((x) => x.fecha === sel);
                            const mutedDia = selInData && d.fecha !== sel;
                            const mutedCat = catSel !== null && catSel !== cat;
                            const muted = mutedDia || mutedCat;
                            return (
                              <Cell
                                key={i}
                                fill={muted ? MUTED_BAR_COLOR : "var(--t-brand)"}
                              />
                            );
                          })}
                        </Bar>
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Leyenda = selector de FOCO por categoría. Clic: resalta cuánto
                  del total es esa categoría (el resto se atenúa). Clic de nuevo
                  o en otra: cambia/quita el foco. */}
              <div className="flex flex-wrap gap-2 px-3 pb-2 pt-1 text-[10px] shrink-0">
                {NEGOCIO_CATS.map((cat) => {
                  const active = catSel === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setCatSel(active ? null : cat)}
                      title={active ? "Quitar foco" : `Resaltar ${CAT_LABEL[cat]} sobre el total`}
                      className={
                        "flex items-center gap-1.5 px-1.5 py-0.5 border transition-colors " +
                        (active
                          ? "border-[var(--t-brand)] bg-[var(--t-brand)]/10"
                          : "border-transparent hover:border-[var(--t-border-2)]")
                      }
                    >
                      <span
                        className="w-2 h-2 inline-block"
                        style={{ background: catSel === null || active ? "var(--t-brand)" : MUTED_BAR_COLOR }}
                      />
                      <span className={active ? "text-[var(--t-brand)] font-semibold" : "text-[var(--t-text-dim)]"}>
                        {CAT_LABEL[cat]}
                      </span>
                    </button>
                  );
                })}
                {catSel && (
                  <button
                    onClick={() => setCatSel(null)}
                    className="px-1.5 py-0.5 text-[var(--t-text-muted)] hover:text-[var(--t-brand)]"
                    title="Quitar foco"
                  >× foco</button>
                )}
              </div>
            </div>

            {/* POR CATEGORÍA leaderboard (order-1 → arriba) */}
            <div className="border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden shrink-0 order-1">
              <table className="w-full text-[11px] font-mono tabular-nums">
                {/* Una sola franja sticky sólida: nombres de columna = título.
                    El total del período va integrado en la celda IMPORTE. */}
                <thead className="sticky top-0 z-10 text-[9px] uppercase tracking-widest text-[var(--t-accent)]">
                  <tr>
                    <th className="px-3 py-1.5 text-left bg-[var(--t-surface)] border-b border-[var(--t-border-2)]">
                      Categoría
                      <span className="ml-1.5 normal-case tracking-normal text-[var(--t-text-muted)]">
                        · {vistaMode === "DIA" ? (fecha ? fmtFechaCorta(fecha) : "—") : "Período"}
                      </span>
                    </th>
                    <th className="px-3 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]">
                      Importe
                      <span className="ml-1.5 normal-case tracking-normal text-[var(--t-text-muted)]">
                        Σ {fmtCompact(totalActual)}
                      </span>
                    </th>
                    <th className="px-3 py-1.5 text-right bg-[var(--t-surface)] border-b border-[var(--t-border-2)]">%</th>
                  </tr>
                </thead>
                <tbody>
                  {NEGOCIO_CATS.map((cat) => {
                    const v = totalesActuales[cat];
                    const pct = totalActual > 0 ? (v / totalActual) * 100 : 0;
                    const active = catSel === cat;
                    return (
                      <tr
                        key={cat}
                        onClick={() => setCatSel(active ? null : cat)}
                        className={
                          "cursor-pointer border-t border-[var(--t-border)] transition-colors " +
                          (active
                            ? "bg-[var(--t-accent)]/10 text-[var(--t-accent)]"
                            : "hover:bg-[var(--t-accent)]/5")
                        }
                      >
                        <td className="px-3 py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 inline-block" style={{ background: CAT_COLOR[cat] }} />
                            <span className={active ? "" : "text-[var(--t-text)]"}>{CAT_LABEL[cat]}</span>
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold">
                          {fmtCompact(v)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[var(--t-text-dim)]">
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* COLUMNA DERECHA · DETALLE (scope global vía vistaMode) */}
          <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
                Detalle {vistaMode === "DIA" ? "día" : "período"}
                {catSel ? ` · ${CAT_LABEL[catSel]}` : ""}
              </span>
              {catSel && detalleDesde && detalleHasta && (
                <span className="text-[9px] text-[var(--t-text-muted)] font-mono">
                  {vistaMode === "DIA"
                    ? fmtFechaCorta(detalleDesde)
                    : `${fmtFechaCorta(detalleDesde)} → ${fmtFechaCorta(detalleHasta)}`}
                </span>
              )}
              {catSel ? (
                <>
                  <span className="ml-auto text-[10px] text-[var(--t-text-dim)] font-mono">
                    {cuentasDetalle.length} cuentas · {fmtCompact(totalCatSel)} {moneda}
                  </span>
                  {loadingCuentas && (
                    <span className="ml-2 text-[9px] text-[var(--t-text-dim)]">cargando…</span>
                  )}
                  <button
                    onClick={() => setCatSel(null)}
                    className="ml-2 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] text-[14px] leading-none"
                    title="Volver al matrix consolidado"
                  >×</button>
                </>
              ) : (
                <>
                  <span className="ml-auto text-[10px] text-[var(--t-text-dim)] font-mono">
                    {matrix.length} cuentas · {fmtCompact(matrixTotal)} {moneda}
                  </span>
                  {loadingMatrix && (
                    <span className="ml-2 text-[9px] text-[var(--t-text-dim)]">cargando…</span>
                  )}
                </>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              {tableRows.length === 0 && !loadingMatrix && !loadingCuentas ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)] p-6 text-center">
                  {catSel
                    ? `Sin boletos en ${CAT_LABEL[catSel]} para `
                    : "Sin boletos para "}
                  {vistaMode === "DIA" ? "el día" : "el período"} · {moneda}.
                </div>
              ) : (
                <table className="w-full text-[11px] font-mono tabular-nums">
                  <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                    <tr>
                      <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cuenta</th>
                      <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Importe</th>
                      <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">%</th>
                      <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((r) => {
                      const pct = tableTotal > 0 ? (r.importe / tableTotal) * 100 : 0;
                      const expanded = expandedCuenta === r.cuenta;
                      const canExpand = vistaMode === "DIA";
                      const key = fecha ? boletosKey(r.cuenta, fecha, catSel) : "";
                      const boletosForRow = key ? boletosCache[key] : undefined;
                      return (
                        <Fragment key={r.cuenta}>
                          <tr
                            onClick={() => {
                              if (!canExpand) return;
                              setExpandedCuenta(expanded ? null : r.cuenta);
                            }}
                            className={
                              "border-t border-[var(--t-border)] hover:bg-[var(--t-surface-2)] " +
                              (canExpand ? "cursor-pointer" : "cursor-default") +
                              (expanded ? " bg-[var(--t-accent)]/5" : "")
                            }
                            title={canExpand
                              ? "Click: ver boletos del día para esta cuenta"
                              : "Cambiá a vista DÍA para ver boletos individuales"}
                          >
                            <td className="px-3 py-1 text-[var(--t-text)] truncate max-w-[280px]" title={r.cuenta}>
                              <span className="inline-flex items-center gap-1.5">
                                {canExpand && (
                                  <span className="text-[10px] text-[var(--t-text-muted)] w-2 inline-block">
                                    {expanded ? "▾" : "▸"}
                                  </span>
                                )}
                                {r.cuenta}
                              </span>
                            </td>
                            <td className="px-3 py-1 text-right text-[var(--t-text)] font-semibold">
                              {fmtCompact(r.importe)}
                            </td>
                            <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">
                              {pct.toFixed(1)}%
                            </td>
                            <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">
                              {r.n}
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="bg-[var(--t-panel)]">
                              <td colSpan={4} className="p-0 border-t border-[var(--t-border)]">
                                {!boletosForRow ? (
                                  <div className="px-3 py-2 text-[10px] text-[var(--t-text-muted)]">
                                    {loadingBoletos ? "cargando boletos…" : "—"}
                                  </div>
                                ) : boletosForRow.length === 0 ? (
                                  <div className="px-3 py-2 text-[10px] text-[var(--t-text-muted)]">
                                    Sin boletos individuales.
                                  </div>
                                ) : (
                                  <table className="w-full text-[10px] font-mono tabular-nums">
                                    <thead className="text-[8px] uppercase tracking-widest text-[var(--t-text-muted)]">
                                      <tr>
                                        <th className="px-3 py-1 text-left">Comprobante</th>
                                        <th className="px-2 py-1 text-left">Categ</th>
                                        <th className="px-2 py-1 text-left">Op</th>
                                        <th className="px-2 py-1 text-left">Ticker</th>
                                        <th className="px-2 py-1 text-right">Cantidad</th>
                                        <th className="px-2 py-1 text-right">Precio</th>
                                        <th className="px-2 py-1 text-right">Importe</th>
                                        <th className="px-2 py-1 text-left">Plazo</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {boletosForRow.map((b) => {
                                        const catColor = CAT_COLOR[b.categoria as NegocioCat] ?? "#666";
                                        return (
                                          <tr
                                            key={b.comprobante}
                                            className="border-t border-[var(--t-border)]"
                                          >
                                            <td className="px-3 py-0.5 text-[var(--t-text-dim)]">{b.comprobante}</td>
                                            <td className="px-2 py-0.5">
                                              <span className="inline-flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 inline-block" style={{ background: catColor }} />
                                                <span className="text-[var(--t-text-dim)]">{b.categoria}</span>
                                              </span>
                                            </td>
                                            <td className="px-2 py-0.5 text-[var(--t-text)]">{b.op ?? "—"}</td>
                                            <td className="px-2 py-0.5 text-[var(--t-accent)]">{b.ticker ?? "—"}</td>
                                            <td className="px-2 py-0.5 text-right text-[var(--t-text)]">
                                              {b.cantidad != null
                                                ? b.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 2 })
                                                : "—"}
                                            </td>
                                            <td className="px-2 py-0.5 text-right text-[var(--t-text)]">
                                              {b.precio != null
                                                ? b.precio.toLocaleString("es-AR", { maximumFractionDigits: 2 })
                                                : "—"}
                                            </td>
                                            <td className={
                                              "px-2 py-0.5 text-right " +
                                              ((b.importe ?? 0) > 0 ? "text-[var(--t-pos)]" :
                                               (b.importe ?? 0) < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]")
                                            }>
                                              {b.importe != null
                                                ? b.importe.toLocaleString("es-AR", { maximumFractionDigits: 2 })
                                                : "—"}
                                            </td>
                                            <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{b.plazo ?? "—"}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                )}
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
      )}
    </div>
  );
}
