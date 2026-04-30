"use client";

import { Rueda } from "./dolar-mep-shared";
import { DolarMepTimeSalesChart } from "./dolar-mep-timesales-chart";

// Split horizontal chart MEP (izq 50%) + tabla específica de cada vista
// (der 50%). Lo comparten DolarMepCompraView (tabla operativas) y
// DolarMepTradingView (tabla triggers) — solo cambia el children.
export function DolarMepBoard({
  rueda,
  children,
}: {
  rueda: Rueda;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-h-0 flex gap-3">
      <div className="w-1/2 bg-[#080808] border border-[#1a1a1a] p-2 flex flex-col">
        <div className="text-[9px] tracking-wider text-[#888] mb-1 px-1">
          MEP {rueda} · MINUTO CLOSE · HOY
        </div>
        <div className="flex-1 min-h-0">
          <DolarMepTimeSalesChart rueda={rueda} />
        </div>
      </div>

      <div className="w-1/2 min-h-0 overflow-auto bg-[#080808] border border-[#1a1a1a]">
        {children}
      </div>
    </div>
  );
}
