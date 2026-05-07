"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

interface PnLRow {
  ticker: string;
  unidad: string;
  cantidad_actual: number;
  valor_actual: number;
  cash_pagado: number;
  cash_cobrado_venta: number;
  cash_cobrado_pasivo: number;
  breakdown_pasivo: Record<string, number>;
  pnl_total: number;
  pnl_pct: number | null;
  completeness: "completa" | "parcial" | "sin_boletos";
  moneda_mixta: boolean;
  n_movimientos: number;
  fechas_sin_mep: string[];
}

interface PnLResp {
  id_cuenta: string;
  fecha_actual: string | null;
  rows: PnLRow[];
  totales: {
    cash_pagado:         number;
    cash_cobrado_venta:  number;
    cash_cobrado_pasivo: number;
    valor_actual:        number;
    pnl_total:           number;
    pnl_pct:             number | null;
  };
  n_tickers: number;
}

type SortKey = "pnl_total" | "pnl_pct" | "valor_actual" | "cash_pagado" | "ticker";

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return sign + "$" + (abs / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return sign + "$" + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(1) + "K";
  return sign + "$" + abs.toFixed(0);
}

function fmtSigned(n: number): string {
  return (n > 0 ? "+" : "") + fmtCompact(n);
}

// ── Component ─────────────────────────────────────────────────────────────

