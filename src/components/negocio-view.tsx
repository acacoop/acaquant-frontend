"use client";

import { useState, useMemo, useEffect } from "react";

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

interface Agregado {
  categoria: string;
  n: number;
  importe_neto: number;
  importe_abs: number;
  n_cuentas: number;
  n_tickers: number;
  monedas: string[];
}

interface TopTicker {
  ticker: string;
  n: number;
  importe_abs: number;
}

interface NegocioResp {
  meta: {
    fecha: string;
    n_boletos: number;
    n_categorias: number;
    ultima_ingesta: string | null;
  };
  agregados: Agregado[];
  top_tickers: TopTicker[];
  boletos: Boleto[];
}

// ── Constantes ────────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  compra:                    "#3fbf6f",
  venta:                     "#ff5d6c",
  suscripcion_fci:           "#3fbf6f",
  rescate_fci:               "#ff5d6c",
  solicitud_suscripcion_fci: "#3fbf6f",
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

const CAT_LABEL: Record<string, string> = {
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

function todayART(): string {
  // ART = UTC-3. Restamos 3h al "ahora" UTC y leemos su date ISO.
  // Independiente de la timezone del browser (Date.now() siempre UTC ms).
  const ar = new Date(Date.now() - 3 * 60 * 60_000);
  return ar.toISOString().slice(0, 10);
}

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

// ── DatePicker compacto (reusable, simplificado) ──────────────────────────

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtFechaDisplay(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}

function addDays(s: string, n: number): string {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// ── Vista principal ───────────────────────────────────────────────────────

export function NegocioView() {
  const [fecha, setFecha] = useState<string>(todayART());
  const [data, setData] = useState<NegocioResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [catFiltro, setCatFiltro] = useState<string>("");
  const [search, setSearch] = useState("");

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
    fetchData(fecha);
  }, [fecha]);

  const today = todayART();
  const isToday = fecha === today;
  const isFuture = fecha > today;

  const filteredBoletos = useMemo<Boleto[]>(() => {
    if (!data) return [];
    let out = data.boletos;
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
  }, [data, catFiltro, search]);

  const totalImporteAbs = data?.agregados.reduce((acc, a) => acc + a.importe_abs, 0) || 0;

  return (
    <div className="h-full overflow-auto bg-[#0a0a0a] text-[#d0d0d0]">
      <div className="p-4 space-y-4 max-w-full">
        {/* HEADER con fecha + meta */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[#1a1a1a] pb-3">
          <div className="inline-flex items-stretch border border-[#333] divide-x divide-[#333]">
            <button
              onClick={() => setFecha(addDays(fecha, -1))}
              className="px-2 text-[#888] hover:text-[#ff9900]"
            >‹</button>
            <input
              type="date"
              value={fecha}
              max={today}
              onChange={(e) => setFecha(e.target.value)}
              className="bg-black px-2 py-1 text-[12px] font-mono text-[#d0d0d0]"
            />
            <button
              onClick={() => setFecha(addDays(fecha, 1))}
              disabled={isFuture}
              className="px-2 text-[#888] hover:text-[#ff9900] disabled:text-[#333]"
            >›</button>
            <button
              onClick={() => setFecha(today)}
              disabled={isToday}
              className="px-2 text-[10px] uppercase tracking-wider bg-[#0a0a0a] text-[#888] hover:text-[#ff9900] disabled:text-[#444]"
            >Hoy</button>
          </div>

          <div className="text-[14px] font-mono text-[#ff9900]">
            {fmtFechaDisplay(fecha)}
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

          {loading && <span className="text-[10px] text-[#888]">cargando…</span>}
          <button
            onClick={() => fetchData(fecha)}
            className="ml-auto bg-[#0f0f0f] border border-[#333] px-3 py-1 text-[10px] uppercase tracking-wider text-[#888] hover:text-[#ff9900]"
          >
            ↻ Refresh
          </button>
        </div>

        {error && (
          <div className="border border-[#aa3333] bg-[#1a0808] p-3 text-[11px] text-[#ff7777]">
            {error}
          </div>
        )}

        {data && data.meta.n_boletos === 0 && !loading && (
          <div className="border border-[#1a1a1a] p-8 text-center text-[12px] text-[#666]">
            Sin boletos para esta fecha.
            <div className="mt-2 text-[10px]">
              El job corre cada hora 12-22 ART (L-V). Si es muy temprano o fin de semana, todavía no hay data.
            </div>
          </div>
        )}

        {data && data.agregados.length > 0 && (
          <>
            {/* CARDS por categoría — el corazón gerencial */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {data.agregados.map((a) => {
                const color = CAT_COLOR[a.categoria] ?? "#666";
                const label = CAT_LABEL[a.categoria] ?? a.categoria;
                const pct = totalImporteAbs > 0 ? (a.importe_abs / totalImporteAbs) * 100 : 0;
                const active = catFiltro === a.categoria;
                return (
                  <button
                    key={a.categoria}
                    onClick={() => setCatFiltro(active ? "" : a.categoria)}
                    className={
                      "relative text-left border bg-[#080808] p-3 transition-colors " +
                      (active
                        ? "border-[#ff9900]"
                        : "border-[#1a1a1a] hover:border-[#333]")
                    }
                  >
                    {/* barra de proporción al fondo */}
                    <div
                      className="absolute inset-x-0 bottom-0 h-0.5"
                      style={{ background: color, width: `${pct}%` }}
                    />
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 inline-block" style={{ background: color }} />
                      <span className="text-[9px] uppercase tracking-widest text-[#888]">
                        {label}
                      </span>
                    </div>
                    <div className="text-[20px] font-mono tabular-nums text-[#d0d0d0]">
                      {a.n}
                    </div>
                    <div className="text-[10px] text-[#888] mt-1">
                      <span className={a.importe_neto >= 0 ? "text-[#3fbf6f]" : "text-[#ff5d6c]"}>
                        {fmtCompact(a.importe_neto)}
                      </span>{" "}
                      neto · <span className="text-[#888]">{fmtCompact(a.importe_abs)}</span> abs
                    </div>
                    <div className="text-[9px] text-[#666] mt-0.5">
                      {a.n_cuentas} cta · {a.n_tickers} tck
                      {a.monedas.length > 0 && ` · ${a.monedas.join(",")}`}
                    </div>
                    <div className="text-[9px] text-[#444] mt-0.5">{pct.toFixed(1)}% del total</div>
                  </button>
                );
              })}
            </div>

            {/* TOP TICKERS — leaderboard */}
            {data.top_tickers.length > 0 && (
              <div className="border border-[#1a1a1a] bg-[#080808]">
                <div className="px-3 py-2 border-b border-[#1a1a1a] text-[10px] uppercase tracking-widest text-[#666]">
                  Top 20 tickers por volumen del día
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3 gap-y-1 p-3">
                  {data.top_tickers.map((t) => (
                    <button
                      key={t.ticker}
                      onClick={() => setSearch(t.ticker)}
                      className="flex items-baseline gap-2 text-left hover:bg-[#0f0f0f] px-1 py-0.5"
                    >
                      <span className="w-16 text-[12px] text-[#ff9900] font-mono">{t.ticker}</span>
                      <span className="text-[10px] text-[#666] w-6">{t.n}</span>
                      <span className="text-[11px] font-mono text-[#d0d0d0]">
                        {fmtCompact(t.importe_abs)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* TABLA de boletos */}
            <div className="border border-[#1a1a1a] bg-[#080808]">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1a1a1a]">
                <span className="text-[10px] uppercase tracking-widest text-[#666]">
                  Detalle ({filteredBoletos.length} / {data.boletos.length})
                </span>
                {catFiltro && (
                  <button
                    onClick={() => setCatFiltro("")}
                    className="text-[9px] text-[#ff9900] hover:underline uppercase tracking-wider"
                  >
                    × {CAT_LABEL[catFiltro] ?? catFiltro}
                  </button>
                )}
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
                      const color = CAT_COLOR[b.categoria] ?? "#666";
                      const label = CAT_LABEL[b.categoria] ?? b.categoria;
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
          </>
        )}
      </div>
    </div>
  );
}
