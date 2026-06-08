"use client";

import { ScannerView } from "./scanner-view";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";

/**
 * Shell de /renta-variable — Scanner de CEDEARs (master + snapshot live).
 *
 * La "Mesa de Estrategia" (tabs ESTRATEGIA y MONITOR) era WIP sin uso y se
 * removió: el módulo hospeda únicamente el Scanner.
 */
export function RentaVariableShell({
  initialScanner,
  initialCcl,
}: {
  initialScanner: CedearScannerRow[];
  initialCcl: CclLive;
}) {
  return (
    <div className="h-full min-h-0">
      <ScannerView initial={initialScanner} initialCcl={initialCcl} />
    </div>
  );
}
