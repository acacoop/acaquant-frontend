"use client";

import { useState } from "react";

import { TradingMoversScanner } from "./trading-movers-scanner";
import { TradingPivotRadar } from "./trading-pivot-radar";
import { TradingVolumenScanner } from "./trading-volumen-scanner";

/**
 * RADAR de TRADING — UNA sola tabla con tres tabs (refactor 2026-09-01):
 *   MOVERS ±4%          → CEDEARs al palo (±4% a 1D o intradía).
 *   VOLUMENES ACCIONES  → los más operados de la rueda, por CASH.
 *   PIVOTES             → los que tienen el last pegado a un nivel de pivote.
 *
 * Antes eran DOS cajas apiladas (movers/volúmenes arriba, pivotes/estrategia
 * abajo): partir el alto en dos dejaba las dos tablas con 6 filas visibles cada
 * una. Ahora la que estás mirando usa el alto entero. ESTRATEGIA se fue con el
 * borrado de la señal quant (motor, resolver, router y tablas incluidos).
 *
 * Las tabs viven EMBEBIDAS en la barra de herramientas de cada tabla
 * (`headerLeading`) para no gastar una fila entera de alto en ellas.
 * Click en una fila → onSelect (carga el ticker en una card + en un chart).
 */
type Tab = "movers" | "volumenes" | "pivotes";

export function TradingRadarPanel({
  onSelect,
  selectedTicker,
  hideTicker,
}: {
  onSelect?: (ticker: string) => void;
  selectedTicker?: string | null;
  hideTicker?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("movers");

  const tabs = (
    <div className="flex items-center gap-1 mr-1">
      <TabBtn active={tab === "movers"} onClick={() => setTab("movers")}>
        MOVERS ±4%
      </TabBtn>
      <TabBtn active={tab === "volumenes"} onClick={() => setTab("volumenes")}>
        VOLUMENES ACCIONES
      </TabBtn>
      <TabBtn active={tab === "pivotes"} onClick={() => setTab("pivotes")}>
        PIVOTES
      </TabBtn>
    </div>
  );

  return (
    <div className="min-h-0 h-full border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0">
        {tab === "movers" && (
          <TradingMoversScanner
            onSelect={onSelect}
            selectedTicker={selectedTicker}
            hideTicker={hideTicker}
            headerLeading={tabs}
          />
        )}
        {tab === "volumenes" && (
          <TradingVolumenScanner
            onSelect={onSelect}
            selectedTicker={selectedTicker}
            headerLeading={tabs}
          />
        )}
        {tab === "pivotes" && (
          <TradingPivotRadar
            onSelect={onSelect}
            selectedTicker={selectedTicker}
            headerLeading={tabs}
          />
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
