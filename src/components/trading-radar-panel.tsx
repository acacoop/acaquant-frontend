"use client";

import { useState } from "react";

import { TradingMoversScanner } from "./trading-movers-scanner";
import { TradingPivotRadar } from "./trading-pivot-radar";
import { TradingVolumenScanner } from "./trading-volumen-scanner";

/**
 * RADAR de TRADING (columna derecha del panel izquierdo) — DOS tablas apiladas
 * 50/50 a todo el alto:
 *   ARRIBA  → tabs MOVERS ±4% / VOLÚMENES ACCIONES (CEDEARs al palo / más operados).
 *   ABAJO   → PIVOTES: CEDEARs con el last pegado a un pivote (≤ umbral%).
 * (RENTA FIJA se removió — no se usa.)
 * Click en una fila → onSelect (carga el ticker en el chart/libro/pivot%).
 */
type TopTab = "movers" | "volumenes";

export function TradingRadarPanel({
  onSelect,
  selectedTicker,
  hideRubro,
  hideTicker,
}: {
  onSelect?: (ticker: string) => void;
  selectedTicker?: string | null;
  hideRubro?: boolean;
  hideTicker?: boolean;
}) {
  const [top, setTop] = useState<TopTab>("movers");

  return (
    <div className="min-h-0 h-full grid grid-rows-2 gap-2">
      {/* ARRIBA: MOVERS / VOLÚMENES (tabs) */}
      <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 px-1.5 py-1 border-b border-[var(--t-border)] shrink-0">
          <TabBtn active={top === "movers"} onClick={() => setTop("movers")}>
            MOVERS ±4%
          </TabBtn>
          <TabBtn active={top === "volumenes"} onClick={() => setTop("volumenes")}>
            VOLUMENES ACCIONES
          </TabBtn>
        </div>
        <div className="flex-1 min-h-0">
          {top === "movers" ? (
            <TradingMoversScanner
              onSelect={onSelect}
              selectedTicker={selectedTicker}
              hideRubro={hideRubro}
              hideTicker={hideTicker}
            />
          ) : (
            <TradingVolumenScanner onSelect={onSelect} selectedTicker={selectedTicker} />
          )}
        </div>
      </div>

      {/* ABAJO: PIVOTES (proximidad a pivote) */}
      <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
        <div className="flex items-center gap-1 px-1.5 py-1 border-b border-[var(--t-border)] shrink-0">
          <span className="px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[var(--t-accent)]">
            PIVOTES
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <TradingPivotRadar onSelect={onSelect} selectedTicker={selectedTicker} />
        </div>
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
