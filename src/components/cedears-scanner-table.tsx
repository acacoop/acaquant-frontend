"use client";

import { useMemo } from "react";
import type { CedearScannerRow } from "@/lib/types-scanner";
import { fmtPrice } from "./ui";

/**
 * Tabla del Scanner Renta Variable v1 — plana, sin agrupación.
 *
 * MVP con AMD + NVDA piloto. Cuando el universo escale a 20-30 CEDEARs,
 * refactoreamos a vista agrupada por sector con drill-down.
 *
 * Columnas: TICKER · SECTOR · LAST · INTRA · 1D
 */
export function CedearsScannerTable({ data }: { data: CedearScannerRow[] }) {
  const sorted = useMemo(
    () =>
      [...data].sort((a, b) =>
        (a.ticker_corto || "").localeCompare(b.ticker_corto || "")
      ),
    [data]
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[#080808] z-10">
            <tr className="text-[#707070]">
              <th className="!px-1 text-left">TICKER</th>
              <th className="!px-1 text-left">SECTOR</th>
              <th className="!px-1 text-right">LAST</th>
              <th className="!px-1 text-right">INTRA</th>
              <th className="!px-1 text-right">1D</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-[#555555] text-xs py-4 text-center">
                  SIN CEDEARS ACTIVOS — correr scripts/seed_cedears.py
                </td>
              </tr>
            ) : (
              sorted.map((r) => (
                <tr key={r.ticker_corto}>
                  <td className="!px-1 text-[#ff9900] font-semibold">
                    {r.ticker_corto}
                  </td>
                  <td className="!px-1 text-[#808080]">
                    {r.sector || "--"}
                  </td>
                  <td className="!px-1 text-right font-semibold tabular-nums">
                    {fmtPrice(r.last ?? undefined)}
                  </td>
                  <td
                    className={`!px-1 text-right tabular-nums ${
                      r.intraday_pct === null
                        ? "text-[#555555]"
                        : r.intraday_pct >= 0
                        ? "text-[#00cc66]"
                        : "text-[#ff3333]"
                    }`}
                  >
                    {r.intraday_pct !== null
                      ? `${r.intraday_pct >= 0 ? "+" : ""}${r.intraday_pct.toFixed(2)}%`
                      : "--"}
                  </td>
                  <td
                    className={`!px-1 text-right tabular-nums ${
                      r.vs_1d_pct === null
                        ? "text-[#555555]"
                        : r.vs_1d_pct >= 0
                        ? "text-[#00cc66]"
                        : "text-[#ff3333]"
                    }`}
                  >
                    {r.vs_1d_pct !== null
                      ? `${r.vs_1d_pct >= 0 ? "+" : ""}${r.vs_1d_pct.toFixed(2)}%`
                      : "--"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
