"use client";

import { useState } from "react";

import { TradingMoversScanner } from "./trading-movers-scanner";
import { TradingPivotRadar } from "./trading-pivot-radar";
import { TradingRentaFijaScanner } from "./trading-renta-fija-scanner";
import { TradingVolumenScanner } from "./trading-volumen-scanner";

/**
 * RADAR de TRADING (panel abajo-derecha) con 4 tabs:
 *   - MOVERS ±4%:        CEDEARs que se movieron ±4% (1D o intradía).
 *   - PIVOTES:           CEDEARs con el last pegado a un pivote (≤ umbral%).
 *   - VOLUMENES ACCIONES: CEDEARs más operados del día por CASH (no nominal).
 *   - RENTA FIJA:        bonos en pesos suscriptos (tasa fija + CER) con last,
 *                        TNA y volumen — click carga el bono en la card.
 * Click en una fila → onSelect (carga el ticker en el chart/libro/tape).
 */
type Tab = "movers" | "pivotes" | "volumenes" | "renta_fija";

export function TradingRadarPanel({
  onSelect,
  selectedTicker,
  hideRubro,
}: {
  onSelect?: (ticker: string) => void;
  selectedTicker?: string | null;
  hideRubro?: boolean;
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
        <TabBtn active={tab === "volumenes"} onClick={() => setTab("volumenes")}>
          VOLUMENES ACCIONES
        </TabBtn>
        <TabBtn active={tab === "renta_fija"} onClick={() => setTab("renta_fija")}>
          RENTA FIJA
        </TabBtn>
      </div>
      <div className="flex-1 min-h-0">
        {tab === "movers" ? (
          <TradingMoversScanner onSelect={onSelect} selectedTicker={selectedTicker} hideRubro={hideRubro} />
        ) : tab === "pivotes" ? (
          <TradingPivotRadar onSelect={onSelect} selectedTicker={selectedTicker} />
        ) : tab === "volumenes" ? (
          <TradingVolumenScanner onSelect={onSelect} selectedTicker={selectedTicker} />
        ) : (
          <TradingRentaFijaScanner onSelect={onSelect} selectedTicker={selectedTicker} />
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
