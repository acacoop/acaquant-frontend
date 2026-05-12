"use client";

import { useState } from "react";
import { SmartMoneyCohort } from "./smart-money-cohort";
import { SmartMoneyTicker } from "./smart-money-ticker";
import { SmartMoneyManagers } from "./smart-money-managers";
import type {
  CedearCatalogItem,
  CohortOverview,
  ManagerDoc,
  RecentActivity,
} from "@/lib/types-smart-money";

type Tab = "cohort" | "ticker" | "managers";

export function SmartMoneyView({
  initialCatalog,
  initialCohort,
  initialRecent,
  initialManagers,
}: {
  initialCatalog: CedearCatalogItem[];
  initialCohort: CohortOverview;
  initialRecent: RecentActivity;
  initialManagers: ManagerDoc[];
}) {
  const [tab, setTab] = useState<Tab>("cohort");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[#1a1a1a] bg-[#080808] px-3 flex items-center gap-1 shrink-0">
        <TabBtn active={tab === "cohort"} onClick={() => setTab("cohort")}>
          🌊 Cohort flow
        </TabBtn>
        <TabBtn active={tab === "ticker"} onClick={() => setTab("ticker")}>
          🔍 Ticker
        </TabBtn>
        <TabBtn active={tab === "managers"} onClick={() => setTab("managers")}>
          🐋 Managers
        </TabBtn>
        <span className="ml-auto text-[10px] text-[#555] pr-2">
          {initialManagers.length.toLocaleString("es-AR")} managers · {initialCatalog.length} CEDEARs
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "cohort" && (
          <SmartMoneyCohort
            initial={initialCohort}
            recent={initialRecent}
          />
        )}
        {tab === "ticker" && (
          <SmartMoneyTicker catalog={initialCatalog} />
        )}
        {tab === "managers" && (
          <SmartMoneyManagers initialManagers={initialManagers} />
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
