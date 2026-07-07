"use client";

import { useMemo } from "react";

import { usePoll } from "@/lib/use-poll";
import type { CedearScannerRow } from "@/lib/types-scanner";

/**
 * Ranking de VOLÚMENES del día (tab VOLÚMENES del RADAR de TRADING). Muestra los
 * CEDEARs MÁS operados de la rueda ordenados por CASH (plata efectivamente
 * operada = TRADE_EFFECTIVE_VOLUME), NO por nominal.
 *
 * Por qué cash y no nominal: el nominal (cantidad de nominales) no compara plata
 * entre papeles — 1M de nominales de un papel de $10 son $10M, pero de uno de
 * $500 son $500M. El cash (precio × cantidad) mide dónde se movió el dinero.
 *
 * Reusa el mismo feed que el Scanner/Movers (`/api/scanner/cedears`, poll 2s);
 * `total_money` lo escribe motor_cedears en vivo. Content-only: el borde/tabs
 * los pone TradingRadarPanel. Click en fila → onSelect.
 */
const POLL_MS = 2_000;
const TOP_N = 30;

// Cash en ARS a formato compacto: $1,23 MM (mil M) / $45,6 M / $789 K.
function fmtCash(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MM`;
  if (n >= 1e6) return `$${(n / 1e6).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`;
  if (n >= 1e3) return `$${(n / 1e3).toLocaleString("es-AR", { maximumFractionDigits: 0 })} K`;
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

function pctColor(n: number | null | undefined): string {
  if (n == null || Math.abs(n) < 1e-9) return "var(--t-text-muted)";
  return n > 0 ? "var(--t-pos)" : "var(--t-neg)";
}

export function TradingVolumenScanner({
  onSelect,
  selectedTicker,
}: {
  onSelect?: (ticker: string) => void;
  selectedTicker?: string | null;
}) {
  const { data: rows } = usePoll<CedearScannerRow[]>(
    "/api/scanner/cedears",
    [],
    POLL_MS,
    { fetchOnMount: true },
  );

  const ranking = useMemo(() => {
    const conCash = (rows ?? []).filter((r) => (r.total_money ?? 0) > 0);
    conCash.sort((a, b) => (b.total_money ?? 0) - (a.total_money ?? 0));
    return conCash.slice(0, TOP_N);
  }, [rows]);

  const maxCash = ranking[0]?.total_money ?? 0;
  const totalCash = useMemo(
    () => (rows ?? []).reduce((acc, r) => acc + (r.total_money ?? 0), 0),
    [rows],
  );

  if (ranking.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-muted)] text-center px-3">
        sin volumen operado todavía en la rueda
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-1.5 py-1 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[9px] text-[var(--t-text-muted)]">más operados por</span>
        <span className="text-[9px] font-semibold text-[var(--t-pos)]">CASH</span>
        <span className="text-[9px] text-[var(--t-text-muted)]">(no nominal)</span>
        <span className="ml-auto text-[9px] text-[var(--t-text-muted)] tabular-nums" title="Cash total operado en el universo">
          Σ {fmtCash(totalCash)}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[10px] tabular-nums">
          <thead className="sticky top-0 bg-[var(--t-panel)] text-[7px] uppercase tracking-wide text-[var(--t-text-muted)]">
            <tr>
              <th className="!px-1.5 py-1 text-left">#</th>
              <th className="!px-1 py-1 text-left">Ticker</th>
              <th className="!px-1 py-1 text-right">$ Operado</th>
              <th className="!px-1.5 py-1 text-right">%1D</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((r, i) => {
              const sel = selectedTicker != null && r.ticker_corto === selectedTicker;
              const cash = r.total_money ?? 0;
              const w = maxCash > 0 ? (cash / maxCash) * 100 : 0;
              return (
                <tr
                  key={r.ticker_corto}
                  onMouseDown={() => onSelect?.(r.ticker_corto)}
                  className={
                    "border-b border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-border)] " +
                    (sel ? "bg-[var(--t-border)]" : "")
                  }
                >
                  <td className="!px-1.5 py-[2px] text-left text-[var(--t-text-muted)]">{i + 1}</td>
                  <td className="!px-1 py-[2px] text-left font-mono font-semibold text-[var(--t-text)]">
                    {r.ticker_corto}
                  </td>
                  {/* barra proporcional al líder + monto cash */}
                  <td className="!px-1 py-[2px] text-right relative">
                    <div
                      className="absolute inset-y-[2px] right-1 bg-[var(--t-pos)]/15 pointer-events-none"
                      style={{ width: `${w}%` }}
                    />
                    <span className="relative font-mono text-[var(--t-text)]">{fmtCash(cash)}</span>
                  </td>
                  <td className="!px-1.5 py-[2px] text-right" style={{ color: pctColor(r.vs_1d_pct) }}>
                    {r.vs_1d_pct == null ? "—" : `${r.vs_1d_pct > 0 ? "+" : ""}${r.vs_1d_pct.toFixed(2)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
