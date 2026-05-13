"use client";

import { useState } from "react";
import { SmartMoneyView } from "./smart-money-view";
import { ScannerView } from "./scanner-view";
import type {
  CedearCatalogItem,
  CohortOverview,
  ManagerDoc,
  RecentActivity,
} from "@/lib/types-smart-money";
import type { CedearScannerRow } from "@/lib/types-scanner";

type Tab = "smart-money" | "scanner";

/**
 * Outer shell de /renta-variable. Switchea entre:
 *   - Smart Money: lo histórico (13F + Form 4 sobre CEDEARs).
 *   - Scanner: vista nueva con CEDEARs + métricas live de pyRofex.
 *
 * Pattern idéntico a DerivadosShell (Opciones | Agro).
 */
export function RentaVariableShell({
  initialCatalog,
  initialCohort,
  initialRecent,
  initialManagers,
  initialScanner,
}: {
  initialCatalog: CedearCatalogItem[];
  initialCohort: CohortOverview;
  initialRecent: RecentActivity;
  initialManagers: ManagerDoc[];
  initialScanner: CedearScannerRow[];
}) {
  const [tab, setTab] = useState<Tab>("scanner");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[#1a1a1a] bg-[#080808] px-3 flex items-center gap-1 shrink-0">
        <TabBtn active={tab === "smart-money"} onClick={() => setTab("smart-money")}>
          Smart Money
        </TabBtn>
        <TabBtn active={tab === "scanner"} onClick={() => setTab("scanner")}>
          Scanner
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "smart-money" ? (
          <SmartMoneyView
            initialCatalog={initialCatalog}
            initialCohort={initialCohort}
            initialRecent={initialRecent}
            initialManagers={initialManagers}
          />
        ) : (
          <ScannerView initial={initialScanner} />
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
      onClick={onClick}
      className={`text-[11px] tracking-wide uppercase px-3 py-2 border-b-2 ${
        active
          ? "text-[#ff9900] border-[#ff9900]"
          : "text-[#808080] border-transparent hover:text-[#d0d0d0]"
      }`}
    >
      {children}
    </button>
  );
}
