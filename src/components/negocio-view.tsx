"use client";

import { useState, useMemo, useEffect } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
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
  susc_fci: number;
  sol_susc_fci: number;
  cauc_tom_ap: number;
}

type Moneda = "ARS" | "USD";
type RangoKey = "1W" | "1M" | "3M" | "ALL";

// ── Constantes ────────────────────────────────────────────────────────────

const NEGOCIO_CATS = [
  "compra",
  "venta",
  "susc_fci",
  "sol_susc_fci",
  "cauc_tom_ap",
] as const;
type NegocioCat = (typeof NEGOCIO_CATS)[number];

// Mapeo entre las claves del chart (cortas) y las categorías de los boletos.
const CAT_BOLETO_KEY: Record<NegocioCat, string> = {
  compra:       "compra",
  venta:        "venta",
  susc_fci:     "suscripcion_fci",
  sol_susc_fci: "solicitud_suscripcion_fci",
  cauc_tom_ap:  "caucion_tom_ap",
};

const CAT_COLOR: Record<NegocioCat, string> = {
  compra:       "#3fbf6f",
  venta:        "#ff5d6c",
  susc_fci:     "#94e7b3",
  sol_susc_fci: "#5fc4f0",
  cauc_tom_ap:  "#5fd0d0",
};

const CAT_LABEL: Record<NegocioCat, string> = {
  compra:       "Compras",
  venta:        "Ventas",
  susc_fci:     "Susc FCI",
  sol_susc_fci: "Sol Susc FCI",
  cauc_tom_ap:  "Cauc Tom Apert",
};

// Para colorear filas/labels en la tabla de detalle (incluye categorías
// que NO entran al chart pero sí aparecen como boletos del día).
const TABLE_CAT_COLOR: Record<string, string> = {
  compra:                    "#3fbf6f",
  venta:                     "#ff5d6c",
  suscripcion_fci:           "#94e7b3",
  rescate_fci:               "#ff5d6c",
  solicitud_suscripcion_fci: "#5fc4f0",
  solicitud_rescate_fci:     "#ff5d6c",
  acreencia:                 "#9bd2ff",
  caucion_col_ap:            "#5fd0d0",
  caucion_col_ci:            "#7be8e8",
  caucion_tom_ap:            "#d09060",
  caucion_tom_ci:            "#e8a878",
  caucion_otro:              "#888",
  deposito:                  "#ffd56b",
  extraccion:                "#ffa552",
  transferencia:             "#c19fff",
  comision:                  "#888",
  impuesto:                  "#888",
  otro:                      "#666",
};

const TABLE_CAT_LABEL: Record<string, string> = {
  compra:                    "Compras",
  venta:                     "Ventas",
  suscripcion_fci:           "Susc FCI super",
  rescate_fci:               "Resc FCI super",
  solicitud_suscripcion_fci: "Sol Susc FCI",
  solicitud_rescate_fci:     "Sol Resc FCI",
  acreencia:                 "Acreencias",
  caucion_col_ap:            "Cauc Col Apertura",
  caucion_col_ci:            "Cauc Col Cierre",
  caucion_tom_ap:            "Cauc Tom Apertura",
  caucion_tom_ci:            "Cauc Tom Cierre",
  caucion_otro:              "Cauciones",
  deposito:                  "Depósitos",
  extraccion:                "Extracciones",
  transferencia:             "Transferencias",
  comision:                  "Comisiones",
  impuesto:                  "Impuestos",
  otro:                      "Otros",
};

// ── Helpers ───────────────────────────────────────────────────────────────

