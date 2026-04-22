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

interface ForwardDoc {
  curva: string;
  tasas?: Record<string, number>;
}

export function RentaFijaTable({
  data,
  flujos,
  forwards = [],
}: {
  data: RentaFijaDoc[];
  flujos: FlujoTicker[];
  forwards?: ForwardDoc[];
}) {
  const [vista, setVista] = useState<"tasa_fija" | "cer" | "soberanos" | "libro">(
    "tasa_fija"
  );
  const curva = vista === "libro" ? "tasa_fija" : vista;

  const tickerCurvaMap: Record<string, string> = {};
  for (const f of flujos) {
    tickerCurvaMap[f.ticker] = f.curva;
  }

  const teaMap: Record<string, number> = {};
  for (const fwd of forwards) {
    if (fwd.tasas) {
      for (const [tk, tea] of Object.entries(fwd.tasas)) {
        teaMap[tk] = tea;
      }
    }
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
        <FilterBtn active={vista === "soberanos"} onClick={() => setVista("soberanos")}>
          GLOBALES
        </FilterBtn>
        <FilterBtn active={vista === "libro"} onClick={() => setVista("libro")}>
          LIBRO
        </FilterBtn>
      </div>

      {vista === "libro" ? (
        <LibroPanel data={data} />
      ) : sorted.length > 0 ? (
        <div className="h-[380px] overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="!px-1 text-center">INSTRUMENTO</th>
                <th className="!px-1 text-center">LAST</th>
                <th className="!px-1 text-center">INTRADAY</th>
                <th className="!px-1 text-center">1D</th>
                <th className="!px-1 text-center">VWAP</th>
                <th className="!px-1 text-center">TEA</th>
                {curva === "tasa_fija" && (
                  <th className="!px-1 text-center">TEM</th>
                )}
                <th className="!px-1 text-center">HIGH</th>
                <th className="!px-1 text-center">LOW</th>
                <th className="!px-1 text-center">CIERRE</th>
                <th className="!px-1 text-center">VOL NOM</th>
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
                const short = shortTicker(r.instrumento);
                const tea = teaMap[short];
                const tem =
                  tea !== undefined
                    ? (Math.pow(1 + tea, 1 / 12) - 1) * 100
                    : null;

                return (
                  <tr key={r.instrumento}>
                    <td className="!px-1 text-[#ff9900]">{short}</td>
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
                    <td
                      className={`!px-1 text-right ${
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
                    <td className="!px-1 text-right text-[#808080]">
                      {fmtPrice(r.metrics?.vwap)}
                    </td>
                    <td className="!px-1 text-right text-[#d0d0d0]">
                      {tea !== undefined ? `${(tea * 100).toFixed(1)}%` : "--"}
                    </td>
                    {curva === "tasa_fija" && (
                      <td className="!px-1 text-right text-[#d0d0d0]">
                        {tem !== null ? `${tem.toFixed(2)}%` : "--"}
                      </td>
                    )}
                    <td className="!px-1 text-right text-[#00cc66]">
                      {fmtPrice(r.metrics?.high_price)}
                    </td>
                    <td className="!px-1 text-right text-[#ff3333]">
                      {fmtPrice(r.metrics?.low_price)}
                    </td>
                    <td className="!px-1 text-right text-[#808080]">
                      {fmtPrice(close)}
                    </td>
                    <td className="!px-1 text-right text-[#ffaa00]">
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
