"use client";

import { useEffect, useMemo, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────

export interface BoletoDetalle {
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

export interface PnLRow {
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
  pnl_realizado_dia?: number;     // day-trades cerrados intraday
  pnl_no_realizado: number | null;
  pnl_pasivo: number;
  pnl_pasivo_dia?: number;        // cobros pasivos intraday
  breakdown_pasivo: Record<string, number>;
  pnl_total: number;
  // ── Espejo USD (costo a MEP histórico, valor a MEP de hoy). Opcionales:
  // solo presentes una vez que el cache PnLTotalesCache se recalcula. ──
  costo_remanente_usd?: number;
  valor_actual_usd?: number | null;
  pnl_realizado_usd?: number;
  pnl_realizado_dia_usd?: number;
  pnl_no_realizado_usd?: number | null;
  pnl_pasivo_usd?: number;
  pnl_pasivo_dia_usd?: number;
  pnl_total_usd?: number;
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
    costo_remanente:    number;
    valor_actual:       number;
    pnl_realizado:      number;
    pnl_realizado_dia?: number;
    pnl_no_realizado:   number;
    pnl_pasivo:         number;
    pnl_pasivo_dia?:    number;
    pnl_total:          number;
    // Espejo USD (costo a MEP histórico, valor a MEP de hoy).
    costo_remanente_usd?:  number;
    valor_actual_usd?:     number;
    pnl_no_realizado_usd?: number;
    pnl_pasivo_usd?:       number;
  };
  n_tickers: number;
}

type Moneda = "ARS" | "USD";

type SortKey =
  | "pnl_total"
  | "pnl_no_realizado"
  | "pnl_pasivo"
  | "valor_actual_aum"
  | "costo_remanente"
  | "ticker";

// ── Helpers ───────────────────────────────────────────────────────────────

export function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return sign + "$" + (abs / 1e12).toFixed(2) + "T";
  if (abs >= 1e9)  return sign + "$" + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6)  return sign + "$" + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3)  return sign + "$" + (abs / 1e3).toFixed(1) + "K";
  return sign + "$" + abs.toFixed(0);
}

export function fmtSigned(n: number): string {
  return (n > 0 ? "+" : "") + fmtCompact(n);
}

export function pnlClass(n: number | null | undefined): string {
  if (n == null) return "text-[var(--t-text-dim)]";
  if (n > 0) return "text-[#00cc66]";
  if (n < 0) return "text-[#ff4d4d]";
  return "text-[var(--t-text-dim)]";
}

// Valor / costo de una fila según moneda. En USD el costo va al MEP
// histórico de cada boleto y el valor al MEP de hoy (campos del backend).
const valVista = (r: PnLRow, esUSD: boolean) =>
  esUSD ? (r.valor_actual_usd ?? 0) : (r.valor_actual_live ?? r.valor_actual_aum);
const costoVista = (r: PnLRow, esUSD: boolean) =>
  esUSD ? (r.costo_remanente_usd ?? 0) : r.costo_remanente;

// Formato moneda-aware: el "$" base pasa a "US$" en vista USD.
const fmtMon = (n: number, esUSD: boolean) =>
  esUSD ? fmtCompact(n).replace("$", "US$") : fmtCompact(n);
