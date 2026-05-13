"use client";

import { usePoll } from "@/lib/use-poll";
import { Panel } from "./panel";
import { CedearsScannerTable } from "./cedears-scanner-table";
import type { CedearScannerRow } from "@/lib/types-scanner";

/**
 * Vista Scanner — pestaña dentro de /renta-variable.
 *
 * Layout: grilla 2x2. Por ahora solo se llena el cuadrante TOP-LEFT con
 * la tabla CEDEARs. El resto del layout queda vacío (a llenar después
 * con sector heatmap, breadth, region rollup, etc.).
 *
 * El polling lo maneja usePoll directamente sobre `/api/scanner/cedears`
 * (TTL backend 5s, polling client 10s → max staleness ~15s).
 */
const POLL_MS = 10_000;

export function ScannerView({ initial }: { initial: CedearScannerRow[] }) {
  const { data: rows } = usePoll<CedearScannerRow[]>(
    "/api/scanner/cedears",
    initial,
    POLL_MS,
  );

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 grid-rows-2 gap-3 h-full min-h-0">
        {/* Cuadrante TOP-LEFT: tabla CEDEARs */}
        <div className="min-w-0 min-h-0">
          <Panel title="CEDEARS" count={rows.length} expandable>
            <CedearsScannerTable data={rows} />
          </Panel>
        </div>

        {/* Otros 3 cuadrantes vacíos por ahora */}
        <div className="min-w-0 min-h-0" />
        <div className="min-w-0 min-h-0" />
        <div className="min-w-0 min-h-0" />
      </div>
    </div>
  );
}
