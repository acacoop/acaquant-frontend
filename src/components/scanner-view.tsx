"use client";

import { useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { Panel } from "./panel";
import { CclKpi, CedearsScannerTable } from "./cedears-scanner-table";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";

/**
 * Vista CEDEARS — es toda la pantalla de /renta-variable.
 *
 * Refactor 2026-09-10. Layout 50/50:
 *   - IZQUIERDA: panel CEDEARS = la tabla en ARS. El buscador y el KPI CCL van
 *     en la MISMA fila que el título del panel (no gastan una fila propia).
 *     Sin switch ADR, sin RUBRO/SPREAD/VWAP, con $ OPERADO.
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
  const [query, setQuery] = useState("");

  const buscador = (
    <>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar ticker…"
        className="w-[150px] bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-2 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none placeholder:text-[var(--t-text-muted)]"
      />
      {query && (
        <button
          onClick={() => setQuery("")}
          className="text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[12px] px-1"
          title="Limpiar búsqueda"
        >
          ✕
        </button>
      )}
    </>
  );

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        <Panel
          title="CEDEARS"
          count={rows.length}
          actions={buscador}
          rightActions={<CclKpi ccl={ccl} />}
          fill
        >
          <CedearsScannerTable
            data={rows}
            selectedTicker={selectedTicker}
            onSelect={setSelectedTicker}
            query={query}
          />
        </Panel>

        {/* DERECHA: reservada. Se define en el próximo paso del refactor. */}
        <div className="min-w-0 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)]" />
      </div>
    </div>
  );
}
