"use client";

import { useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { Panel } from "./panel";
import { CedearsScannerTable } from "./cedears-scanner-table";
import { IaVistaPanel } from "./ia-vista-panel";
import { MetricasPanel, rubroDe } from "./metricas-panel";
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
 * CCL: polling acá y se pasa a la tabla para mostrar inline.
 */
// Real-time: el motor escribe CedearsSnapshot cada 1s y el service cachea 2s.
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
  // Filtro por rubro: se setea al clickear un rubro en el Pulso (MÉTRICAS) y
  // recorta la tabla CEDEAR/ADR a los tickers de ese rubro. El Pulso sigue
  // mostrando TODOS los rubros (se calcula sobre `rows` completo).
  const [selectedRubro, setSelectedRubro] = useState<string | null>(null);
  const tableRows = selectedRubro
    ? rows.filter((r) => rubroDe(r) === selectedRubro)
    : rows;

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        {/* IZQUIERDA: tabla CEDEARs a alto completo (el Time & Sales se movió a
            un tab dentro de CHART & RETORNOS, derecha abajo). */}
        <div className="min-w-0 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
          <CedearsScannerTable
            data={tableRows}
            selectedTicker={selectedTicker}
            onSelect={setSelectedTicker}
            ccl={ccl}
            rubroFiltro={selectedRubro}
            onClearRubro={() => setSelectedRubro(null)}
          />
        </div>

        {/* DERECHA: 50% MÉTRICAS arriba + 50% CHART abajo (alinea con la izquierda) */}
        <div className="min-w-0 min-h-0 grid grid-rows-2 gap-3">
          <Panel title="MÉTRICAS" expandable>
            <MetricasPanel
              rows={rows}
              ticker={selectedTicker}
              selectedRubro={selectedRubro}
              onRubroSelect={setSelectedRubro}
            />
          </Panel>
          <Panel title="CHART & RETORNOS" expandable>
            <TickerChartPanel ticker={selectedTicker} />
          </Panel>
        </div>
      </div>

      {/* Copiloto IA contextual (QuantAI P3): botón ✦ IA + drawer. Solo se
          renderiza si el backend habilita la vista (módulo ia + renta-variable). */}
      <IaVistaPanel vista="cedears" />
    </div>
  );
}
