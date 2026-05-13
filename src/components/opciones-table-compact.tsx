"use client";

import { useMemo, useState } from "react";
import { fmtPrice, fmtVol } from "./ui";
import { HelpTooltip } from "./help-tooltip";
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
                <th className="!px-1 text-right">STRIKE</th>
                <th className="!px-1 text-right">LAST</th>
                <th className="!px-1 text-right">
                  INTRA<HelpTooltip text="% intradía desde la apertura del día: (last / open − 1) × 100" />
                </th>
                <th className="!px-1 text-right">
                  1D<HelpTooltip text="% versus el cierre del día anterior: (last / closing_price − 1) × 100" />
                </th>
                <th className="!px-1 text-right">
                  SPREAD PUNTAS<HelpTooltip text="Spread relativo entre puntas: (offer − bid) / mid × 100. Menor = más líquido." />
                </th>
                <th className="!px-1 text-right">
                  IV<HelpTooltip text="Volatilidad implícita anualizada (a 1σ a 1 año). Lo que el mercado descuenta que va a moverse el subyacente." />
                </th>
                <th className="!px-1 text-right">
                  DELTA<HelpTooltip text="Delta — sensibilidad de la prima al precio del subyacente. Δprima ≈ delta × Δspot. 0.5 ≈ ATM; cerca de 1 está deep ITM." />
                </th>
                <th className="!px-1 text-right">
                  GAMMA<HelpTooltip text="Gamma — convexidad: cuánto cambia el delta por cada $1 de movimiento del spot. Alto cerca del strike, bajo deep ITM/OTM." />
                </th>
                <th className="!px-1 text-right">
                  THETA<HelpTooltip text="Theta — decay temporal: pérdida estimada de prima por día calendario, en pesos. Siempre negativo para el comprador." />
                </th>
                <th className="!px-1 text-right">
                  VEGA<HelpTooltip text="Vega — sensibilidad a la volatilidad implícita: cambio de prima por +1% de IV, en pesos." />
                </th>
                <th className="!px-1 text-right">
                  VOL<HelpTooltip text="Volumen efectivo del día — total operado en pesos." />
                </th>
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

                // Intraday: (last/open − 1) cuando open > 0. Mismo patrón
                // que la tabla de renta-fija para coherencia visual.
                const last = r.last || 0;
                const open = r.open || 0;
                const intraday =
                  last > 0 && open > 0 ? (last / open - 1) * 100 : null;

                // 1D: (last / closing_price - 1). pyRofex devuelve CL como
                // {price, date}, no número plano — extraemos defensivos.
                const closingPx =
                  typeof r.closing_price === "number"
                    ? r.closing_price
                    : r.closing_price?.price ?? 0;
                const vs1d =
                  last > 0 && closingPx > 0
                    ? (last / closingPx - 1) * 100
                    : null;

                // Spread relativo al mid — normaliza entre strikes baratas
                // (5 pesos) y caras (2000 pesos) para que se pueda comparar
                // liquidez de un vistazo. Si una punta es 0, sin spread.
                const bid = r.bid || 0;
                const offer = r.offer || 0;
                const mid = bid > 0 && offer > 0 ? (bid + offer) / 2 : 0;
                const spreadPct =
                  mid > 0 ? ((offer - bid) / mid) * 100 : null;

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
                      className={`!px-1 text-right ${
                        itm ? "text-[#ff9900] font-semibold" : "text-[#ff9900]"
                      }`}
                    >
                      {fmtPrice(r.strike)}
                    </td>
                    <td className="!px-1 text-right font-semibold">
                      {fmtPrice(r.last)}
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
                    <td className="!px-1 text-right text-[#d0d0d0]">
                      {spreadPct !== null ? `${spreadPct.toFixed(1)}%` : "--"}
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
                      {r.theta !== undefined ? r.theta.toFixed(2) : "--"}
                    </td>
                    <td className="!px-1 text-right text-[#808080]">
                      {r.vega !== undefined ? r.vega.toFixed(2) : "--"}
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
