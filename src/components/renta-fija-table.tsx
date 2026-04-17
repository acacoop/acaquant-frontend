"use client";

import { useState } from "react";
import { shortTicker, fmtNum, fmtPrice, fmtVol } from "./ui";

interface RentaFijaDoc {
  instrumento: string;
  metrics?: {
    last_price?: number;
    vwap?: number;
    total_nominals?: number;
    high_price?: number;
    low_price?: number;
    closing_price?: number;
    open_price?: number;
  };
}

interface FlujoTicker {
  ticker: string;
  curva: string;
}

export function RentaFijaTable({
  data,
  flujos,
}: {
  data: RentaFijaDoc[];
  flujos: FlujoTicker[];
}) {
  const [curva, setCurva] = useState<string>("todas");

  // Build ticker → curva map from flujos data
  const tickerCurvaMap: Record<string, string> = {};
  for (const f of flujos) {
    // flujos ticker is short (e.g. "TX26"), renta-fija instrumento is long
    tickerCurvaMap[f.ticker] = f.curva;
  }

  // Filter renta fija by curva
  const filtered =
    curva === "todas"
      ? data
      : data.filter((r) => {
          const short = shortTicker(r.instrumento);
          return tickerCurvaMap[short] === curva;
        });

  const sorted = filtered
    .filter((r) => r.metrics?.last_price)
    .sort(
      (a, b) =>
        (b.metrics?.total_nominals || 0) - (a.metrics?.total_nominals || 0)
    );

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <FilterBtn active={curva === "todas"} onClick={() => setCurva("todas")}>
          TODAS
        </FilterBtn>
        <FilterBtn
          active={curva === "tasa_fija"}
          onClick={() => setCurva("tasa_fija")}
        >
          TASA FIJA
        </FilterBtn>
        <FilterBtn active={curva === "cer"} onClick={() => setCurva("cer")}>
          CER
        </FilterBtn>
      </div>

      {sorted.length > 0 ? (
        <div className="max-h-[400px] overflow-y-auto">
          <table>
            <thead>
              <tr>
                <th>INSTRUMENTO</th>
                <th className="text-right">LAST</th>
                <th className="text-right">INTRADAY</th>
                <th className="text-right">1D</th>
                <th className="text-right">VWAP</th>
                <th className="text-right">HIGH</th>
                <th className="text-right">LOW</th>
                <th className="text-right">CIERRE</th>
                <th className="text-right">VOL NOM</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const last = r.metrics?.last_price;
                const open = r.metrics?.open_price;
                const close = r.metrics?.closing_price;
                const intraday =
                  last && open && open > 0
                    ? (last / open - 1) * 100
                    : null;
                const vs1d =
                  last && close && close > 0
                    ? (last / close - 1) * 100
                    : null;

                return (
                  <tr key={r.instrumento}>
                    <td className="text-[#3399ff]">
                      {shortTicker(r.instrumento)}
                    </td>
                    <td className="text-right font-semibold">
                      {fmtPrice(last)}
                    </td>
                    <td
                      className={`text-right ${
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
                    <td
                      className={`text-right ${
                        vs1d === null
                          ? "text-[#555555]"
                          : vs1d >= 0
                          ? "text-[#00cc66]"
                          : "text-[#ff3333]"
                      }`}
                    >
                      {vs1d !== null
                        ? `${vs1d >= 0 ? "+" : ""}${vs1d.toFixed(2)}%`
                        : "--"}
                    </td>
                    <td className="text-right text-[#808080]">
                      {fmtPrice(r.metrics?.vwap)}
                    </td>
                    <td className="text-right text-[#00cc66]">
                      {fmtPrice(r.metrics?.high_price)}
                    </td>
                    <td className="text-right text-[#ff3333]">
                      {fmtPrice(r.metrics?.low_price)}
                    </td>
                    <td className="text-right text-[#808080]">
                      {fmtPrice(close)}
                    </td>
                    <td className="text-right text-[#ffaa00]">
                      {fmtVol(r.metrics?.total_nominals)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[#555555] text-xs py-4 text-center">
          SIN DATOS — MERCADO CERRADO
        </p>
      )}

      <div className="mt-1 text-[10px] text-[#555555] text-right">
        {sorted.length} instrumento{sorted.length !== 1 ? "s" : ""} ·{" "}
        VOL TOTAL {fmtVol(sorted.reduce((s, r) => s + (r.metrics?.total_nominals || 0), 0))} VN
      </div>
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
          ? "bg-[#094293] text-white border-[#094293]"
          : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#808080] hover:border-[#555555]"
      }`}
    >
      {children}
    </button>
  );
}
