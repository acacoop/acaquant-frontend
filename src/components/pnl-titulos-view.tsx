"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

interface BoletoDetalle {
  fecha: string;
  categoria: string;
  op: string;
  cantidad: number;
  precio: number;
  importe: number;       // crudo en moneda original
  importe_ars: number;   // pesificado
  moneda: string;
  mep: number | null;
}

interface PnLRow {
  ticker: string;            // match key — único interno (ej CAFCI..., AL30)
  display_name?: string;     // nombre humano para mostrar (Assets.TICKER)
  unidad: string;
  qty_aum: number;
  qty_calc: number;
  qty_efectiva?: number;     // qty usado en el cálculo de valor (live)
  qty_compras: number;
  qty_ventas: number;
  precio_actual: number;
  precio_promedio: number | null;
  costo_remanente: number;
  valor_actual_aum: number;       // legado del AuM (valuación del cierre)
  valor_actual_live?: number;     // qty × precio_live (con normalizer por tipo)
  valor_actual_source?: "live" | "cierre" | "aum";
  pnl_realizado: number;
  pnl_no_realizado: number | null;
  pnl_pasivo: number;
  breakdown_pasivo: Record<string, number>;
  pnl_total: number;
  completeness: "completa" | "parcial" | "sin_boletos";
  moneda_mixta: boolean;
  n_movimientos: number;
  fechas_sin_mep: string[];
  boletos: BoletoDetalle[];
}

interface PnLResp {
  id_cuenta: string;
  fecha_actual: string | null;
  rows: PnLRow[];
  totales: {
    costo_remanente:  number;
    valor_actual:     number;
    pnl_realizado:    number;
    pnl_no_realizado: number;
    pnl_pasivo:       number;
    pnl_total:        number;
  };
  n_tickers: number;
}

type SortKey =
  | "pnl_total"
  | "pnl_no_realizado"
  | "pnl_pasivo"
  | "valor_actual_aum"
  | "costo_remanente"
  | "ticker";

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return sign + "$" + (abs / 1e12).toFixed(2) + "T";
  if (abs >= 1e9)  return sign + "$" + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6)  return sign + "$" + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3)  return sign + "$" + (abs / 1e3).toFixed(1) + "K";
  return sign + "$" + abs.toFixed(0);
}

function fmtSigned(n: number): string {
  return (n > 0 ? "+" : "") + fmtCompact(n);
}

function pnlClass(n: number | null | undefined): string {
  if (n == null) return "text-[#888]";
  if (n > 0) return "text-[#00cc66]";
  if (n < 0) return "text-[#ff4d4d]";
  return "text-[#888]";
}

// Filtra boletos al "período activo del stock actual" — desde la última
// vez que qty pasó por 0. Los boletos previos se compensaron entre sí
// (compras + ventas que cerraron lots) y no aportan al cost basis vivo.
// Las acreencias (cupones / divs / amorts) NO mueven qty, así que no
// fuerzan reset — quedan dentro del slice si están temporalmente
// posteriores al último reset (lo que es lo correcto: cobros sobre el
// stock vivo).
function _filtrarPeriodoActual(boletos: BoletoDetalle[]): BoletoDetalle[] {
  let qty = 0;
  let inicio = 0;
  for (let i = 0; i < boletos.length; i++) {
    const b = boletos[i];
    const cant = Math.abs(b.cantidad || 0);
    const antes = qty;
    if (b.categoria === "compra" || b.categoria === "suscripcion_fci") {
      qty += cant;
    } else if (b.categoria === "venta" || b.categoria === "rescate_fci") {
      qty -= cant;
    }
    if (antes > 0 && qty <= 0) {
      inicio = i + 1;
    }
  }
  return boletos.slice(inicio);
}

function _statsDelPeriodo(boletos: BoletoDetalle[]) {
  let compras = 0;
  let ventas = 0;
  const breakdownPasivo: Record<string, number> = {};
  for (const b of boletos) {
    const cant = Math.abs(b.cantidad || 0);
    if (b.categoria === "compra" || b.categoria === "suscripcion_fci") {
      compras += cant;
    } else if (b.categoria === "venta" || b.categoria === "rescate_fci") {
      ventas += cant;
    } else if (b.categoria === "acreencia") {
      const op = b.op || "Otros";
      breakdownPasivo[op] = (breakdownPasivo[op] || 0) + (b.importe_ars || 0);
    }
  }
  return { compras, ventas, neto: compras - ventas, breakdownPasivo };
}

// ── Component ─────────────────────────────────────────────────────────────

