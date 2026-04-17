"use client";

import { useMemo, useState } from "react";
import { shortTicker, fmtPrice, fmtVol } from "./ui";

export interface OpcionDoc {
  instrumento: string;
  bid?: number;
  offer?: number;
  last?: number;
  open?: number;
  high?: number;
  low?: number;
  ev?: number;
  spot?: number;
  strike?: number;
  tipo?: "CALL" | "PUT" | string;
  vence?: string;
  closing_price?: number;
  delta?: number;
  gamma?: number;
  iv?: number;
  theta?: number;
  vega?: number;
}

type Vista = "CALL" | "PUT";

export function OpcionesTable({ data }: { data: OpcionDoc[] }) {
  const [vista, setVista] = useState<Vista>("CALL");

  const filtered = useMemo(
    () =>
      data
        .filter((r) => r.tipo === vista)
        .filter((r) => (r.last || 0) > 0 || (r.bid || 0) > 0 || (r.offer || 0) > 0)
        .sort((a, b) => (a.strike || 0) - (b.strike || 0)),
    [data, vista]
  );

  const spot = data.find((r) => r.spot)?.spot;
  const vence = data.find((r) => r.vence)?.vence;
  const totalEV = filtered.reduce((s, r) => s + (r.ev || 0), 0);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <FilterBtn active={vista === "CALL"} onClick={() => setVista("CALL")}>
          CALL
        </FilterBtn>
        <FilterBtn active={vista === "PUT"} onClick={() => setVista("PUT")}>
          PUT
        </FilterBtn>
        {spot !== undefined && (
          <span className="ml-auto text-[10px] text-[#808080]">
            SPOT{" "}
            <span className="text-[#ff9900] font-semibold">
              {fmtPrice(spot)}
            </span>
            {vence && (
              <span className="ml-2">
                VENCE{" "}
                <span className="text-[#d0d0d0]">{fmtVence(vence)}</span>
              </span>
            )}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-[#555555] text-xs py-4 text-center">
          SIN DATOS — MERCADO CERRADO
        </p>
      ) : (
        <div className="h-[380px] overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="!px-1 text-center">TICKER</th>
                <th className="!px-1 text-center">STRIKE</th>
                <th className="!px-1 text-center">BID</th>
                <th className="!px-1 text-center">OFFER</th>
                <th className="!px-1 text-center">LAST</th>
                <th className="!px-1 text-center">INTRADAY</th>
                <th className="!px-1 text-center">IV</th>
                <th className="!px-1 text-center">DELTA</th>
                <th className="!px-1 text-center">GAMMA</th>
                <th className="!px-1 text-center">VEGA</th>
                <th className="!px-1 text-center">THETA</th>
                <th className="!px-1 text-center">VOL</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const last = r.last;
                const open = r.open;
                const intraday =
                  last && open && open > 0 ? (last / open - 1) * 100 : null;
                const itm =
                  spot && r.strike
                    ? r.tipo === "CALL"
                      ? spot > r.strike
                      : spot < r.strike
                    : false;
                return (
                  <tr key={r.instrumento}>
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
                      {fmtPrice(last)}
                    </td>
                    <td
                      className={`!px-1 text-right ${
                        intraday === null
                          ? "text-[#555555]"
                          : intraday >= 0
                          ? "text-[#00cc66]"
                          : "text-[#ff3333]"
                      }`}
                    >
                      {intraday !== null
                        ? `${intraday >= 0 ? "+" : ""}${intraday.toFixed(2)}%`
                        : "--"}
                    </td>
                    <td className="!px-1 text-right text-[#d0d0d0]">
                      {r.iv !== undefined ? `${(r.iv * 100).toFixed(1)}%` : "--"}
                    </td>
                    <td className="!px-1 text-right text-[#808080]">
                      {r.delta !== undefined ? r.delta.toFixed(3) : "--"}
                    </td>
                    <td className="!px-1 text-right text-[#808080]">
                      {r.gamma !== undefined ? r.gamma.toFixed(4) : "--"}
                    </td>
                    <td className="!px-1 text-right text-[#808080]">
                      {r.vega !== undefined ? r.vega.toFixed(2) : "--"}
                    </td>
                    <td className="!px-1 text-right text-[#808080]">
                      {r.theta !== undefined ? r.theta.toFixed(2) : "--"}
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

      <div className="mt-1 text-[10px] text-[#555555] text-right">
        {filtered.length} contrato{filtered.length !== 1 ? "s" : ""}{" "}
        {vista} · VOL EFECTIVO {fmtVol(totalEV)}
      </div>
    </div>
  );
}

function fmtVence(raw: string): string {
  if (raw.length !== 8) return raw;
  return `${raw.slice(6, 8)}/${raw.slice(4, 6)}/${raw.slice(2, 4)}`;
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
