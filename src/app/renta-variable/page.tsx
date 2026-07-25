import { apiFetch } from "@/lib/api";
import { ScannerView } from "@/components/scanner-view";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";

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

export default async function RentaVariablePage() {
  const [scanner, ccl] = await Promise.all([
    // Scanner: TTL bajo porque el motor escribe cada 1s; el polling
    // client (10s) hace la lectura efectiva.
    safeFetch<CedearScannerRow[]>("/api/scanner/cedears", [], 5),
    // CCL live para el KPI del shell — comparte cache backend con
    // get_cedears_scanner (5s TTL).
    safeFetch<CclLive>(
      "/api/scanner/ccl",
      { value: null, vs_1d_pct: null, ts: null },
      5,
    ),
  ]);

  // Sin shell de tabs: la tab ANÁLISIS FUNDAMENTAL se eliminó (2026-07-24)
  // y el SCANNER es la vista entera de /renta-variable.
  return <ScannerView initial={scanner} initialCcl={ccl} />;
}
