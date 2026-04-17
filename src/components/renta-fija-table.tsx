"use client";

import { useState } from "react";
import { shortTicker, fmtPrice, fmtVol } from "./ui";
import { LibroPanel } from "./libro-panel";

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
  const [vista, setVista] = useState<"tasa_fija" | "cer" | "libro">(
    "tasa_fija"
  );
  const curva = vista === "libro" ? "tasa_fija" : vista;

  const tickerCurvaMap: Record<string, string> = {};
  for (const f of flujos) {
    tickerCurvaMap[f.ticker] = f.curva;
  }

  const filtered = data.filter((r) => {
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
        <FilterBtn
          active={vista === "tasa_fija"}
          onClick={() => setVista("tasa_fija")}
        >
          TASA FIJA
        </FilterBtn>
        <FilterBtn active={vista === "cer"} onClick={() => setVista("cer")}>
          CER
        </FilterBtn>
        <FilterBtn active={vista === "libro"} onClick={() => setVista("libro")}>
          LIBRO
        </FilterBtn>
      </div>

      {vista === "libro" ? (
        <LibroPanel data={data} />
      ) : sorted.length > 0 ? (
        <div className="h-[380px] overflow-y-auto">
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
                    <td className="text-[#ff9900]">
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

      {vista !== "libro" && (
        <div className="mt-1 text-[10px] text-[#555555] text-right">
          {sorted.length} instrumento{sorted.length !== 1 ? "s" : ""} ·{" "}
          VOL TOTAL {fmtVol(sorted.reduce((s, r) => s + (r.metrics?.total_nominals || 0), 0))} VN
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
