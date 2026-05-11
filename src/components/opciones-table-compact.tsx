"use client";

import { useMemo, useState } from "react";
import { shortTicker, fmtPrice, fmtVol } from "./ui";
import type { OpcionDoc } from "@/lib/estrategias";

type Vista = "CALL" | "PUT";

export function OpcionesTableCompact({
  data,
  selectedInstrumento,
  onSelect,
}: {
  data: OpcionDoc[];
  selectedInstrumento?: string | null;
  onSelect?: (d: OpcionDoc | null) => void;
}) {
  const [vista, setVista] = useState<Vista>("CALL");

  const spot = data.find((r) => r.spot)?.spot;

  const filtered = useMemo(
    () =>
      data
        .filter((r) => r.tipo === vista)
        .filter(
          (r) => (r.last || 0) > 0 || (r.bid || 0) > 0 || (r.offer || 0) > 0
        )
        .sort((a, b) => (b.ev || 0) - (a.ev || 0)),
    [data, vista]
  );

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-1 shrink-0">
        <FilterBtn active={vista === "CALL"} onClick={() => setVista("CALL")}>
          CALL
        </FilterBtn>
        <FilterBtn active={vista === "PUT"} onClick={() => setVista("PUT")}>
          PUT
        </FilterBtn>
        <span className="ml-auto text-[10px] text-[#555555]">
          {filtered.length} · ordenado por VOL ↓
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[#555555] text-xs py-4 text-center">
          SIN DATOS — MERCADO CERRADO
        </p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[#080808] z-10">
              <tr className="text-[#707070]">
                <th className="!px-1 text-left">TICKER</th>
                <th className="!px-1 text-right">STRIKE</th>
                <th className="!px-1 text-right">BID</th>
                <th className="!px-1 text-right">OFFER</th>
                <th className="!px-1 text-right">LAST</th>
                <th className="!px-1 text-right">IV</th>
                <th className="!px-1 text-right">Δ</th>
                <th className="!px-1 text-right">VOL</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const itm =
                  spot && r.strike
                    ? r.tipo === "CALL"
                      ? spot > r.strike
                      : spot < r.strike
                    : false;
                const isSelected = r.instrumento === selectedInstrumento;
                return (
                  <tr
                    key={r.instrumento}
                    onClick={
                      onSelect
                        ? () => onSelect(isSelected ? null : r)
                        : undefined
                    }
                    className={`${
                      onSelect ? "cursor-pointer" : ""
                    } ${
                      isSelected
                        ? "bg-[#ff9900]/15"
                        : onSelect
                        ? "hover:bg-[#1a1a1a]"
                        : ""
                    }`}
                    title={onSelect ? "Click para ver costo histórico" : undefined}
                  >
                    <td
                      className={`!px-1 ${
                        itm ? "text-[#ff9900] font-semibold" : "text-[#ff9900]"
                      }`}
                    >
                      {shortTicker(r.instrumento)}
                    </td>
                    <td className="!px-1 text-right text-[#d0d0d0]">
                      {fmtPrice(r.strike)}
                    </td>
                    <td className="!px-1 text-right text-[#00cc66]">
                      {fmtPrice(r.bid)}
                    </td>
                    <td className="!px-1 text-right text-[#ff3333]">
                      {fmtPrice(r.offer)}
                    </td>
                    <td className="!px-1 text-right font-semibold">
                      {fmtPrice(r.last)}
                    </td>
                    <td className="!px-1 text-right text-[#d0d0d0]">
                      {r.iv !== undefined ? `${(r.iv * 100).toFixed(1)}%` : "--"}
                    </td>
                    <td className="!px-1 text-right text-[#808080]">
                      {r.delta !== undefined ? r.delta.toFixed(3) : "--"}
                    </td>
                    <td className="!px-1 text-right text-[#ffaa00]">
                      {fmtVol(r.ev)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
