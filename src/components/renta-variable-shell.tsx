"use client";

import { useState } from "react";
import { ScannerView } from "./scanner-view";
import { EstrategiaView } from "./estrategia-view";
import { MonitorView } from "./monitor-view";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";

/**
 * Shell de /renta-variable. Tres tabs:
 *   - SCANNER:    vista de CEDEARs (master + snapshot live).
 *   - ESTRATEGIA: Mesa de Estrategia — análisis de trade individual + hedging.
 *   - MONITOR:    Mesa de Estrategia — análisis de book / exposición.
 * Ver docs/wip_mesa_estrategia_rv.md (repo TradingAV).
 */
type Tab = "scanner" | "estrategia" | "monitor";

const TABS: { key: Tab; label: string }[] = [
  { key: "scanner", label: "SCANNER" },
  { key: "estrategia", label: "ESTRATEGIA" },
  { key: "monitor", label: "MONITOR" },
];

export function RentaVariableShell({
  initialScanner,
  initialCcl,
}: {
  initialScanner: CedearScannerRow[];
  initialCcl: CclLive;
}) {
  const [tab, setTab] = useState<Tab>("scanner");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-3 pt-2 shrink-0">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-1 text-[10px] font-semibold tracking-wide border transition-colors ${
              tab === key
                ? "bg-[#ff9900] text-black border-[#ff9900]"
                : "bg-transparent text-[#555555] border-[var(--t-border-2)] hover:text-[#ff9900] hover:border-[#ff9900]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "scanner" && (
          <ScannerView initial={initialScanner} initialCcl={initialCcl} />
        )}
        {tab === "estrategia" && <EstrategiaView />}
        {tab === "monitor" && <MonitorView />}
      </div>
    </div>
  );
}
