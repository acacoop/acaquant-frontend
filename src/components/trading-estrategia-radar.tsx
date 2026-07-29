"use client";

import { useState } from "react";

import { usePoll } from "@/lib/use-poll";
import { EstrategiaView } from "./estrategia-view";

/**
 * Tab ESTRATEGIA del RADAR de TRADING (caja de abajo, junto a PIVOTES).
 * Muestra la señal quant live por ticker (score −100..+100, motor
 * engines/estrategia.py — docs/ESTRATEGIA_QUANT.md backend). Content-only:
 * el borde/tabs los pone TradingRadarPanel. Click en fila → onSelect (carga
 * el ticker en el chart/pivot%). El botón TRACK-RECORD abre la vista completa
 * (factores, hit-rate, equity, ledger) en un overlay.
 */
const POLL_MS = 10_000;

interface EvalLive {
  ticker: string;
  ts: string | null;
  score: number;
  direccion: "LONG" | "SHORT" | "NEUTRO";
  cobertura: number;
  indice_ref: string;
  precio: number | null;
}

const fmtPx = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

function chip(score: number): { txt: string; cls: string } {
  if (score >= 40) return { txt: "LONG", cls: "text-[var(--t-pos)] border-[var(--t-pos)]" };
  if (score <= -40) return { txt: "SHORT", cls: "text-[var(--t-neg)] border-[var(--t-neg)]" };
  return { txt: "—", cls: "text-[var(--t-text-muted)] border-[var(--t-border-2)]" };
}

export function TradingEstrategiaRadar({
  onSelect,
  selectedTicker,
}: {
  onSelect?: (ticker: string) => void;
  selectedTicker?: string | null;
}) {
  const [showTrack, setShowTrack] = useState(false);
  const { data: rows } = usePoll<EvalLive[]>(
    "/api/estrategia/live",
    [],
    POLL_MS,
    { fetchOnMount: true },
  );
  const evals = rows ?? [];

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-1.5 py-1 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[9px] text-[var(--t-text-muted)]">
          señal quant · umbral ±40 · motor 60s
        </span>
        <button
          type="button"
          onClick={() => setShowTrack(true)}
          className="ml-auto px-1.5 py-0.5 text-[9px] font-semibold border bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
        >
          TRACK-RECORD
        </button>
      </div>

      {evals.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--t-text-muted)] text-center px-3">
          sin evaluaciones — el motor corre durante la rueda
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-[10px] tabular-nums">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[7px] uppercase tracking-wide text-[var(--t-text-muted)]">
              <tr>
                <th className="!px-1.5 py-1 text-left">Ticker</th>
                <th className="!px-1 py-1 text-center">Señal</th>
                <th className="!px-1 py-1 text-right">Score</th>
                <th className="!px-1 py-1 text-right">Last</th>
                <th className="!px-1.5 py-1 text-right">vs</th>
              </tr>
            </thead>
            <tbody>
              {evals.map((e) => {
                const c = chip(e.score);
                const sel = selectedTicker != null && e.ticker === selectedTicker;
                return (
                  <tr
                    key={e.ticker}
                    onMouseDown={() => onSelect?.(e.ticker)}
                    className={
                      "border-b border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-border)] " +
                      (sel ? "bg-[var(--t-border)]" : "")
                    }
                  >
                    <td className="!px-1.5 py-[2px] text-left font-mono font-semibold text-[var(--t-text)]">
                      {e.ticker}
                    </td>
                    <td className="!px-1 py-[2px] text-center">
                      <span className={`px-1 border text-[8px] font-bold ${c.cls}`}>{c.txt}</span>
                    </td>
                    <td
                      className="!px-1 py-[2px] text-right font-bold"
                      style={{
                        color:
                          e.score > 0
                            ? "var(--t-pos)"
                            : e.score < 0
                              ? "var(--t-neg)"
                              : "var(--t-text-muted)",
                      }}
                    >
                      {e.score > 0 ? "+" : ""}
                      {Math.round(e.score)}
                    </td>
                    <td className="!px-1 py-[2px] text-right">{fmtPx(e.precio)}</td>
                    <td className="!px-1.5 py-[2px] text-right text-[var(--t-text-muted)]">
                      {e.indice_ref}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* overlay TRACK-RECORD: la vista completa (factores + hit-rate + equity + ledger) */}
      {showTrack && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl h-[85vh] bg-[var(--t-bg)] border border-[var(--t-border-2)] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--t-border)] shrink-0">
              <span className="text-[11px] font-bold tracking-widest text-[var(--t-accent)]">
                ESTRATEGIA QUANT — TRAZABILIDAD
              </span>
              <button
                type="button"
                onClick={() => setShowTrack(false)}
                className="px-2 py-0.5 text-[10px] font-semibold border bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
              >
                CERRAR ✕
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              <EstrategiaView />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
