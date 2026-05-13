"use client";

import { useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { Panel } from "./panel";
import { CedearsScannerTable } from "./cedears-scanner-table";
import { PivotPointsPanel } from "./pivot-points-panel";
import { TickerChartPanel } from "./ticker-chart-panel";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";

/**
 * Vista Scanner — pestaña dentro de /renta-variable.
 *
 * Layout:
 *   - Mitad IZQUIERDA: tabla CEDEARs SIN Panel header (la tabla tiene
 *     su propio header integrado con switch CEDEAR/ADR + KPI CCL).
 *   - Mitad DERECHA dividida en 2 filas:
 *       - Arriba: Panel PIVOT (primera quant feature).
 *       - Abajo:  Reservado para próximas quant features.
 *
 * Click en row de la tabla izquierda → setea ticker seleccionado y el
 * panel PIVOT se recalcula automáticamente.
 *
 * CCL: polling acá (10s) y se pasa a la tabla para mostrar inline.
 */
const POLL_MS = 10_000;
const CCL_POLL_MS = 10_000;

export function ScannerView({
  initial,
  initialCcl,
}: {
  initial: CedearScannerRow[];
  initialCcl: CclLive;
}) {
  const { data: rows } = usePoll<CedearScannerRow[]>(
    "/api/scanner/cedears",
    initial,
    POLL_MS,
  );
  const { data: ccl } = usePoll<CclLive>(
    "/api/scanner/ccl",
    initialCcl,
    CCL_POLL_MS,
  );
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        {/* IZQUIERDA: tabla CEDEARs sin Panel wrapper.
            La tabla ya tiene header integrado (switch + CCL). */}
        <div className="min-w-0 min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <CedearsScannerTable
            data={rows}
            selectedTicker={selectedTicker}
            onSelect={setSelectedTicker}
            ccl={ccl}
          />
        </div>

        {/* DERECHA: 40% MÉTRICAS arriba + 60% CHART abajo */}
        <div className="min-w-0 min-h-0 grid grid-rows-[2fr_3fr] gap-3">
          <Panel title="MÉTRICAS" expandable>
            <PivotPointsPanel ticker={selectedTicker} />
          </Panel>
          <Panel title="CHART & RETORNOS" expandable>
            <TickerChartPanel ticker={selectedTicker} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
