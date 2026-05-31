"use client";

import { useMemo } from "react";
import { buildScenarios, type ResolvedLeg } from "@/lib/estrategias";

export function EscenariosTabla({
  legs,
  spot,
  costo,
  tasa,
}: {
  legs: ResolvedLeg[];
  spot: number;
  costo: number;
  tasa: number;
}) {
  const { rows, T } = useMemo(
    () => buildScenarios(legs, spot, costo, tasa),
    [legs, spot, costo, tasa]
  );

  if (!legs.length || spot <= 0) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        Sin patas para calcular escenarios.
      </p>
    );
  }

  const fmtMoney = (v: number) =>
    v.toLocaleString("es-AR", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  const plColor = (v: number) =>
    v > 0 ? "text-[#00cc66]" : v < 0 ? "text-[#ff4444]" : "text-[#808080]";

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="text-[9px] text-[#555555] pb-1 shrink-0">
        ±2%/paso · r={(tasa * 100).toFixed(1)}%
        {T
          ? ` · T≈${Math.round(T * 365)}d`
          : " · T: Greeks insuficientes"}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
            <tr className="text-[#707070]">
              <th className="!px-1 text-right">PRECIO</th>
              <th className="!px-1 text-right">VAR</th>
              <th className="!px-1 text-right">FINISH</th>
              {T !== null && <th className="!px-1 text-right">TEÓRICO</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.varPct}>
                <td className="!px-1 text-right text-[#d0d0d0]">
                  ${fmtMoney(r.precio)}
                </td>
                <td className="!px-1 text-right text-[#808080]">
                  {(r.varPct * 100).toFixed(0)}%
                </td>
                <td
                  className={`!px-1 text-right font-semibold ${plColor(
                    r.finish
                  )}`}
                >
                  ${fmtMoney(r.finish)}
                </td>
                {T !== null && (
                  <td
                    className={`!px-1 text-right ${plColor(r.teorico || 0)}`}
                  >
                    {r.teorico !== null ? `$${fmtMoney(r.teorico)}` : "--"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
