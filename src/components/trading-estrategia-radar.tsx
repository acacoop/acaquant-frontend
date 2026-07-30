"use client";

import { usePoll } from "@/lib/use-poll";

/**
 * Tab ESTRATEGIA del RADAR de TRADING (caja de abajo, junto a PIVOTES).
 * Muestra el CONTEXTO determinista por ticker foco (backend
 * /api/estrategia/contexto — docs/ESTRATEGIA_QUANT.md):
 *   - ATR-20 (rango típico DIARIO en ARS, % sobre el cierre): cuánta nafta
 *     quema el papel en un día normal.
 *   - Efficiency Ratio intradía (Kaufman): qué tan LIMPIO viene el movimiento.
 *     ER alto → tendencia derecha (los niveles funcionan); ER bajo → choppy
 *     (serrucho, los niveles no aguantan → no operar).
 * Content-only: el borde/tabs los pone TradingRadarPanel. Click en fila →
 * onSelect (carga el ticker en el chart/pivots).
 */
const POLL_MS = 10_000;

interface Contexto {
  ticker: string;
  fecha: string | null;
  close: number | null;
  atr: number | null;
  atr_pct: number | null;
  er_dia: number | null;
  er_reciente: number | null;
  choppy: boolean;
}

const fmtPx = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
const fmtPct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const fmtEr = (n: number | null) => (n == null ? "—" : n.toFixed(2));

/** Chip de régimen desde el ER reciente (últimas 30 barras). */
function regimen(er: number | null, choppy: boolean): { txt: string; cls: string } {
  if (er == null) return { txt: "—", cls: "text-[var(--t-text-muted)] border-[var(--t-border-2)]" };
  if (choppy) return { txt: "CHOPPY", cls: "text-[var(--t-neg)] border-[var(--t-neg)]" };
  if (er >= 0.5) return { txt: "LIMPIO", cls: "text-[var(--t-pos)] border-[var(--t-pos)]" };
  return { txt: "MIXTO", cls: "text-[var(--t-text-dim)] border-[var(--t-border-2)]" };
}

export function TradingEstrategiaRadar({
  onSelect,
  selectedTicker,
}: {
  onSelect?: (ticker: string) => void;
  selectedTicker?: string | null;
}) {
  const { data: rows } = usePoll<Contexto[]>(
    "/api/estrategia/contexto",
    [],
    POLL_MS,
    { fetchOnMount: true },
  );
  const ctx = rows ?? [];

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-1.5 py-1 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[9px] text-[var(--t-text-muted)]">
          contexto · ATR-20 (rango típico) + Efficiency Ratio (choppy)
        </span>
      </div>

      {ctx.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--t-text-muted)] text-center px-3">
          sin datos de contexto
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-[10px] tabular-nums">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[7px] uppercase tracking-wide text-[var(--t-text-muted)]">
              <tr>
                <th className="!px-1.5 py-1 text-left">Ticker</th>
                <th className="!px-1 py-1 text-right">Last</th>
                <th className="!px-1 py-1 text-right" title="ATR-20 como % del cierre">
                  ATR%
                </th>
                <th className="!px-1 py-1 text-right" title="Efficiency Ratio últimas 30 barras">
                  ER 30
                </th>
                <th className="!px-1 py-1 text-right" title="Efficiency Ratio desde la apertura">
                  ER día
                </th>
                <th className="!px-1.5 py-1 text-center">Régimen</th>
              </tr>
            </thead>
            <tbody>
              {ctx.map((c) => {
                const r = regimen(c.er_reciente, c.choppy);
                const sel = selectedTicker != null && c.ticker === selectedTicker;
                return (
                  <tr
                    key={c.ticker}
                    onMouseDown={() => onSelect?.(c.ticker)}
                    className={
                      "border-b border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-border)] " +
                      (sel ? "bg-[var(--t-border)]" : "")
                    }
                  >
                    <td className="!px-1.5 py-[2px] text-left font-mono font-semibold text-[var(--t-text)]">
                      {c.ticker}
                    </td>
                    <td className="!px-1 py-[2px] text-right">{fmtPx(c.close)}</td>
                    <td className="!px-1 py-[2px] text-right text-[var(--t-text-dim)]">
                      {fmtPct(c.atr_pct)}
                    </td>
                    <td
                      className="!px-1 py-[2px] text-right font-semibold"
                      style={{
                        color: c.choppy
                          ? "var(--t-neg)"
                          : c.er_reciente != null && c.er_reciente >= 0.5
                            ? "var(--t-pos)"
                            : "var(--t-text-dim)",
                      }}
                    >
                      {fmtEr(c.er_reciente)}
                    </td>
                    <td className="!px-1 py-[2px] text-right text-[var(--t-text-muted)]">
                      {fmtEr(c.er_dia)}
                    </td>
                    <td className="!px-1.5 py-[2px] text-center">
                      <span className={`px-1 border text-[8px] font-bold ${r.cls}`}>{r.txt}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
