"use client";

import { useMemo, useState } from "react";

import { usePoll } from "@/lib/use-poll";
import type { PivotRadarRow } from "@/lib/types-trading";

/**
 * Radar de proximidad a pivote (tab PIVOTES del RADAR de TRADING). Escanea TODO
 * el universo de CEDEARs (el backend calcula pivots de todos, no solo los
 * suscriptos) y muestra los que tienen el `last` a ≤ umbral% de algún nivel
 * (PP/R1..R3/S1..S3). Content-only: el borde/tabs los pone TradingRadarPanel.
 *
 * El backend devuelve TODOS ordenados por distancia; el selector de umbral
 * filtra en el cliente (no re-pega al backend). Click en fila → onSelect.
 */
const POLL_MS = 2_000;
const UMBRALES = [0.05, 0.1, 0.2, 0.5]; // %

const fmtPx = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

// Color del nivel: R* verde (resistencia), S* rojo (soporte), PP gris.
function nivelColor(nivel: string): string {
  if (nivel.startsWith("R")) return "var(--t-pos)";
  if (nivel.startsWith("S")) return "var(--t-neg)";
  return "var(--t-text-muted)";
}

export function TradingPivotRadar({
  onSelect,
  selectedTicker,
}: {
  onSelect?: (ticker: string) => void;
  selectedTicker?: string | null;
}) {
  const [umbral, setUmbral] = useState(0.2);
  const { data: rows } = usePoll<PivotRadarRow[]>(
    "/api/trading/pivot-radar",
    [],
    POLL_MS,
    { fetchOnMount: true },
  );

  const hits = useMemo(
    () => (rows ?? []).filter((r) => Math.abs(r.dist_pct) <= umbral),
    [rows, umbral],
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* selector de umbral + conteo */}
      <div className="flex items-center gap-1 px-1.5 py-1 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[9px] text-[var(--t-text-muted)]">a ≤</span>
        {UMBRALES.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUmbral(u)}
            className={
              "px-1.5 py-0.5 text-[9px] font-semibold border " +
              (umbral === u
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]")
            }
          >
            {u}%
          </button>
        ))}
        <span className="text-[9px] text-[var(--t-text-muted)]">de un pivote</span>
        <span className="ml-auto text-[9px] text-[var(--t-text-muted)] tabular-nums">{hits.length}</span>
      </div>

      {hits.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--t-text-muted)] text-center px-3">
          ningún papel a ≤{umbral}% de un pivote ahora
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-[10px] tabular-nums">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[7px] uppercase tracking-wide text-[var(--t-text-muted)]">
              <tr>
                <th className="!px-1.5 py-1 text-left">Ticker</th>
                <th className="!px-1 py-1 text-right">Last</th>
                <th className="!px-1 py-1 text-center">Nivel</th>
                <th className="!px-1 py-1 text-right">Precio</th>
                <th className="!px-1.5 py-1 text-right">Dist</th>
              </tr>
            </thead>
            <tbody>
              {hits.map((r) => {
                const sel = selectedTicker != null && r.ticker === selectedTicker;
                return (
                  <tr
                    key={r.ticker}
                    onMouseDown={() => onSelect?.(r.ticker)}
                    className={
                      "border-b border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-border)] " +
                      (sel ? "bg-[var(--t-border)]" : "")
                    }
                  >
                    <td className="!px-1.5 py-[2px] text-left font-mono font-semibold text-[var(--t-text)]">
                      {r.ticker}
                    </td>
                    <td className="!px-1 py-[2px] text-right">{fmtPx(r.last)}</td>
                    <td
                      className="!px-1 py-[2px] text-center font-bold"
                      style={{ color: nivelColor(r.nivel) }}
                    >
                      {r.nivel}
                    </td>
                    <td className="!px-1 py-[2px] text-right text-[var(--t-text-muted)]">
                      {fmtPx(r.nivel_precio)}
                    </td>
                    <td className="!px-1.5 py-[2px] text-right text-[var(--t-text-dim)]">
                      {r.dist_pct >= 0 ? "↑" : "↓"}
                      {Math.abs(r.dist_pct).toFixed(2)}%
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
