"use client";

import { useState } from "react";
import { EstrategiaTradeHedgeView } from "./estrategia-trade-hedge-view";
import { CompararInversionView } from "./comparar-inversion-view";

/**
 * Tab ESTRATEGIA del shell /renta-variable. Shell con sub-tabs:
 *   - TRADE + HEDGE:       caracterización de trade + hedge-finder (RV).
 *   - COMPARAR INVERSIÓN:  comparar 2 bonos de Trading.Curvas lado a lado.
 */
type SubTab = "trade-hedge" | "comparar";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "trade-hedge", label: "TRADE + HEDGE" },
  { key: "comparar", label: "COMPARAR INVERSIÓN" },
];

export function EstrategiaView() {
  const [tab, setTab] = useState<SubTab>("trade-hedge");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-3 pt-2 shrink-0">
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
              tab === key
                ? "bg-[#ff9900] text-black border-[#ff9900]"
                : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "trade-hedge" && <EstrategiaTradeHedgeView />}
        {tab === "comparar" && <CompararInversionView />}
      </div>
    </div>
  );
}
