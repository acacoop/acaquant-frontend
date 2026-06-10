"use client";

import { useEffect, useState } from "react";

/**
 * TIME & SALES (tape) intradía de un CEDEAR — panel inferior del Scanner.
 *
 * Polea /api/scanner/cedears/trades?ticker=X cada 2s. Los trades los infiere
 * el motor (salto de NV) y viven en Trading.CedearsTimeSales (intradía, se
 * vacía al cierre). Side coloreado: BUY verde, SELL rojo, MID gris.
 */

interface Trade {
  timestamp: string;
  price: number;
  size: number;
  side: string;
  money: number;
}

const fmtHora = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
};
const fmtPx = (n: number) => n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtSz = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

export function CedearsTimeSalesPanel({ ticker }: { ticker: string | null }) {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    if (!ticker) {
      setTrades([]);
      return;
    }
    let alive = true;
    const fetchTrades = async () => {
      try {
        const r = await fetch(`/api/scanner/cedears/trades?ticker=${encodeURIComponent(ticker)}`, { cache: "no-store" });
        if (!r.ok) return;
        const j: Trade[] = await r.json();
        if (alive) setTrades(Array.isArray(j) ? j : []);
      } catch {
        /* transitorio */
      }
    };
    fetchTrades();
    const id = setInterval(fetchTrades, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ticker]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Time &amp; Sales</span>
        <span className="text-[9px] text-[var(--t-text-muted)] font-mono">{ticker || "—"}</span>
        <span className="ml-auto text-[9px] text-[var(--t-text-muted)]">{trades.length} trades</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {!ticker ? (
          <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Elegí un ticker en la tabla para ver el tape.</p>
        ) : trades.length === 0 ? (
          <p className="p-3 text-[11px] text-[var(--t-text-dim)]">Sin trades en la rueda de hoy.</p>
        ) : (
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-panel)]">
              <tr className="text-[var(--t-text-muted)]">
                <th className="text-left !px-2">HORA</th>
                <th className="text-right !px-2">PRECIO</th>
                <th className="text-right !px-2">SIZE</th>
                <th className="text-center !px-2">SIDE</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t, i) => {
                const col =
                  t.side === "BUY" ? "text-[var(--t-pos)]" : t.side === "SELL" ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]";
                return (
                  <tr key={`${t.timestamp}-${i}`} className="hover:bg-[var(--t-border)]">
                    <td className="!px-2 text-[var(--t-text-dim)]">{fmtHora(t.timestamp)}</td>
                    <td className={`!px-2 text-right font-semibold ${col}`}>{fmtPx(t.price)}</td>
                    <td className="!px-2 text-right tabular-nums">{fmtSz(t.size)}</td>
                    <td className={`!px-2 text-center ${col}`}>{t.side}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
