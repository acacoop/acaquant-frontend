"use client";

import { useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { SmartMoneyView } from "./smart-money-view";
import { ScannerView } from "./scanner-view";
import type {
  CedearCatalogItem,
  CohortOverview,
  ManagerDoc,
  RecentActivity,
} from "@/lib/types-smart-money";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";

type Tab = "smart-money" | "scanner";

const CCL_POLL_MS = 10_000;

/**
 * Outer shell de /renta-variable. Switchea entre:
 *   - Smart Money: lo histórico (13F + Form 4 sobre CEDEARs).
 *   - Scanner: vista nueva con CEDEARs + métricas live de pyRofex.
 *
 * KPI CCL en la barra de tabs (lado derecho) — visible en ambos tabs
 * porque vive en el shell, no en el contenido. Polling 10s.
 */
export function RentaVariableShell({
  initialCatalog,
  initialCohort,
  initialRecent,
  initialManagers,
  initialScanner,
  initialCcl,
}: {
  initialCatalog: CedearCatalogItem[];
  initialCohort: CohortOverview;
  initialRecent: RecentActivity;
  initialManagers: ManagerDoc[];
  initialScanner: CedearScannerRow[];
  initialCcl: CclLive;
}) {
  const [tab, setTab] = useState<Tab>("scanner");
  const { data: ccl } = usePoll<CclLive>(
    "/api/scanner/ccl",
    initialCcl,
    CCL_POLL_MS,
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[#1a1a1a] bg-[#080808] px-3 flex items-center gap-1 shrink-0">
        <TabBtn active={tab === "smart-money"} onClick={() => setTab("smart-money")}>
          Smart Money
        </TabBtn>
        <TabBtn active={tab === "scanner"} onClick={() => setTab("scanner")}>
          Scanner
        </TabBtn>

        <CclKpi data={ccl} />
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

/**
 * KPI compacto del CCL — valor + % 1D. Pintado a la derecha del tab bar.
 * Si `value` o `vs_1d_pct` vienen null, muestra '--' en lugar del número
 * (no rompe el layout).
 */
function CclKpi({ data }: { data: CclLive }) {
  const { value, vs_1d_pct } = data;
  const variation =
    vs_1d_pct === null
      ? null
      : `${vs_1d_pct >= 0 ? "+" : ""}${vs_1d_pct.toFixed(2)}%`;
  const variationColor =
    vs_1d_pct === null
      ? "text-[#555555]"
      : vs_1d_pct >= 0
      ? "text-[#00cc66]"
      : "text-[#ff3333]";

  return (
    <div
      className="ml-auto flex items-center gap-2 pr-1 text-[10px] tabular-nums"
      title="CCL live (DolarSnapshot._id=current) + variación vs cierre del día previo"
    >
      <span className="text-[#808080] tracking-wide uppercase">CCL</span>
      <span className="text-[#d0d0d0] font-mono">
        {value !== null ? `$${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}` : "--"}
      </span>
      <span className={variationColor}>{variation ?? "--"}</span>
    </div>
  );
}