const fmtNum = (n: number | null | undefined, dec = 2): string => {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

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

// Filtra serie por rango (1W/1M/3M/ALL). Cuenta hábiles desde la última fecha
// de la serie hacia atrás — independiente de feriados, no de calendario.
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
  const [catFiltro, setCatFiltro] = useState<string>("");
  const [search, setSearch] = useState("");

  // Carga inicial: fechas con data → setea la más reciente como fecha actual.
  useEffect(() => {
    const loadFechas = async () => {
      try {
        const res = await fetch("/api/operaciones/negocio/fechas", {
          cache: "no-store",
        });
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

  // Detalle del día seleccionado.
  const fetchData = async (f: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/operaciones/negocio?fecha=${f}`, {
        cache: "no-store",
      });
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

  // Serie histórica (depende de la moneda).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingSerie(true);
      try {
        const res = await fetch(
          `/api/operaciones/negocio/serie?moneda=${moneda}`,
          { cache: "no-store" },
        );
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
    return () => {
      cancelled = true;
    };
  }, [moneda]);

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

  // KPIs del día seleccionado (en la moneda elegida) — buscar en la serie
  // por fecha exacta. Si no aparece, todos en 0.
  const kpiHoy = useMemo<Record<NegocioCat, number>>(() => {
    const empty: Record<NegocioCat, number> = {
      compra: 0, venta: 0, susc_fci: 0, sol_susc_fci: 0, cauc_tom_ap: 0,
    };
    const row = serie.find((s) => s.fecha === fecha);
    if (!row) return empty;
    return {
      compra:       row.compra,
      venta:        row.venta,
      susc_fci:     row.susc_fci,
      sol_susc_fci: row.sol_susc_fci,
      cauc_tom_ap:  row.cauc_tom_ap,
    };
  }, [serie, fecha]);

  const chartData = useMemo(() => filtrarRango(serie, rango), [serie, rango]);

  // Boletos filtrados para la tabla — siempre filtra por moneda elegida,
  // luego por categoría/búsqueda si están aplicadas.
  const filteredBoletos = useMemo<Boleto[]>(() => {
    if (!data) return [];
    let out = data.boletos.filter((b) => (b.moneda ?? "ARS") === moneda);
    if (catFiltro) out = out.filter((b) => b.categoria === catFiltro);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter((b) =>
        [b.comprobante, b.cuenta, b.ticker, b.informacion, b.op]
          .map((v) => String(v ?? "").toLowerCase())
          .some((s) => s.includes(q)),
      );
    }
    return out;
  }, [data, moneda, catFiltro, search]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-auto bg-[#0a0a0a] text-[#d0d0d0]">
      <div className="p-4 space-y-4 max-w-full">

        {/* HEADER con fecha + meta + currency toggle */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[#1a1a1a] pb-3">
          <div className="inline-flex items-stretch border border-[#333] divide-x divide-[#333]">
            <button
              onClick={goPrev}
              disabled={!hayPrev}
              className="px-2 text-[#888] hover:text-[#ff9900] disabled:text-[#333] disabled:hover:bg-transparent"
              title="Día con data anterior"
            >‹</button>
            <select
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              disabled={fechasDisp.length === 0}
              className="bg-black px-2 py-1 text-[12px] font-mono text-[#d0d0d0] outline-none disabled:opacity-50"
            >
              {fechasDisp.length === 0 && <option value="">— sin datos —</option>}
              {fechasDisp.map((f) => (
                <option key={f.fecha} value={f.fecha}>
                  {fmtFechaDisplay(f.fecha)} ({f.n})
                </option>
              ))}
            </select>
            <button
              onClick={goNext}
              disabled={!hayNext}
              className="px-2 text-[#888] hover:text-[#ff9900] disabled:text-[#333] disabled:hover:bg-transparent"
              title="Día con data siguiente"
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

          {/* Currency toggle (a la derecha) */}
          <div className="ml-auto inline-flex items-stretch border border-[#333] divide-x divide-[#333]">
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
          <div className="border border-[#aa3333] bg-[#1a0808] p-3 text-[11px] text-[#ff7777]">
            {error}
          </div>
        )}

        {fechasLoaded && fechasDisp.length === 0 && !loading && (
          <div className="border border-[#1a1a1a] p-8 text-center text-[12px] text-[#666]">
            Aún no hay datos persistidos en CashFlow.NegocioMovimientos.
            <div className="mt-2 text-[10px]">
              El job corre cada hora 12-22 ART (L-V).
            </div>
          </div>
        )}

        {fechasDisp.length > 0 && (
          <>
            {/* KPIs — totales del día seleccionado en la moneda elegida */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {NEGOCIO_CATS.map((cat) => {
                const v = kpiHoy[cat];
                const color = CAT_COLOR[cat];
                return (
                  <div
                    key={cat}
                    className="border border-[#1a1a1a] bg-[#080808] p-3"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 inline-block" style={{ background: color }} />
                      <span className="text-[9px] uppercase tracking-widest text-[#888]">
                        {CAT_LABEL[cat]}
                      </span>
                    </div>
                    <div
                      className="text-[20px] font-mono tabular-nums"
                      style={{ color: v > 0 ? color : "#444" }}
                    >
                      {fmtCompact(v)}
                    </div>
                    <div className="text-[9px] text-[#666] mt-0.5">{moneda}</div>
                  </div>
                );
              })}
            </div>

            {/* CHART evolución diaria */}
            <div className="border border-[#1a1a1a] bg-[#080808]">
              <div className="flex items-center px-3 py-2 border-b border-[#1a1a1a]">
                <span className="text-[10px] uppercase tracking-widest text-[#666]">
                  Evolución diaria · {moneda}
                </span>
                {chartData.length > 0 && (
                  <span className="ml-3 text-[9px] text-[#555] font-mono">
                    {fmtFechaCorta(chartData[0].fecha)} → {fmtFechaCorta(chartData[chartData.length - 1].fecha)}
                  </span>
                )}
                {/* Range filter */}
                <div className="ml-auto inline-flex items-stretch border border-[#333] divide-x divide-[#333]">
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

              <div className="p-2 h-[340px]">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-[11px] text-[#555]">
                    Sin datos para {moneda} en este rango.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 16, bottom: 24, left: 8 }}
                      onClick={(state) => {
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
                        tickFormatter={fmtFechaCorta}
                        interval={Math.max(0, Math.floor(chartData.length / 8))}
                        angle={-30}
                        textAnchor="end"
                        height={32}
                      />
                      <YAxis
                        tick={{ fill: "#808080", fontSize: 10 }}
                        axisLine={{ stroke: "#2a2a2a" }}
                        tickLine={false}
                        tickFormatter={(v: number) => fmtCompact(v)}
                        width={56}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0e0e0e",
                          border: "1px solid #2a2a2a",
                          fontSize: 11,
                          fontFamily: "JetBrains Mono, monospace",
                        }}
                        labelStyle={{ color: "#808080" }}
                        labelFormatter={(v) => fmtFechaCorta(String(v))}
                        formatter={(v, name) => [
                          fmtCompact(Number(v)),
                          CAT_LABEL[name as NegocioCat] ?? String(name),
                        ]}
                      />
                      {fecha && fechasOrdenadasAsc.includes(fecha) && (
                        <ReferenceLine
                          x={fecha}
                          stroke="#ff9900"
                          strokeDasharray="3 3"
                          strokeOpacity={0.7}
                        />
                      )}
                      {NEGOCIO_CATS.map((cat) => (
                        <Line
                          key={cat}
                          type="monotone"
                          dataKey={cat}
                          stroke={CAT_COLOR[cat]}
                          strokeWidth={1.8}
                          dot={false}
                          activeDot={{ r: 4 }}
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Leyenda manual (legend nativa de recharts no permite color-code custom labels limpios) */}
              <div className="flex flex-wrap gap-3 px-3 pb-2 pt-1 text-[10px]">
                {NEGOCIO_CATS.map((cat) => (
                  <div key={cat} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-0.5 inline-block" style={{ background: CAT_COLOR[cat] }} />
                    <span className="text-[#888]">{CAT_LABEL[cat]}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* TABLA detalle del día */}
            {data && data.boletos.length > 0 && (
              <div className="border border-[#1a1a1a] bg-[#080808]">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1a1a1a] flex-wrap">
                  <span className="text-[10px] uppercase tracking-widest text-[#666]">
                    Detalle ({filteredBoletos.length} / {data.boletos.length})
                  </span>
                  {/* Chips de filtro por categoría — solo las 5 del chart */}
                  <div className="flex items-center gap-1">
                    {NEGOCIO_CATS.map((cat) => {
                      const boletoKey = CAT_BOLETO_KEY[cat];
                      const active = catFiltro === boletoKey;
                      return (
                        <button
                          key={cat}
                          onClick={() => setCatFiltro(active ? "" : boletoKey)}
                          className={
                            "px-2 py-0.5 text-[9px] uppercase tracking-wider border transition-colors " +
                            (active
                              ? "border-[#ff9900] text-[#ff9900]"
                              : "border-[#222] text-[#666] hover:text-[#ccc] hover:border-[#444]")
                          }
                          style={active ? undefined : { borderLeftColor: CAT_COLOR[cat], borderLeftWidth: 2 }}
                        >
                          {CAT_LABEL[cat]}
                        </button>
                      );
                    })}
                    {catFiltro && !NEGOCIO_CATS.some((c) => CAT_BOLETO_KEY[c] === catFiltro) && (
                      <span className="px-2 py-0.5 text-[9px] uppercase tracking-wider border border-[#ff9900] text-[#ff9900]">
                        {TABLE_CAT_LABEL[catFiltro] ?? catFiltro}
                        <button onClick={() => setCatFiltro("")} className="ml-1 hover:text-[#fff]">×</button>
                      </span>
                    )}
                  </div>

                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="buscar (cuenta / ticker / comprobante)…"
                    className="ml-auto flex-1 max-w-[280px] bg-black border border-[#333] px-2 py-0.5 text-[11px] font-mono text-[#d0d0d0]"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      className="text-[10px] text-[#888] hover:text-[#ff9900]"
                    >×</button>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] font-mono tabular-nums">
                    <thead className="bg-[#0f0f0f] text-[9px] uppercase tracking-widest text-[#666]">
                      <tr>
                        <th className="px-2 py-1 text-left">Categoría</th>
                        <th className="px-2 py-1 text-left">Comprobante</th>
                        <th className="px-2 py-1 text-left">Cuenta</th>
                        <th className="px-2 py-1 text-left">Op</th>
                        <th className="px-2 py-1 text-left">Ticker</th>
                        <th className="px-2 py-1 text-right">Cantidad</th>
                        <th className="px-2 py-1 text-right">Precio</th>
                        <th className="px-2 py-1 text-right">Importe</th>
                        <th className="px-2 py-1 text-left">Mon</th>
                        <th className="px-2 py-1 text-left">Plazo</th>
                        <th className="px-2 py-1 text-left">Lugar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBoletos.map((b) => {
                        const color = TABLE_CAT_COLOR[b.categoria] ?? "#666";
                        const label = TABLE_CAT_LABEL[b.categoria] ?? b.categoria;
                        const cantClr = (b.cantidad ?? 0) > 0
                          ? "text-[#3fbf6f]"
                          : (b.cantidad ?? 0) < 0 ? "text-[#ff5d6c]" : "text-[#888]";
                        const impClr = (b.importe ?? 0) > 0
                          ? "text-[#3fbf6f]"
                          : (b.importe ?? 0) < 0 ? "text-[#ff5d6c]" : "text-[#888]";
                        return (
                          <tr
                            key={b.comprobante}
                            className="border-t border-[#1a1a1a] hover:bg-[#0f0f0f]"
                          >
                            <td className="px-2 py-1">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 inline-block" style={{ background: color }} />
                                <span style={{ color }}>{label}</span>
                              </span>
                            </td>
                            <td className="px-2 py-1 text-[#888]">{b.comprobante}</td>
                            <td className="px-2 py-1 text-[#888] truncate max-w-[200px]" title={b.cuenta ?? ""}>
                              {b.cuenta ?? "—"}
                            </td>
                            <td className="px-2 py-1 text-[#d0d0d0]">{b.op ?? "—"}</td>
                            <td className="px-2 py-1 text-[#ff9900]">{b.ticker ?? "—"}</td>
                            <td className={`px-2 py-1 text-right ${cantClr}`}>
                              {fmtNum(b.cantidad, 2)}
                            </td>
                            <td className="px-2 py-1 text-right text-[#d0d0d0]">
                              {fmtNum(b.precio, 2)}
                            </td>
                            <td className={`px-2 py-1 text-right ${impClr}`}>
                              {fmtNum(b.importe, 2)}
                            </td>
                            <td className="px-2 py-1 text-[#888]">{b.moneda ?? "—"}</td>
                            <td className="px-2 py-1 text-[#888]">{b.plazo ?? "—"}</td>
                            <td className="px-2 py-1 text-[#888]">{b.lugar ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredBoletos.length === 0 && (
                    <div className="p-8 text-center text-[11px] text-[#666]">
                      Sin boletos para los filtros aplicados.
                    </div>
                  )}
                </div>
              </div>
            )}

            {data && data.boletos.length === 0 && !loading && (
              <div className="border border-[#1a1a1a] p-6 text-center text-[12px] text-[#666]">
                Sin boletos en esta fecha.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
