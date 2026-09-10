"use client";

import { useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { Panel } from "./panel";
import { CclKpi, CedearsScannerTable } from "./cedears-scanner-table";
import { TradingViewChart } from "./tradingview-chart";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";

/**
 * Vista CEDEARS — es toda la pantalla de /renta-variable.
 *
 * Refactor 2026-09-10. Layout 50/50:
 *   - IZQUIERDA: panel CEDEARS = la tabla en ARS. El buscador y el KPI CCL van
 *     en la MISMA fila que el título del panel (no gastan una fila propia).
 *     Sin switch ADR, sin RUBRO/SPREAD/VWAP, con $ OPERADO.
 *   - DERECHA: panel ADR = TradingView del SUBYACENTE en USD (el `underlying`
 *     de la fila: YPFD → YPF), linkeado al ticker elegido en la tabla. Es el
 *     ADR y no el CEDEAR a propósito: la historia limpia es la del papel en
 *     dólares; el CEDEAR en pesos es eso por el CCL. Se reusa el componente
 *     genérico `tradingview-chart.tsx` (el mismo de la watchlist de HOME).
 *
 * Sin click todavía, el chart arranca con el PRIMER papel de la tabla en su
 * orden por defecto (INTRA desc): el panel nunca está vacío. Se fueron
 * MÉTRICAS (PULSO / PIVOTS / VOL / RETORNOS) y CHART & RETORNOS. Los pivots
 * del ADR (`pivot-points-panel.tsx`) viven hoy en TRADING → MONITOR, ventana
 * PIVOTS; retornos y vol/beta se borraron del todo.
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

  // Papel activo: el elegido, o el primero de la tabla en su orden por defecto
  // (INTRA desc, la misma regla que `CedearsScannerTable`) mientras no se
  // clickeó nada. Con `rows` vacío no hay activo y el panel lo dice.
  const activo = useMemo<CedearScannerRow | null>(() => {
    if (selectedTicker) {
      return rows.find((r) => r.ticker_corto === selectedTicker) ?? null;
    }
    let top: CedearScannerRow | null = null;
    for (const r of rows) {
      if (r.intraday_pct == null) continue;
      if (!top || r.intraday_pct > (top.intraday_pct ?? -Infinity)) top = r;
    }
    return top ?? rows[0] ?? null;
  }, [rows, selectedTicker]);
  const simboloAdr = activo ? (activo.underlying || activo.ticker_corto) : null;
  // El título dice solo `ADR · PBR`: el CEDEAR del que viene ya está marcado en
  // la tabla y repetirlo acá confundía (feedback del user 2026-09-10).

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

        {/* DERECHA: el ADR del papel elegido, en TradingView */}
        <Panel
          title={simboloAdr ? `ADR · ${simboloAdr}` : "ADR"}
          rightActions={
            // El widget gratuito de TradingView sirve NYSE/NASDAQ con 15 min de
            // atraso (documentación de TradingView; el precio de AHORA está en
            // la tabla). Se dice y nada más.
            <span className="text-[10px] text-[var(--t-text-muted)] tracking-wide uppercase">
              Delay 15 min
            </span>
          }
          fill
        >
          {simboloAdr ? (
            // key = símbolo: al cambiar de papel se remonta el widget entero,
            // que es lo que TradingView necesita para cambiar de instrumento.
            <TradingViewChart key={simboloAdr} symbol={simboloAdr} />
          ) : (
            <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
              Sin CEDEARs para graficar
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
