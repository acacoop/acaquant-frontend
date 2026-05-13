"use client";

import { usePoll } from "@/lib/use-poll";
import { ScannerView } from "./scanner-view";
import type { CedearScannerRow, CclLive } from "@/lib/types-scanner";

const CCL_POLL_MS = 10_000;

/**
 * Shell de /renta-variable. Hoy hospeda únicamente la vista Scanner. La
 * vista Smart Money fue removida del producto (2026-05-13) — todo el
 * código y data se borraron del repo y de Mongo.
 *
 * KPI CCL queda visible en la barra superior — útil como referencia
 * macro para la mesa, aunque la vista Scanner ya no lo use en cálculos
 * (los pivots son sobre USD del underlying, no convertimos con CCL).
 */
export function RentaVariableShell({
  initialScanner,
  initialCcl,
}: {
  initialScanner: CedearScannerRow[];
  initialCcl: CclLive;
}) {
  const { data: ccl } = usePoll<CclLive>(
    "/api/scanner/ccl",
    initialCcl,
    CCL_POLL_MS,
  );

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[#1a1a1a] bg-[#080808] px-3 flex items-center gap-1 shrink-0 h-[36px]">
        <span className="text-[11px] tracking-wide uppercase text-[#ff9900] px-3 py-2">
          Scanner
        </span>
        <CclKpi data={ccl} />
      </div>

      <div className="flex-1 min-h-0">
        <ScannerView initial={initialScanner} />
      </div>
    </div>
  );
}

function CclKpi({ data }: { data: CclLive }) {
  const { value, vs_1d_pct } = data;
  const variation =
    vs_1d_pct === null
      ? null
      : `${vs_1d_pct >= 0 ? "+" : ""}${vs_1d_pct.toFixed(2)}%`;
  const variationColor =
    vs_1d_pct === null
      ? "text-[#555555]"
      : vs_1d_pct >= 0
      ? "text-[#00cc66]"
      : "text-[#ff3333]";

  return (
    <div
      className="ml-auto flex items-center gap-2 pr-1 text-[10px] tabular-nums"
      title="CCL live (DolarSnapshot._id=current) + variación vs cierre del día previo"
    >
      <span className="text-[#808080] tracking-wide uppercase">CCL</span>
      <span className="text-[#d0d0d0] font-mono">
        {value !== null ? `$${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}` : "--"}
      </span>
      <span className={variationColor}>{variation ?? "--"}</span>
    </div>
  );
}
