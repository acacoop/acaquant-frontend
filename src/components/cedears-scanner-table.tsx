"use client";

import { useMemo, useState } from "react";
import type { CedearScannerRow } from "@/lib/types-scanner";
import { fmtPrice } from "./ui";

/**
 * Tabla del Scanner Renta Variable v1 — plana, ordenable por columnas.
 *
 * Click en cualquier header invierte el orden (asc/desc). Default:
 * INTRA descendente para tener los top movers arriba.
 */

type SortKey =
  | "ticker_corto"
  | "sector"
  | "last"
  | "intraday_pct"
  | "vs_1d_pct"
  | "vs_1d_usd_pct";

type SortDir = "asc" | "desc";

export function CedearsScannerTable({
  data,
  selectedTicker,
  onSelect,
}: {
  data: CedearScannerRow[];
  selectedTicker?: string | null;
  onSelect?: (ticker: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("intraday_pct");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Default desc para numéricos (ver top movers / mayor precio),
      // asc para texto (orden alfabético natural).
      setSortDir(key === "ticker_corto" || key === "sector" ? "asc" : "desc");
    }
  }

  const sorted = useMemo(() => {
    const cmp = (a: CedearScannerRow, b: CedearScannerRow) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // null/undefined al final, sin importar dirección.
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = av as number;
      const bn = bv as number;
      return sortDir === "asc" ? an - bn : bn - an;
    };
    return [...data].sort(cmp);
  }, [data, sortKey, sortDir]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[#080808] z-10">
            <tr className="text-[#707070]">
              <SortableTh
                label="TICKER"
                col="ticker_corto"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="left"
              />
              <SortableTh
                label="SECTOR"
                col="sector"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="left"
              />
              <SortableTh
                label="LAST"
                col="last"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <SortableTh
                label="INTRA"
                col="intraday_pct"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <SortableTh
                label="1D"
                col="vs_1d_pct"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
                title="Variación en ARS vs cierre del día anterior: (last / closing − 1) × 100"
              />
              <SortableTh
                label="USD"
                col="vs_1d_usd_pct"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
                title="Retorno USD real del activo: descuenta la variación del CCL al 1D. ((1 + cedear_1d/100) / (1 + ccl_1d/100) − 1) × 100"
              />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-[#555555] text-xs py-4 text-center">
                  SIN CEDEARS ACTIVOS — correr scripts/seed_cedears.py
                </td>
              </tr>
            ) : (
              sorted.map((r) => {
                const isSelected = r.ticker_corto === selectedTicker;
                return (
                <tr
                  key={r.ticker_corto}
                  onClick={onSelect ? () => onSelect(r.ticker_corto) : undefined}
                  className={`${onSelect ? "cursor-pointer" : ""} ${
                    isSelected
                      ? "bg-[#ff9900]/15"
                      : onSelect
                      ? "hover:bg-[#1a1a1a]"
                      : ""
                  }`}
                >
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
                  <td
                    className={`!px-1 text-right tabular-nums ${
                      r.vs_1d_usd_pct === null
                        ? "text-[#555555]"
                        : r.vs_1d_usd_pct >= 0
                        ? "text-[#00cc66]"
                        : "text-[#ff3333]"
                    }`}
                  >
                    {r.vs_1d_usd_pct !== null
                      ? `${r.vs_1d_usd_pct >= 0 ? "+" : ""}${r.vs_1d_usd_pct.toFixed(2)}%`
                      : "--"}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableTh({
  label,
  col,
  sortKey,
  sortDir,
  onClick,
  align,
  title,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (col: SortKey) => void;
  align: "left" | "right";
  title?: string;
}) {
  const active = sortKey === col;
  const arrow = active ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  return (
    <th
      onClick={() => onClick(col)}
      className={`!px-1 cursor-pointer select-none hover:text-[#ff9900] transition-colors text-${align} ${
        active ? "text-[#ff9900]" : ""
      }`}
      title={title ?? "Click para ordenar"}
    >
      {label}
      <span className="text-[8px]">{arrow}</span>
    </th>
  );
}