export function PnLTitulosView({ idCuenta }: { idCuenta: string }) {
  const [data, setData]         = useState<PnLResp | null>(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [sortKey, setSortKey]   = useState<SortKey>("pnl_total");
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("desc");
  const [soloActivos, setSoloActivos] = useState(true);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

  useEffect(() => {
    if (!idCuenta) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await fetch(
          `/api/aum-pnl?id_cuenta=${encodeURIComponent(idCuenta)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setData(json);
        setExpandedTicker(null);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [idCuenta]);

  const filasFiltradas = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) =>
      // Solo lo que tenés HOY en cartera (qty_aum > 0). Tickers que
      // operaste pero ya cerraste (qty_aum=0) quedan ocultos cuando
      // soloActivos está checked. Para verlos, destildá el toggle.
      soloActivos ? r.qty_aum > 0 : true,
    );
  }, [data, soloActivos]);

  // Total mostrado en UI = no_realizado + pasivo. Realizado se excluye
  // hasta que tengamos la vista histórica de realizado (futuro). El
  // backend sigue devolviendo `pnl_realizado` y `pnl_total` (que lo
  // incluye) — acá los ignoramos para no presentar números mezclados.
  const totalView = (r: PnLRow) => (r.pnl_no_realizado ?? 0) + r.pnl_pasivo;

  const filasOrdenadas = useMemo(() => {
    const sgn = sortDir === "asc" ? 1 : -1;
    return [...filasFiltradas].sort((a, b) => {
      if (sortKey === "ticker") return a.ticker.localeCompare(b.ticker) * sgn;
      if (sortKey === "pnl_total") return (totalView(a) - totalView(b)) * sgn;
      const av = (a[sortKey] ?? Number.NEGATIVE_INFINITY) as number;
      const bv = (b[sortKey] ?? Number.NEGATIVE_INFINITY) as number;
      return (av - bv) * sgn;
    });
  }, [filasFiltradas, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const arrow = (k: SortKey) =>
    sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "";

  if (!idCuenta) {
    return <div className="h-full flex items-center justify-center text-[#555] text-[11px]">Elegí una cuenta.</div>;
  }
  if (err) {
    return <div className="p-3 text-[11px] text-[#ff4d4d]">Error: {err}</div>;
  }
  if (loading && !data) {
    return <div className="h-full flex items-center justify-center text-[#555] text-[11px]">Cargando…</div>;
  }
  if (!data) return null;

  const t = data.totales;
  const pnlTotalView = t.pnl_no_realizado + t.pnl_pasivo;

  return (
    <div className="h-full flex flex-col gap-3 p-3 overflow-hidden">
      {/* KPIs — descomposición del PNL */}
      <div className="grid grid-cols-4 gap-3">
        <Kpi label="PNL TOTAL"
             value={fmtSigned(pnlTotalView)}
             accent={pnlTotalView >= 0 ? "#00cc66" : "#ff4d4d"}
             sub="papel + cobros"
        />
        <Kpi label="PNL NO REALIZADO"
             value={fmtSigned(t.pnl_no_realizado)}
             accent={t.pnl_no_realizado >= 0 ? "#00cc66" : "#ff4d4d"}
             sub="stock vivo · papel"
        />
        <Kpi label="PNL PASIVO"
             value={fmtSigned(t.pnl_pasivo)}
             accent={t.pnl_pasivo >= 0 ? "#00cc66" : "#ff4d4d"}
             sub="cupones · divs · amorts"
        />
        <Kpi label="VALOR ACTUAL"
             value={fmtCompact(t.valor_actual)}
             sub={t.costo_remanente > 0 ? `costo: ${fmtCompact(t.costo_remanente)}` : ""}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-2">
        <label className="flex items-center gap-2 text-[10px] tracking-widest text-[#888] cursor-pointer">
          <input
            type="checkbox"
            checked={soloActivos}
            onChange={(e) => setSoloActivos(e.target.checked)}
            className="accent-[#ff9900]"
          />
          SOLO ACTIVOS (cantidad &gt; 0)
        </label>
        <span className="text-[9px] text-[#555] ml-auto font-mono">
          {filasOrdenadas.length} / {data.n_tickers} tickers
          {data.fecha_actual ? ` · al ${data.fecha_actual}` : ""}
        </span>
      </div>

      {/* Tabla */}
      <div className="border border-[#1a1a1a] bg-[#080808] flex-1 min-h-0 overflow-hidden flex flex-col">
        {filasOrdenadas.length === 0 ? (
          <div className="p-6 text-center text-[#555] text-[11px]">Sin tickers para mostrar.</div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-[#0e0e0e] border-b border-[#1a1a1a] z-10">
                <tr className="text-[9px] tracking-widest text-[#888]">
                  <th onClick={() => toggleSort("ticker")} className="px-3 py-2 text-left cursor-pointer hover:text-[#ff9900] select-none">
                    TICKER {arrow("ticker")}
                  </th>
                  <th className="px-3 py-2 text-right">CANTIDAD</th>
                  <th onClick={() => toggleSort("costo_remanente")} className="px-3 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">
                    COSTO {arrow("costo_remanente")}
                  </th>
                  <th onClick={() => toggleSort("valor_actual_aum")} className="px-3 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">
                    VALOR ACTUAL {arrow("valor_actual_aum")}
                  </th>
                  <th onClick={() => toggleSort("pnl_no_realizado")} className="px-3 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">
                    NO REALIZADO {arrow("pnl_no_realizado")}
                  </th>
                  <th onClick={() => toggleSort("pnl_pasivo")} className="px-3 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">
                    COBROS {arrow("pnl_pasivo")}
                  </th>
                  <th onClick={() => toggleSort("pnl_total")} className="px-3 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">
                    PNL TOTAL {arrow("pnl_total")}
                  </th>
                  <th className="px-3 py-2 text-right">FLAGS</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((r) => {
                  const expanded = expandedTicker === r.ticker;
                  // Boletos y stats del período activo (descartamos historia
                  // ya cerrada, mostramos solo lo que compone el stock actual
                  // + cobros pasivos sobre ese stock).
                  const boletosPeriodo = _filtrarPeriodoActual(r.boletos);
                  const stats = _statsDelPeriodo(boletosPeriodo);
                  const tieneBreakdown = Object.keys(stats.breakdownPasivo).length > 0;
                  return (
                    <Fragment key={r.ticker}>
                      <tr
                        onClick={() => setExpandedTicker(expanded ? null : r.ticker)}
                        className="border-b border-[#111] hover:bg-[#ff9900]/5 cursor-pointer"
                      >
                        <td className="px-3 py-1.5 text-[#d0d0d0]">
                          <span className="text-[#666] mr-1">{r.boletos.length > 0 ? (expanded ? "▼" : "▶") : "·"}</span>
                          {r.display_name || r.ticker}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[#d0d0d0]">
                          {r.qty_aum.toLocaleString("es-AR")}
                          {r.qty_calc !== r.qty_aum && (
                            <span className="ml-1 text-[#ff9900] text-[9px]" title={`Boletos: ${r.qty_calc}`}>
                              ({r.qty_calc.toLocaleString("es-AR")})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[#888]">
                          {r.costo_remanente > 0 ? fmtCompact(r.costo_remanente) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[#d0d0d0]">
                          {fmtCompact(r.valor_actual_live ?? r.valor_actual_aum)}
                          {r.valor_actual_source === "live" && (
                            <span className="ml-1 text-[8px] text-[#00cc66] tracking-widest">LIVE</span>
                          )}
                          {r.valor_actual_source === "cierre" && (
                            <span className="ml-1 text-[8px] text-[#888] tracking-widest">CIERRE</span>
                          )}
                          {r.valor_actual_source === "aum" && (
                            <span className="ml-1 text-[8px] text-[#666] tracking-widest">AUM</span>
                          )}
                        </td>
                        <td className={`px-3 py-1.5 text-right ${pnlClass(r.pnl_no_realizado)}`}>
                          {r.pnl_no_realizado != null ? fmtSigned(r.pnl_no_realizado) : "—"}
                        </td>
                        <td className={`px-3 py-1.5 text-right ${pnlClass(r.pnl_pasivo)}`}>
                          {r.pnl_pasivo !== 0 ? fmtSigned(r.pnl_pasivo) : "—"}
                        </td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${pnlClass(totalView(r))}`}>
                          {fmtSigned(totalView(r))}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[9px]">
                          {r.completeness === "parcial" && (
                            <span className="px-1 py-0 bg-[#ff9900]/15 text-[#ff9900] tracking-widest">PARCIAL</span>
                          )}
                          {r.completeness === "sin_boletos" && (
                            <span className="px-1 py-0 bg-[#ff4d4d]/15 text-[#ff4d4d] tracking-widest">SIN BOLETOS</span>
                          )}
                          {r.moneda_mixta && (
                            <span className="ml-1 px-1 py-0 bg-[#4a9eff]/15 text-[#4a9eff] tracking-widest">USD/ARS</span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-[#060606] border-b border-[#111]">
                          <td colSpan={8} className="px-6 py-3 text-[10px] text-[#888]">
                            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                              <div>
                                <span className="text-[#666] tracking-widest">FLUJO (STOCK ACTUAL):</span>{" "}
                                {stats.compras > 0 && <span>compras: {stats.compras.toLocaleString("es-AR")} · </span>}
                                {stats.ventas > 0 && <span>ventas: {stats.ventas.toLocaleString("es-AR")} · </span>}
                                <span>neto: {stats.neto.toLocaleString("es-AR")}</span>
                                {r.qty_calc !== r.qty_aum && (
                                  <span className="text-[#ff9900]"> · AuM: {r.qty_aum.toLocaleString("es-AR")} (Δ {(r.qty_aum - r.qty_calc).toLocaleString("es-AR")})</span>
                                )}
                                <span className="text-[#444]"> · {boletosPeriodo.length}/{r.boletos.length} movs</span>
                              </div>
                              {tieneBreakdown && (
                                <div>
                                  <span className="text-[#666] tracking-widest">COBROS PASIVOS (PERÍODO):</span>{" "}
                                  {Object.entries(stats.breakdownPasivo).map(([op, val]) => (
                                    <span key={op}>
                                      <span className="text-[#666]">{op}:</span> <span className="text-[#d0d0d0]">{fmtCompact(val)}</span>
                                      {" · "}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {r.fechas_sin_mep.length > 0 && (
                              <div className="mt-1 text-[9px] text-[#ff9900]">
                                ⚠ {r.fechas_sin_mep.length} fechas sin MEP — montos USD sin pesificar correctamente
                              </div>
                            )}

                            {/* Tabla de boletos del período activo */}
                            {boletosPeriodo.length > 0 && (
                              <div className="mt-3 border-t border-[#1a1a1a] pt-2">
                                <div className="text-[#666] tracking-widest mb-1">
                                  BOLETOS DEL STOCK ACTUAL ({boletosPeriodo.length}
                                  {r.boletos.length > boletosPeriodo.length && (
                                    <span className="text-[#444]"> · {r.boletos.length - boletosPeriodo.length} históricos ocultos</span>
                                  )}
                                  ):
                                </div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-[10px] font-mono">
                                    <thead className="text-[9px] text-[#555] tracking-widest">
                                      <tr>
                                        <th className="px-2 py-1 text-left">FECHA</th>
                                        <th className="px-2 py-1 text-left">OP</th>
                                        <th className="px-2 py-1 text-right">CANT</th>
                                        <th className="px-2 py-1 text-right">PRECIO</th>
                                        <th className="px-2 py-1 text-right">IMPORTE</th>
                                        <th className="px-2 py-1 text-left">MON</th>
                                        <th className="px-2 py-1 text-right">MEP</th>
                                        <th className="px-2 py-1 text-right">IMPORTE ARS</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {boletosPeriodo.map((b, i) => {
                                        const colorImporte =
                                          b.importe > 0 ? "text-[#00cc66]"
                                          : b.importe < 0 ? "text-[#ff4d4d]"
                                          : "text-[#888]";
                                        return (
                                          <tr key={i} className="border-t border-[#111] hover:bg-[#0d0d0d]">
                                            <td className="px-2 py-0.5 text-[#d0d0d0]">{b.fecha}</td>
                                            <td className="px-2 py-0.5 text-[#888]">{b.op || b.categoria}</td>
                                            <td className="px-2 py-0.5 text-right text-[#d0d0d0]">
                                              {b.cantidad ? b.cantidad.toLocaleString("es-AR") : "—"}
                                            </td>
                                            <td className="px-2 py-0.5 text-right text-[#888]">
                                              {b.precio ? b.precio.toLocaleString("es-AR", { maximumFractionDigits: 4 }) : "—"}
                                            </td>
                                            <td className={`px-2 py-0.5 text-right ${colorImporte}`}>
                                              {b.importe ? b.importe.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
                                            </td>
                                            <td className="px-2 py-0.5 text-[#888]">{b.moneda}</td>
                                            <td className="px-2 py-0.5 text-right text-[#666]">
                                              {b.mep ? b.mep.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
                                            </td>
                                            <td className={`px-2 py-0.5 text-right ${colorImporte}`}>
                                              {b.importe_ars ? fmtCompact(b.importe_ars) : "—"}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2">
      <div className="text-[10px] text-[#555] uppercase tracking-wide">{label}</div>
      <div className="text-[18px] font-semibold truncate" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="text-[10px] text-[#666]">{sub}</div>}
    </div>
  );
}
