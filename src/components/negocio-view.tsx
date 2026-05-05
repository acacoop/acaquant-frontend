"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────

interface Boleto {
  fecha: string;
  comprobante: string;
  cuenta: string | null;
  categoria: string;
  op: string | null;
  ticker: string | null;
  cantidad: number | null;
  precio: number | null;
  importe: number | null;
  moneda: string | null;
  plazo: string | null;
  lugar: string | null;
  estado: string | null;
  informacion: string | null;
  n_lineas: number;
  ingestado_en?: string;
}

interface NegocioResp {
  meta: {
    fecha: string;
    n_boletos: number;
    n_categorias: number;
    ultima_ingesta: string | null;
  };
  boletos: Boleto[];
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
type RangoKey = "1W" | "1M" | "3M" | "ALL";
type AggKey = "DIARIO" | "SEMANAL" | "MENSUAL";
type CuentaFilter = "todas" | "accionistas" | "sin_accionistas" | "cooperativas";

// El filtro accionistas/coop se resuelve server-side en /negocio/serie
// y /negocio/cuentas (mismo regex que cashflow). Acá solo declaramos
// las opciones del dropdown.
const FILTRO_LABEL: Record<CuentaFilter, string> = {
  todas:           "Todas",
  accionistas:     "Solo accionistas",
  sin_accionistas: "Sin accionistas",
  cooperativas:    "Solo cooperativas",
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

function filtrarRango(serie: SeriePoint[], rango: RangoKey): SeriePoint[] {
  if (rango === "ALL" || serie.length === 0) return serie;
  const n = rango === "1W" ? 5 : rango === "1M" ? 22 : 65;
  return serie.slice(-n);
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
  const [rango, setRango] = useState<RangoKey>("ALL");
  const [agg, setAgg] = useState<AggKey>("DIARIO");
  const [catSel, setCatSel] = useState<NegocioCat | null>(null);
  const [filtroCta, setFiltroCta] = useState<CuentaFilter>("todas");
  const [cuentasPeriodo, setCuentasPeriodo] = useState<{ cuenta: string; importe_abs: number; n: number }[]>([]);
  const [loadingCuentas, setLoadingCuentas] = useState(false);

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

  // ── Fetch: serie histórica (depende de moneda + filtro de cuenta) ──────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSerie(true);
      try {
        const url = `/api/operaciones/negocio/serie?moneda=${moneda}&cuenta_filter=${filtroCta}`;
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
  }, [moneda, filtroCta]);

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

  // Totales del DÍA seleccionado (no del rango ni del bucket).
  const totalesHoy = useMemo<Record<NegocioCat, number>>(() => {
    const empty: Record<NegocioCat, number> = {
      compra: 0, venta: 0, suscripciones: 0, cauc_tom: 0, cauc_col: 0,
    };
    const row = serie.find((s) => s.fecha === fecha);
    if (!row) return empty;
    return {
      compra:        row.compra,
      venta:         row.venta,
      suscripciones: row.suscripciones,
      cauc_tom:      row.cauc_tom,
      cauc_col:      row.cauc_col,
    };
  }, [serie, fecha]);

  const totalDia = useMemo(
    () => NEGOCIO_CATS.reduce((a, c) => a + totalesHoy[c], 0),
    [totalesHoy],
  );

  // Pre-aggregation: serie filtrada por rango (DIARIO). Sirve para
  // obtener desde/hasta exactos del período visible — necesario para la
  // query a /negocio/cuentas que requiere fechas YYYY-MM-DD.
  const serieRango = useMemo(() => filtrarRango(serie, rango), [serie, rango]);

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

  // Drill-down: cuentas de la categoría seleccionada acumuladas sobre
  // TODO el período visible (no solo el día seleccionado). Server-side
  // aggregation via /negocio/cuentas, ordenado desc por |importe|.
  // Refetch cuando cambia (catSel, moneda, filtroCta, rango).
  useEffect(() => {
    if (!catSel || !periodoDesde || !periodoHasta) {
      setCuentasPeriodo([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingCuentas(true);
      try {
        const url =
          `/api/operaciones/negocio/cuentas?moneda=${moneda}` +
          `&cuenta_filter=${filtroCta}` +
          `&categoria=${catSel}` +
          `&desde=${periodoDesde}` +
          `&hasta=${periodoHasta}`;
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
  }, [catSel, moneda, filtroCta, periodoDesde, periodoHasta]);

  // Alias por consistencia con el render abajo (mismo nombre que antes).
  const cuentasDetalle = cuentasPeriodo;

  const totalCatSel = useMemo(
    () => cuentasDetalle.reduce((a, c) => a + c.importe_abs, 0),
    [cuentasDetalle],
  );

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-hidden bg-[#0a0a0a] text-[#d0d0d0] flex flex-col">

      {/* HEADER */}
      <div className="px-4 py-3 border-b border-[#1a1a1a] flex flex-wrap items-center gap-3 shrink-0">
        <div className="inline-flex items-stretch border border-[#333] divide-x divide-[#333]">
          <button
            onClick={goPrev}
            disabled={!hayPrev}
            className="px-2 text-[#888] hover:text-[#ff9900] disabled:text-[#333]"
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
            className="bg-black px-2 py-1 text-[12px] font-mono text-[#d0d0d0] outline-none disabled:opacity-50 [color-scheme:dark]"
          />
          <button
            onClick={goNext}
            disabled={!hayNext}
            className="px-2 text-[#888] hover:text-[#ff9900] disabled:text-[#333]"
            title="Día siguiente con data"
          >›</button>
          <button
            onClick={goLatest}
            disabled={isLatest || !ultimaFecha}
            className="px-2 text-[10px] uppercase tracking-wider bg-[#0a0a0a] text-[#888] hover:text-[#ff9900] disabled:text-[#444]"
            title="Última fecha con data"
          >Última</button>
        </div>

        <div className="text-[14px] font-mono text-[#ff9900]">
          {fecha ? fmtFechaDisplay(fecha) : "—"}
        </div>

        {data && (
          <>
            <span className="text-[#333]">│</span>
            <div className="text-[10px]">
              <span className="text-[#666] uppercase tracking-wider">Boletos: </span>
              <span className="text-[#d0d0d0] font-mono">{data.meta.n_boletos}</span>
            </div>
            <div className="text-[10px]">
              <span className="text-[#666] uppercase tracking-wider">Última ingesta: </span>
              <span className="text-[#d0d0d0] font-mono">
                {formatTime(data.meta.ultima_ingesta)}
              </span>
            </div>
          </>
        )}

        {(loading || loadingSerie) && (
          <span className="text-[10px] text-[#888]">cargando…</span>
        )}

        {/* Filtro de tipo de cuenta — mirror del de cashflow-view */}
        <select
          value={filtroCta}
          onChange={(e) => setFiltroCta(e.target.value as CuentaFilter)}
          className="ml-auto bg-black border border-[#333] px-2 py-1 text-[10px] uppercase tracking-wider text-[#d0d0d0] outline-none hover:text-[#ff9900]"
          title="Filtrar por tipo de cuenta"
        >
          {(Object.keys(FILTRO_LABEL) as CuentaFilter[]).map((k) => (
            <option key={k} value={k}>
              {FILTRO_LABEL[k]}
            </option>
          ))}
        </select>

        <div className="inline-flex items-stretch border border-[#333] divide-x divide-[#333]">
          {(["ARS", "USD"] as Moneda[]).map((m) => (
            <button
              key={m}
              onClick={() => setMoneda(m)}
              className={
                "px-3 py-1 text-[10px] uppercase tracking-wider " +
                (moneda === m
                  ? "bg-[#ff9900] text-black"
                  : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
              }
            >
              {m}
            </button>
          ))}
        </div>

        <button
          onClick={() => fecha && void fetchData(fecha)}
          className="bg-[#0f0f0f] border border-[#333] px-3 py-1 text-[10px] uppercase tracking-wider text-[#888] hover:text-[#ff9900]"
        >
          ↻ Refresh
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 border border-[#aa3333] bg-[#1a0808] p-3 text-[11px] text-[#ff7777]">
          {error}
        </div>
      )}

      {fechasLoaded && fechasDisp.length === 0 && !loading && (
        <div className="m-4 border border-[#1a1a1a] p-8 text-center text-[12px] text-[#666]">
          Aún no hay datos persistidos en CashFlow.NegocioMovimientos.
        </div>
      )}

      {fechasDisp.length > 0 && (
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">

          {/* COLUMNA IZQUIERDA — POR CATEGORÍA arriba, chart debajo */}
          <div className="min-h-0 flex flex-col gap-3 overflow-hidden">

            {/* CHART panel (queda como flex-1 para ocupar el resto del alto) */}
            <div className="flex-1 min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden order-2">
              <div className="flex items-center px-3 py-2 border-b border-[#1a1a1a] shrink-0 flex-wrap gap-2">
                <span className="text-[10px] uppercase tracking-widest text-[#ff9900]">
                  Volumen operado · {moneda}
                </span>
                {chartData.length > 0 && (
                  <span className="text-[9px] text-[#555] font-mono">
                    {fmtBucket(chartData[0].fecha, agg)} → {fmtBucket(chartData[chartData.length - 1].fecha, agg)}
                  </span>
                )}
                {totalPeriodo > 0 && (
                  <span className="text-[10px] font-mono">
                    <span className="text-[#666] uppercase tracking-wider">Total período: </span>
                    <span className="text-[#ff9900] font-semibold">{fmtCompact(totalPeriodo)}</span>
                  </span>
                )}
                {/* Aggregation toggle */}
                <div className="ml-auto inline-flex items-stretch border border-[#333] divide-x divide-[#333]">
                  {(["DIARIO", "SEMANAL", "MENSUAL"] as AggKey[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setAgg(k)}
                      className={
                        "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                        (agg === k
                          ? "bg-[#ff9900] text-black"
                          : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
                      }
                    >
                      {k}
                    </button>
                  ))}
                </div>
                {/* Range filter */}
                <div className="inline-flex items-stretch border border-[#333] divide-x divide-[#333]">
                  {(["1W", "1M", "3M", "ALL"] as RangoKey[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setRango(k)}
                      className={
                        "px-2 py-0.5 text-[9px] uppercase tracking-wider " +
                        (rango === k
                          ? "bg-[#ff9900] text-black"
                          : "bg-[#0a0a0a] text-[#888] hover:text-[#ff9900]")
                      }
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-h-0 p-2">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[11px] text-[#555]">
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
                      <CartesianGrid stroke="#161616" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fill: "#808080", fontSize: 10 }}
                        axisLine={{ stroke: "#2a2a2a" }}
                        tickLine={false}
                        tickFormatter={(v: string) => fmtBucket(v, agg)}
                        interval={Math.max(0, Math.floor(chartData.length / 14))}
                        angle={-35}
                        textAnchor="end"
                        height={40}
                        minTickGap={4}
                      />
                      <YAxis
                        tick={{ fill: "#808080", fontSize: 10 }}
                        axisLine={{ stroke: "#2a2a2a" }}
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
                        labelFormatter={(v) => fmtBucket(String(v), agg)}
                        formatter={(v, name) => [
                          fmtCompact(Number(v)),
                          CAT_LABEL[name as NegocioCat] ?? String(name),
                        ]}
                      />
                      {NEGOCIO_CATS.map((cat) => (
                        <Bar
                          key={cat}
                          dataKey={cat}
                          stackId="total"
                          fill={CAT_COLOR[cat]}
                          isAnimationActive={false}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Leyenda manual */}
              <div className="flex flex-wrap gap-3 px-3 pb-2 pt-1 text-[10px] shrink-0">
                {NEGOCIO_CATS.map((cat) => (
                  <div key={cat} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 inline-block" style={{ background: CAT_COLOR[cat] }} />
                    <span className="text-[#888]">{CAT_LABEL[cat]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* POR CATEGORÍA leaderboard (order-1 → arriba) */}
            <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden shrink-0 order-1">
              <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
                <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
                  Por categoría · {fecha ? fmtFechaCorta(fecha) : "—"}
                </span>
                <span className="ml-auto text-[10px] text-[#888] font-mono">
                  Total {fmtCompact(totalDia)} {moneda}
                </span>
              </div>
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="bg-[#0f0f0f] text-[9px] uppercase tracking-widest text-[#666]">
                  <tr>
                    <th className="px-3 py-1 text-left">Categoría</th>
                    <th className="px-3 py-1 text-right">Importe</th>
                    <th className="px-3 py-1 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {NEGOCIO_CATS.map((cat) => {
                    const v = totalesHoy[cat];
                    const pct = totalDia > 0 ? (v / totalDia) * 100 : 0;
                    const active = catSel === cat;
                    return (
                      <tr
                        key={cat}
                        onClick={() => setCatSel(active ? null : cat)}
                        className={
                          "cursor-pointer border-t border-[#1a1a1a] transition-colors " +
                          (active
                            ? "bg-[#ff9900]/10 text-[#ff9900]"
                            : "hover:bg-[#ff9900]/5")
                        }
                      >
                        <td className="px-3 py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 inline-block" style={{ background: CAT_COLOR[cat] }} />
                            <span className={active ? "" : "text-[#d0d0d0]"}>{CAT_LABEL[cat]}</span>
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold">
                          {fmtCompact(v)}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[#888]">
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* COLUMNA DERECHA · DETALLE (acumulado del período) */}
          <div className="min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
              <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
                Detalle período{catSel ? ` · ${CAT_LABEL[catSel]}` : ""}
              </span>
              {catSel && periodoDesde && periodoHasta && (
                <span className="ml-2 text-[9px] text-[#555] font-mono">
                  {fmtFechaCorta(periodoDesde)} → {fmtFechaCorta(periodoHasta)}
                </span>
              )}
              {catSel && (
                <>
                  <span className="ml-auto text-[10px] text-[#888] font-mono">
                    {cuentasDetalle.length} cuentas · {fmtCompact(totalCatSel)} {moneda}
                  </span>
                  {loadingCuentas && (
                    <span className="ml-2 text-[9px] text-[#888]">cargando…</span>
                  )}
                  <button
                    onClick={() => setCatSel(null)}
                    className="ml-2 text-[#888] hover:text-[#ff9900] text-[14px] leading-none"
                    title="Limpiar selección"
                  >×</button>
                </>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
              {!catSel ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[#666] p-6 text-center">
                  Seleccioná una categoría a la izquierda
                  <br />para ver el desglose por cuenta del período.
                </div>
              ) : cuentasDetalle.length === 0 && !loadingCuentas ? (
                <div className="h-full flex items-center justify-center text-[11px] text-[#666] p-6 text-center">
                  Sin boletos en {CAT_LABEL[catSel]} para el período · {moneda}.
                </div>
              ) : (
                <table className="w-full text-[11px] font-mono tabular-nums">
                  <thead className="sticky top-0 bg-[#080808] z-10 text-[9px] uppercase tracking-widest text-[#666]">
                    <tr>
                      <th className="px-3 py-1.5 text-left border-b border-[#1a1a1a]">Cuenta</th>
                      <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">Importe</th>
                      <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">%</th>
                      <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">N</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cuentasDetalle.map((c) => {
                      const pct = totalCatSel > 0 ? (c.importe_abs / totalCatSel) * 100 : 0;
                      return (
                        <tr key={c.cuenta} className="border-t border-[#111] hover:bg-[#0f0f0f]">
                          <td className="px-3 py-1 text-[#d0d0d0] truncate max-w-[280px]" title={c.cuenta}>
                            {c.cuenta}
                          </td>
                          <td className="px-3 py-1 text-right text-[#d0d0d0] font-semibold">
                            {fmtCompact(c.importe_abs)}
                          </td>
                          <td className="px-3 py-1 text-right text-[#888]">
                            {pct.toFixed(1)}%
                          </td>
                          <td className="px-3 py-1 text-right text-[#888]">
                            {c.n}
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
      )}
    </div>
  );
}
