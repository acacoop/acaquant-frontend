"use client";

import { useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { Panel } from "./panel";
import { CedearsScannerTable } from "./cedears-scanner-table";
import { PivotPointsPanel } from "./pivot-points-panel";
import type { CedearScannerRow } from "@/lib/types-scanner";

/**
 * Vista Scanner — pestaña dentro de /renta-variable.
 *
 * Layout:
 *   - Mitad IZQUIERDA (col 1, full height): tabla CEDEARs.
 *   - Mitad DERECHA dividida en 2 filas:
 *       - Arriba: Panel PIVOT (primera quant feature).
 *       - Abajo:  Reservado para próximas quant features.
 *
 * Click en row de la tabla izquierda → setea ticker seleccionado y el
 * panel PIVOT se recalcula automáticamente.
 */
const POLL_MS = 10_000;

export function ScannerView({ initial }: { initial: CedearScannerRow[] }) {
  const { data: rows } = usePoll<CedearScannerRow[]>(
    "/api/scanner/cedears",
    initial,
    POLL_MS,
  );
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        {/* IZQUIERDA: tabla CEDEARs (altura completa) */}
        <div className="min-w-0 min-h-0">
          <Panel title="CEDEARS" count={rows.length} expandable>
            <CedearsScannerTable
              data={rows}
              selectedTicker={selectedTicker}
              onSelect={setSelectedTicker}
            />
          </Panel>
        </div>

        {/* DERECHA: nested grid de 2 filas */}
        <div className="min-w-0 min-h-0 grid grid-rows-2 gap-3">
          <Panel title="PIVOT POINTS" expandable>
            <PivotPointsPanel ticker={selectedTicker} />
          </Panel>
          {/* Reservado para próxima quant feature */}
          <div className="min-w-0 min-h-0" />
        </div>
      </div>
    </div>
  );
}
