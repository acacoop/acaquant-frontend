import { apiFetch } from "@/lib/api";
import { RentaVariableShell } from "@/components/renta-variable-shell";
import type {
  CedearCatalogItem,
  CohortOverview,
  ManagerDoc,
  RecentActivity,
} from "@/lib/types-smart-money";
import type { CedearScannerRow } from "@/lib/types-scanner";

export const dynamic = "force-dynamic";

async function safeFetch<T>(
  path: string,
  fallback: T,
  revalidate = 60,
): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate });
  } catch {
    return fallback;
  }
}

const EMPTY_COHORT: CohortOverview = {
  current_quarter: null,
  previous_quarter: null,
  top_buys: [],
  top_sells: [],
  consensus_buy: [],
  consensus_sell: [],
  divergences: [],
};

const EMPTY_ACTIVITY: RecentActivity = {
  since_days: 7,
  since_date: "",
  ts: "",
  transactions: [],
};

export default async function RentaVariablePage() {
  const [catalog, cohort, recent, managers, scanner] = await Promise.all([
    safeFetch<CedearCatalogItem[]>("/api/smart-money/catalog", [], 300),
    safeFetch<CohortOverview>("/api/smart-money/cohort-overview", EMPTY_COHORT, 60),
    safeFetch<RecentActivity>("/api/smart-money/recent-activity?days=14", EMPTY_ACTIVITY, 60),
    safeFetch<ManagerDoc[]>("/api/smart-money/managers", [], 300),
    // Scanner: TTL bajo porque el motor escribe cada 1s y queremos
    // reflejar el live. El polling client (10s) hace la lectura efectiva.
    safeFetch<CedearScannerRow[]>("/api/scanner/cedears", [], 5),
  ]);

  return (
    <RentaVariableShell
      initialCatalog={catalog}
      initialCohort={cohort}
      initialRecent={recent}
      initialManagers={managers}
      initialScanner={scanner}
    />
  );
}
