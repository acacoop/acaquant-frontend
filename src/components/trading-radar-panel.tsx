"use client";

import { useState } from "react";

import { TradingMoversScanner } from "./trading-movers-scanner";
import { TradingPivotRadar } from "./trading-pivot-radar";

/**
 * RADAR de TRADING (panel abajo-derecha) con 2 tabs:
 *   - MOVERS ±4%: CEDEARs que se movieron ±4% (1D o intradía).
 *   - PIVOTES:    CEDEARs con el last pegado a un pivote (≤ umbral%).
 * Ambos siempre prendidos (poll 2s). Click en una fila → onSelect (carga el
 * ticker en el chart/libro/tape de la vista).
 */
type Tab = "movers" | "pivotes";

export function TradingRadarPanel({
  onSelect,
  selectedTicker,
}: {
  onSelect?: (ticker: string) => void;
  selectedTicker?: string | null;
}) {
  const [tab, setTab] = useState<Tab>("movers");

  return (
    <div className="min-h-0 h-full border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
      <div className="flex items-center gap-1 px-1.5 py-1 border-b border-[var(--t-border)] shrink-0">
        <TabBtn active={tab === "movers"} onClick={() => setTab("movers")}>
          MOVERS ±4%
        </TabBtn>
        <TabBtn active={tab === "pivotes"} onClick={() => setTab("pivotes")}>
          PIVOTES
        </TabBtn>
      </div>
      <div className="flex-1 min-h-0">
        {tab === "movers" ? (
          <TradingMoversScanner onSelect={onSelect} selectedTicker={selectedTicker} />
        ) : (
          <TradingPivotRadar onSelect={onSelect} selectedTicker={selectedTicker} />
        )}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors " +
        (active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]")
      }
    >
      {children}
    </button>
  );
}