export function PnLTitulosView({ idCuenta }: { idCuenta: string }) {
  const [data, setData] = useState<PnLResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("pnl_total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
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
      soloActivos ? r.cantidad_actual !== 0 : true,
    );
  }, [data, soloActivos]);

  const filasOrdenadas = useMemo(() => {
    const sgn = sortDir === "asc" ? 1 : -1;
    return [...filasFiltradas].sort((a, b) => {
      if (sortKey === "ticker") {
        return a.ticker.localeCompare(b.ticker) * sgn;
      }
      const av = a[sortKey] ?? Number.NEGATIVE_INFINITY;
      const bv = b[sortKey] ?? Number.NEGATIVE_INFINITY;
      return ((av as number) - (bv as number)) * sgn;
    });
  }, [filasFiltradas, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const arrow = (k: SortKey) => sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "";

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

  return (
    <div className="h-full flex flex-col gap-3 p-3 overflow-hidden">
      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        <Kpi label="PNL TOTAL" value={fmtSigned(t.pnl_total)}
             accent={t.pnl_total >= 0 ? "#00cc66" : "#ff4d4d"}
             sub={t.pnl_pct != null ? `${t.pnl_pct >= 0 ? "+" : ""}${t.pnl_pct.toFixed(2)}%` : ""} />
        <Kpi label="VALOR ACTUAL"    value={fmtCompact(t.valor_actual)} />
        <Kpi label="CASH PAGADO"     value={fmtCompact(t.cash_pagado)} />
        <Kpi label="COBRADO (VENTAS)" value={fmtCompact(t.cash_cobrado_venta)} />
        <Kpi label="COBRADO (PASIVO)" value={fmtCompact(t.cash_cobrado_pasivo)}
             sub="cupones · divs · amorts" />
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
                  <th onClick={() => toggleSort("ticker")} className="px-3 py-2 text-left cursor-pointer hover:text-[#ff9900] select-none">TICKER {arrow("ticker")}</th>
                  <th className="px-3 py-2 text-right">CANT</th>
                  <th onClick={() => toggleSort("cash_pagado")} className="px-3 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">PAGADO {arrow("cash_pagado")}</th>
                  <th className="px-3 py-2 text-right">COBRADO V</th>
                  <th className="px-3 py-2 text-right">COBRADO P</th>
                  <th onClick={() => toggleSort("valor_actual")} className="px-3 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">VALOR HOY {arrow("valor_actual")}</th>
                  <th onClick={() => toggleSort("pnl_total")} className="px-3 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">PNL {arrow("pnl_total")}</th>
                  <th onClick={() => toggleSort("pnl_pct")} className="px-3 py-2 text-right cursor-pointer hover:text-[#ff9900] select-none">PNL % {arrow("pnl_pct")}</th>
                  <th className="px-3 py-2 text-right">FLAGS</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((r) => {
                  const expanded = expandedTicker === r.ticker;
                  const tieneBreakdown = Object.keys(r.breakdown_pasivo).length > 0;
                  return (
                    <Fragment key={r.ticker}>
                      <tr
                        onClick={() => setExpandedTicker(expanded ? null : r.ticker)}
                        className="border-b border-[#111] hover:bg-[#ff9900]/5 cursor-pointer"
                      >
                        <td className="px-3 py-1.5 text-[#d0d0d0]">
                          <span className="text-[#666] mr-1">{tieneBreakdown ? (expanded ? "▼" : "▶") : "·"}</span>
                          {r.ticker}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[#d0d0d0]">{r.cantidad_actual.toLocaleString("es-AR")}</td>
                        <td className="px-3 py-1.5 text-right text-[#888]">{r.cash_pagado > 0 ? fmtCompact(r.cash_pagado) : "—"}</td>
                        <td className="px-3 py-1.5 text-right text-[#888]">{r.cash_cobrado_venta !== 0 ? fmtCompact(r.cash_cobrado_venta) : "—"}</td>
                        <td className="px-3 py-1.5 text-right text-[#888]">{r.cash_cobrado_pasivo !== 0 ? fmtCompact(r.cash_cobrado_pasivo) : "—"}</td>
                        <td className="px-3 py-1.5 text-right text-[#d0d0d0]">{fmtCompact(r.valor_actual)}</td>
                        <td className={`px-3 py-1.5 text-right font-semibold ${r.pnl_total > 0 ? "text-[#00cc66]" : r.pnl_total < 0 ? "text-[#ff4d4d]" : "text-[#888]"}`}>
                          {fmtSigned(r.pnl_total)}
                        </td>
                        <td className={`px-3 py-1.5 text-right text-[10px] ${r.pnl_pct != null && r.pnl_pct > 0 ? "text-[#00cc66]" : r.pnl_pct != null && r.pnl_pct < 0 ? "text-[#ff4d4d]" : "text-[#888]"}`}>
                          {r.pnl_pct != null ? `${r.pnl_pct >= 0 ? "+" : ""}${r.pnl_pct.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-[9px]">
                          {r.completeness === "parcial" && <span className="px-1 py-0 bg-[#ff9900]/15 text-[#ff9900] tracking-widest">PARCIAL</span>}
                          {r.completeness === "sin_boletos" && <span className="px-1 py-0 bg-[#ff4d4d]/15 text-[#ff4d4d] tracking-widest">SIN BOLETOS</span>}
                          {r.moneda_mixta && <span className="ml-1 px-1 py-0 bg-[#4a9eff]/15 text-[#4a9eff] tracking-widest">USD/ARS</span>}
                        </td>
                      </tr>
                      {expanded && tieneBreakdown && (
                        <tr className="bg-[#060606] border-b border-[#111]">
                          <td colSpan={9} className="px-6 py-2 text-[10px] text-[#888]">
                            <div className="flex flex-wrap gap-x-6 gap-y-1">
                              <span className="text-[#666] tracking-widest">BREAKDOWN PASIVO:</span>
                              {Object.entries(r.breakdown_pasivo).map(([op, val]) => (
                                <span key={op}>
                                  <span className="text-[#666]">{op}:</span> <span className="text-[#d0d0d0]">{fmtCompact(val)}</span>
                                </span>
                              ))}
                            </div>
                            {r.fechas_sin_mep.length > 0 && (
                              <div className="mt-1 text-[9px] text-[#ff9900]">
                                ⚠ {r.fechas_sin_mep.length} fechas sin MEP — montos USD sin pesificar
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
