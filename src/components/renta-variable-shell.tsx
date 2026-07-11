"use client";

import { useState } from "react";

import { FundamentalAnalysisView } from "./fundamental-analysis-view";
import { IaVistaPanel } from "./ia-vista-panel";
import { ScannerView } from "./scanner-view";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";

/**
 * Shell de /renta-variable — dos tabs:
 *  - SCANNER: CEDEARs (master + snapshot live).
 *  - ANÁLISIS FUNDAMENTAL: fundamentals de Refinitiv (research.*), 4 paneles.
 */
type Tab = "scanner" | "fundamental";

const TABS: { key: Tab; label: string }[] = [
  { key: "scanner", label: "SCANNER" },
  { key: "fundamental", label: "ANÁLISIS FUNDAMENTAL" },
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
      <div className="flex items-center gap-1 px-2 py-1 shrink-0 border-b border-[var(--t-border)]">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              "px-2.5 py-1 text-[11px] font-semibold tracking-wide rounded-sm " +
              (tab === key
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                : "text-[var(--t-text-muted)] hover:text-[var(--t-text)]")
            }
          >
            {label}
          </button>
        ))}
        {/* Copiloto IA de la VISTA completa (QuantAI P3): botón al margen
            derecho de la barra + drawer. Oculto sin módulo `ia`. */}
        <div className="ml-auto">
          <IaVistaPanel vista="renta_variable" />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {tab === "scanner" ? (
          <ScannerView initial={initialScanner} initialCcl={initialCcl} />
        ) : (
          <FundamentalAnalysisView />
        )}
      </div>
    </div>
  );
}