const fmtMonSigned = (n: number, esUSD: boolean) =>
  esUSD ? fmtSigned(n).replace("$", "US$") : fmtSigned(n);

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
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [moneda, setMoneda]     = useState<Moneda>("ARS");
  const esUSD = moneda === "USD";

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
        setSelectedTicker(null);
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
    return data.rows;
  }, [data]);

  // Total mostrado en UI = no_realizado + pasivo. Realizado se excluye
  // hasta que tengamos la vista histórica de realizado (futuro). El
  // backend sigue devolviendo `pnl_realizado` y `pnl_total` (que lo
  // incluye) — acá los ignoramos para no presentar números mezclados.
  const totalView = (r: PnLRow) =>
    esUSD
      ? (r.pnl_no_realizado_usd ?? 0) + (r.pnl_pasivo_usd ?? 0)
      : (r.pnl_no_realizado ?? 0) + r.pnl_pasivo;

  const filasOrdenadas = useMemo(() => {
    const sgn = sortDir === "asc" ? 1 : -1;
    return [...filasFiltradas].sort((a, b) => {
      if (sortKey === "ticker") return a.ticker.localeCompare(b.ticker) * sgn;
      if (sortKey === "pnl_total") return (totalView(a) - totalView(b)) * sgn;
      if (sortKey === "valor_actual_aum") return (valVista(a, esUSD) - valVista(b, esUSD)) * sgn;
      if (sortKey === "costo_remanente") return (costoVista(a, esUSD) - costoVista(b, esUSD)) * sgn;
      const av = (a[sortKey] ?? Number.NEGATIVE_INFINITY) as number;
      const bv = (b[sortKey] ?? Number.NEGATIVE_INFINITY) as number;
      return (av - bv) * sgn;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filasFiltradas, sortKey, sortDir, esUSD]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  const arrow = (k: SortKey) =>
    sortKey === k ? (sortDir === "asc" ? "▲" : "▼") : "";

  if (!idCuenta) {
    return <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-[11px]">Elegí una cuenta.</div>;
  }
  if (err) {
    return <div className="p-3 text-[11px] text-[#ff4d4d]">Error: {err}</div>;
  }
  if (loading && !data) {
    return <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-[11px]">Cargando…</div>;
  }
  if (!data) return null;

  const t = data.totales;
  const tNoReal = esUSD ? (t.pnl_no_realizado_usd ?? 0) : t.pnl_no_realizado;
  const tValor  = esUSD ? (t.valor_actual_usd ?? 0) : t.valor_actual;
  const tCosto  = esUSD ? (t.costo_remanente_usd ?? 0) : t.costo_remanente;
  // ¿El backend trae datos USD? (requiere MEP de hoy disponible).
  const usdDisponible =
    (t.valor_actual_usd ?? 0) > 0 || data.rows.some((r) => (r.valor_actual_usd ?? 0) > 0);

  return (
    <div className="h-full flex flex-col gap-3 p-3 overflow-hidden">
      {/* KPIs — solo Valor Actual + PnL No Realizado (el resto confunde) */}
      <div className="grid grid-cols-2 gap-3">
        <Kpi label={`VALOR ACTUAL · ${moneda}`}
             value={fmtMon(tValor, esUSD)}
             sub={tCosto > 0 ? `costo: ${fmtMon(tCosto, esUSD)}` : ""}
        />
        <Kpi label={`PNL NO REALIZADO · ${moneda}`}
             value={fmtMonSigned(tNoReal, esUSD)}
             accent={tNoReal >= 0 ? "#00cc66" : "#ff4d4d"}
             sub={esUSD ? "valor hoy − costo USD" : "stock vivo · papel"}
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">MONEDA</span>
          {(["ARS", "USD"] as Moneda[]).map((m) => {
            const disabled = m === "USD" && !usdDisponible;
            return (
              <button
                key={m}
                onClick={() => !disabled && setMoneda(m)}
                disabled={disabled}
                title={disabled ? "Sin MEP de hoy para convertir a USD" : ""}
                className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
                  moneda === m
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                    : disabled
                      ? "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border)] cursor-not-allowed"
                      : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
        <span className="text-[9px] text-[var(--t-text-muted)] ml-auto font-mono">
          {filasOrdenadas.length} tickers
          {data.fecha_actual ? ` · al ${data.fecha_actual}` : ""}
        </span>
      </div>

      {/* Split layout: posiciones (izq) + detalle de la seleccionada (der) */}
      <div className="flex-1 min-h-0 flex gap-3">
        {/* ── Panel izquierdo: POSICIONES ─────────────────────────── */}
        <div className="w-1/2 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-0 overflow-hidden">
          {filasOrdenadas.length === 0 ? (
            <div className="p-6 text-center text-[var(--t-text-muted)] text-[11px]">Sin tickers para mostrar.</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <table className="w-full text-[11px] font-mono">
                <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10">
                  <tr className="text-[9px] tracking-widest text-[var(--t-text-dim)]">
                    <th onClick={() => toggleSort("ticker")} className="px-3 py-2 text-left cursor-pointer hover:text-[var(--t-accent)] select-none">
                      TICKER {arrow("ticker")}
                    </th>
                    <th className="px-2 py-2 text-right">CANT</th>
                    <th onClick={() => toggleSort("costo_remanente")} className="px-2 py-2 text-right cursor-pointer hover:text-[var(--t-accent)] select-none">
                      COSTO {arrow("costo_remanente")}
                    </th>
                    <th onClick={() => toggleSort("valor_actual_aum")} className="px-2 py-2 text-right cursor-pointer hover:text-[var(--t-accent)] select-none">
                      VALOR {arrow("valor_actual_aum")}
                    </th>
                    <th className="px-2 py-2 text-right">GAN %</th>
                    <th onClick={() => toggleSort("pnl_total")} className="px-2 py-2 text-right cursor-pointer hover:text-[var(--t-accent)] select-none">
                      PNL {arrow("pnl_total")}
                    </th>
                    <th className="px-2 py-2 text-right">FLAGS</th>
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.map((r) => {
                    const isSel  = selectedTicker === r.ticker;
                    const total  = totalView(r);
                    const costoRow = costoVista(r, esUSD);
                    const valorRow = valVista(r, esUSD);
                    const ganPct = costoRow > 0
                      ? (total / costoRow) * 100
                      : null;
                    return (
                      <tr
                        key={r.ticker}
                        onClick={() => setSelectedTicker(isSel ? null : r.ticker)}
                        className={
                          "border-b border-[var(--t-border)] cursor-pointer " +
                          (isSel ? "bg-[var(--t-accent)]/10" : "hover:bg-[var(--t-accent)]/5")
                        }
                      >
                        <td className="px-3 py-1.5 text-[var(--t-text)] truncate max-w-[180px]" title={r.display_name || r.ticker}>
                          {r.display_name || r.ticker}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[var(--t-text)]">
                          {r.qty_aum.toLocaleString("es-AR")}
                          {r.qty_calc !== r.qty_aum && (
                            <span className="ml-1 text-[var(--t-accent)] text-[9px]" title={`Boletos: ${r.qty_calc}`}>
                              ({r.qty_calc.toLocaleString("es-AR")})
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">
                          {costoRow > 0 ? fmtMon(costoRow, esUSD) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[var(--t-text)]">
                          {fmtMon(valorRow, esUSD)}
                          {r.valor_actual_source === "live" && (
                            <span className="ml-1 text-[7px] text-[#00cc66] tracking-widest">LIVE</span>
                          )}
                          {r.valor_actual_source === "cierre" && (
                            <span className="ml-1 text-[7px] text-[var(--t-text-dim)] tracking-widest">CIE</span>
                          )}
                          {r.valor_actual_source === "aum" && (
                            <span className="ml-1 text-[7px] text-[var(--t-text-muted)] tracking-widest">AUM</span>
                          )}
                        </td>
                        <td className={`px-2 py-1.5 text-right ${pnlClass(ganPct)}`}>
                          {ganPct != null ? `${ganPct >= 0 ? "+" : ""}${ganPct.toFixed(1)}%` : "—"}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-semibold ${pnlClass(total)}`}>
                          {fmtMonSigned(total, esUSD)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-[9px]">
                          {r.completeness === "parcial" && (
                            <span className="px-1 py-0 bg-[var(--t-accent)]/15 text-[var(--t-accent)] tracking-widest">P</span>
                          )}
                          {r.completeness === "sin_boletos" && (
                            <span className="px-1 py-0 bg-[#ff4d4d]/15 text-[#ff4d4d] tracking-widest">SB</span>
                          )}
                          {r.moneda_mixta && (
                            <span className="ml-1 px-1 py-0 bg-[#4a9eff]/15 text-[#4a9eff] tracking-widest">$</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Panel derecho: DETALLE de la posición seleccionada ──── */}
        <div className="w-1/2 border border-[var(--t-border)] bg-[var(--t-panel)] min-h-0 overflow-y-auto">
          {selectedTicker ? (
            <PosicionDetalle
              row={filasOrdenadas.find((r) => r.ticker === selectedTicker)!}
              esUSD={esUSD}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-[11px] tracking-widest">
              Seleccioná una posición a la izquierda
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Panel detalle ────────────────────────────────────────────────────────
export function PosicionDetalle({ row, esUSD = false }: { row: PnLRow; esUSD?: boolean }) {
  const boletosPeriodo = _filtrarPeriodoActual(row.boletos);
  const stats = _statsDelPeriodo(boletosPeriodo);
  const tieneBreakdown = Object.keys(stats.breakdownPasivo).length > 0;
  // Vista moneda-aware. En USD: costo a MEP histórico, valor a MEP de hoy.
  // El realizado del día (intraday) entra al total/GAN% acá, igual que en ARS.
  const costo   = costoVista(row, esUSD);
  const valor   = valVista(row, esUSD);
  const noReal  = esUSD ? (row.pnl_no_realizado_usd ?? null) : row.pnl_no_realizado;
  const pasivo  = esUSD ? (row.pnl_pasivo_usd ?? 0) : row.pnl_pasivo;
  const realDia = esUSD ? (row.pnl_realizado_dia_usd ?? 0) : (row.pnl_realizado_dia ?? 0);
  const pnlTot  = (noReal ?? 0) + pasivo + realDia;
  const ganPct = costo > 0 ? (pnlTot / costo) * 100 : null;

  return (
    <div className="p-3 text-[10px] text-[var(--t-text-dim)]">
      {/* Header del ticker */}
      <div className="border-b border-[var(--t-border)] pb-2 mb-3">
        <div className="text-[12px] text-[var(--t-text)] font-mono mb-0.5">{row.display_name || row.ticker}</div>
        <div className="text-[9px] text-[var(--t-text-muted)]">
          {row.ticker !== (row.display_name || row.ticker) && <span>{row.ticker} · </span>}
          {row.unidad}
        </div>
      </div>

      {/* Mini-KPIs por ticker */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <DetKpi label={`COSTO${esUSD ? " USD" : ""}`} value={costo > 0 ? fmtMon(costo, esUSD) : "—"} />
        <DetKpi label="VALOR"    value={fmtMon(valor, esUSD)} />
        <DetKpi label="PNL"
                value={fmtMonSigned(pnlTot, esUSD)}
                accent={pnlTot >= 0 ? "#00cc66" : "#ff4d4d"} />
        <DetKpi label="NO REAL"  value={noReal != null ? fmtMonSigned(noReal, esUSD) : "—"}
                accent={(noReal ?? 0) >= 0 ? "#00cc66" : "#ff4d4d"} />
        <DetKpi label="COBROS"   value={pasivo !== 0 ? fmtMonSigned(pasivo, esUSD) : "—"}
                accent={pasivo >= 0 ? "#00cc66" : "#ff4d4d"} />
        <DetKpi label="GAN %"    value={ganPct != null ? `${ganPct >= 0 ? "+" : ""}${ganPct.toFixed(2)}%` : "—"}
                accent={(ganPct ?? 0) >= 0 ? "#00cc66" : "#ff4d4d"} />
      </div>

      {/* Realizado intraday — solo si hubo day-trades cerrados */}
      {realDia !== 0 && (
        <div className="mb-3 px-2 py-1 border border-[#4a9eff]/30 bg-[#4a9eff]/5 text-[10px]">
          <span className="text-[var(--t-text-muted)] tracking-widest mr-2">REALIZADO HOY:</span>
          <span className={pnlClass(realDia) + " font-semibold"}>
            {fmtMonSigned(realDia, esUSD)}
          </span>
          <span className="ml-1 text-[8px] text-[#4a9eff]">day-trade cerrado</span>
        </div>
      )}

      {/* Flujo del stock actual */}
      <div className="mb-2">
        <span className="text-[var(--t-text-muted)] tracking-widest">FLUJO (STOCK ACTUAL):</span>{" "}
        {stats.compras > 0 && <span>compras: {stats.compras.toLocaleString("es-AR")} · </span>}
        {stats.ventas > 0 && <span>ventas: {stats.ventas.toLocaleString("es-AR")} · </span>}
        <span>neto: {stats.neto.toLocaleString("es-AR")}</span>
        {row.qty_calc !== row.qty_aum && (
          <span className="text-[var(--t-accent)]"> · AuM: {row.qty_aum.toLocaleString("es-AR")} (Δ {(row.qty_aum - row.qty_calc).toLocaleString("es-AR")})</span>
        )}
        <span className="text-[var(--t-text-muted)]"> · {boletosPeriodo.length}/{row.boletos.length} movs</span>
      </div>

      {/* Cobros pasivos del período */}
      {tieneBreakdown && (
        <div className="mb-2">
          <span className="text-[var(--t-text-muted)] tracking-widest">COBROS PASIVOS (PERÍODO):</span>{" "}
          {Object.entries(stats.breakdownPasivo).map(([op, val]) => (
            <span key={op}>
              <span className="text-[var(--t-text-muted)]">{op}:</span> <span className="text-[var(--t-text)]">{fmtCompact(val)}</span>
              {" · "}
            </span>
          ))}
        </div>
      )}

      {row.fechas_sin_mep.length > 0 && (
        <div className="mb-2 text-[9px] text-[var(--t-accent)]">
          ⚠ {row.fechas_sin_mep.length} fechas sin MEP — montos USD sin pesificar correctamente
        </div>
      )}

      {/* Tabla de boletos del período activo */}
      {boletosPeriodo.length > 0 && (
        <div className="mt-3 border-t border-[var(--t-border)] pt-2">
          <div className="text-[var(--t-text-muted)] tracking-widest mb-1">
            BOLETOS DEL STOCK ACTUAL ({boletosPeriodo.length}
            {row.boletos.length > boletosPeriodo.length && (
              <span className="text-[var(--t-text-muted)]"> · {row.boletos.length - boletosPeriodo.length} históricos ocultos</span>
            )}
            ):
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono">
              <thead className="text-[9px] text-[var(--t-text-muted)] tracking-widest">
                <tr>
                  <th className="px-2 py-1 text-left">FECHA</th>
                  <th className="px-2 py-1 text-left">OP</th>
                  <th className="px-2 py-1 text-right">CANT</th>
                  <th className="px-2 py-1 text-right">PRECIO</th>
                  <th className="px-2 py-1 text-right">IMPORTE</th>
                  <th className="px-2 py-1 text-left">MON</th>
                  <th className="px-2 py-1 text-right">MEP</th>
                  <th className="px-2 py-1 text-right">IMP ARS</th>
                </tr>
              </thead>
              <tbody>
                {boletosPeriodo.map((b, i) => {
                  const colorImporte =
                    b.importe > 0 ? "text-[#00cc66]"
                    : b.importe < 0 ? "text-[#ff4d4d]"
                    : "text-[var(--t-text-dim)]";
                  return (
                    <tr key={i} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                      <td className="px-2 py-0.5 text-[var(--t-text)]">{b.fecha}</td>
                      <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{b.op || b.categoria}</td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text)]">
                        {b.cantidad ? b.cantidad.toLocaleString("es-AR") : "—"}
                      </td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
                        {b.precio ? b.precio.toLocaleString("es-AR", { maximumFractionDigits: 4 }) : "—"}
                      </td>
                      <td className={`px-2 py-0.5 text-right ${colorImporte}`}>
                        {b.importe ? b.importe.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
                      </td>
                      <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{b.moneda}</td>
                      <td className="px-2 py-0.5 text-right text-[var(--t-text-muted)]">
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
    </div>
  );
}

function DetKpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-2 py-1">
      <div className="text-[8px] text-[var(--t-text-muted)] uppercase tracking-wider">{label}</div>
      <div className="text-[12px] font-semibold truncate" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2">
      <div className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wide">{label}</div>
      <div className="text-[18px] font-semibold truncate" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--t-text-muted)]">{sub}</div>}
    </div>
  );
}
