"use client";

import { useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { Panel } from "./panel";
import { CedearsScannerTable } from "./cedears-scanner-table";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";

/**
 * Vista CEDEARS — es toda la pantalla de /renta-variable.
 *
 * Refactor 2026-09-10. Layout 50/50:
 *   - IZQUIERDA: panel CEDEARS = la tabla en ARS (buscador + KPI CCL en su
 *     barra). Sin switch ADR, sin RUBRO/SPREAD/VWAP, con $ OPERADO.
 *   - DERECHA: vacía a propósito. Se fueron MÉTRICAS (PULSO / PIVOTS / VOL /
 *     RETORNOS) y CHART & RETORNOS; lo que va acá se decide después, primero
 *     se cierra el lado izquierdo.
 *
 * El click en una fila sigue marcando el ticker elegido: es lo que va a
 * alimentar el lado derecho cuando exista.
 */
// Real-time: el motor escribe cedears_snapshot cada 1s y el service cachea 2s.
// Pollear a 2s mantiene la tabla viva sin pegarle al cache viejo.
const POLL_MS = 2_000;
const CCL_POLL_MS = 5_000;

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
        <Panel title="CEDEARS" count={rows.length} fill>
          <CedearsScannerTable
            data={rows}
            selectedTicker={selectedTicker}
            onSelect={setSelectedTicker}
            ccl={ccl}
          />
        </Panel>

        {/* DERECHA: reservada. Se define en el próximo paso del refactor. */}
        <div className="min-w-0 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)]" />
      </div>
    </div>
  );
}
