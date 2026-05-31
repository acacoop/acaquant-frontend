"use client";

import { Rueda } from "./dolar-mep-shared";
import { DolarMepTimeSalesChart } from "./dolar-mep-timesales-chart";

// Split horizontal chart MEP (izq 50%) + tabla específica de cada vista
// (der 50%). Lo comparten DolarMepCompraView y DolarMepVentaView — solo
// cambia el children.
export function DolarMepBoard({
  rueda,
  children,
}: {
  rueda: Rueda;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-h-0 flex gap-3">
      <div className="w-1/2 bg-[var(--t-panel)] border border-[var(--t-border)] p-2 flex flex-col">
        <div className="text-[9px] tracking-wider text-[var(--t-text-dim)] mb-1 px-1">
          MEP {rueda} · MINUTO CLOSE · HOY
        </div>
        <div className="flex-1 min-h-0">
          <DolarMepTimeSalesChart rueda={rueda} />
        </div>
      </div>

      <div className="w-1/2 min-h-0 overflow-auto bg-[var(--t-panel)] border border-[var(--t-border)]">
        {children}
      </div>
    </div>
  );
}
