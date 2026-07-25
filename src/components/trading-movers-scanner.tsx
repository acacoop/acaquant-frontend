"use client";

import { useMemo } from "react";

import { usePoll } from "@/lib/use-poll";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";
import { CedearsScannerTable } from "./cedears-scanner-table";

/**
 * Radar hot-movers de la vista TRADING. Reusa el MISMO CedearsScannerTable del
 * Scanner de Renta Variable, pero muestra SOLO los CEDEARs "al palo": los que a
 * 1D o intradía se movieron ±UMBRAL% o más. Siempre prendido (poll 2s).
 *
 * A diferencia del Scanner de RV (catálogo completo, exploratorio), esto es un
 * radar: en mercado tranquilo queda casi vacío — y eso ES información.
 *
 * Click en una fila → onSelect(ticker) para cargarlo en el chart/libro/tape.
 */
const POLL_MS = 2_000;
const CCL_POLL_MS = 5_000;
const UMBRAL = 4; // % — |1D| o |intradía| para entrar al radar

const CCL_INIT: CclLive = { value: null, vs_1d_pct: null, ts: null };

function esMover(r: CedearScannerRow): boolean {
  const intra = Math.abs(r.intraday_pct ?? 0);
  const d1 = Math.abs(r.vs_1d_pct ?? 0);
  return intra >= UMBRAL || d1 >= UMBRAL;
}

export function TradingMoversScanner({
  onSelect,
  selectedTicker,
}: {
  onSelect?: (ticker: string) => void;
  selectedTicker?: string | null;
}) {
  const { data: rows } = usePoll<CedearScannerRow[]>(
    "/api/scanner/cedears",
    [],
    POLL_MS,
    { fetchOnMount: true },
  );
  const { data: ccl } = usePoll<CclLive>(
    "/api/scanner/ccl",
    CCL_INIT,
    CCL_POLL_MS,
    { fetchOnMount: true },
  );

  const movers = useMemo(() => (rows ?? []).filter(esMover), [rows]);

  // Content-only: el borde y las tabs los pone TradingRadarPanel.
  if (movers.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-muted)] text-center px-3">
        sin movimientos fuertes ahora — nada supera ±{UMBRAL}%
      </div>
    );
  }
  return (
    <div className="h-full min-h-0">
      <CedearsScannerTable
        data={movers}
        ccl={ccl}
        onSelect={onSelect}
        selectedTicker={selectedTicker}
      />
    </div>
  );
}
