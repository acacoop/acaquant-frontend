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
 *
 * `headerLeading` (las tabs del radar) comparte la MISMA fila que el selector de
 * umbral — la caja es una sola desde el refactor 2026-09-01.
 *
 * La columna **$ Operado** es el cash del día, y lo manda el backend EN LA MISMA
 * FILA (`cash` = `total_money` del snapshot). Un papel pegado a un pivote no
 * sirve si no lo opera nadie, y antes había que cambiar de tab para saberlo.
 * No se cruza nada en el navegador: si esta tabla y VOLUMENES leyeran fuentes
 * distintas, el mismo papel podría mostrar dos números.
 */
const POLL_MS = 2_000;
const UMBRALES = [0.05, 0.1, 0.2, 0.5]; // %

const fmtPx = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

// Cash operado, MISMO formato que la tab VOLUMENES (número completo, sin abreviar):
// el mismo papel tiene que verse igual en las dos tabs de la misma tabla.
// null / 0 → "—", que es "no operó", no "cero pesos".
const fmtCash = (n: number | null | undefined) =>
  n == null || n <= 0
    ? "—"
    : `$${Math.round(n).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

// Color del nivel: R* verde (resistencia), S* rojo (soporte), PP gris.
function nivelColor(nivel: string): string {
  if (nivel.startsWith("R")) return "var(--t-pos)";
  if (nivel.startsWith("S")) return "var(--t-neg)";
  return "var(--t-text-muted)";
}

export function TradingPivotRadar({
  onSelect,
  selectedTicker,
  headerLeading,
}: {
  onSelect?: (ticker: string) => void;
  selectedTicker?: string | null;
  headerLeading?: React.ReactNode;
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
      {/* tabs del radar + selector de umbral + conteo, todo en UNA fila */}
      <div className="flex flex-wrap items-center gap-1 px-1.5 py-1 border-b border-[var(--t-border)] shrink-0">
        {headerLeading}
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
                <th className="!px-1 py-1 text-right">Dist</th>
                <th
                  className="!px-1.5 py-1 text-right"
                  title="Plata operada hoy por el papel (cash, no nominal) — el mismo dato que ranquea la tab VOLUMENES"
                >
                  $ Operado
                </th>
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
                    <td className="!px-1 py-[2px] text-right text-[var(--t-text-dim)]">
                      {r.dist_pct >= 0 ? "↑" : "↓"}
                      {Math.abs(r.dist_pct).toFixed(2)}%
                    </td>
                    <td
                      className={
                        "!px-1.5 py-[2px] text-right font-mono " +
                        (r.cash ? "text-[var(--t-text)]" : "text-[var(--t-text-muted)]")
                      }
                    >
                      {fmtCash(r.cash)}
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
