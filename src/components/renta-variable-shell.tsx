"use client";

import { ScannerView } from "./scanner-view";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";

/**
 * Shell de /renta-variable. Hoy hospeda únicamente la vista Scanner.
 * Smart Money fue removido del producto (2026-05-13).
 *
 * El KPI CCL vive ahora dentro de la propia tabla del Scanner (al lado
 * del switch CEDEAR/ADR), no en este shell.
 */
export function RentaVariableShell({
  initialScanner,
  initialCcl,
}: {
  initialScanner: CedearScannerRow[];
  initialCcl: CclLive;
}) {
  return (
    <div className="h-full min-h-0 flex flex-col">
      <ScannerView initial={initialScanner} initialCcl={initialCcl} />
    </div>
  );
}
