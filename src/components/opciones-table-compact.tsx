"use client";

import { useMemo, useState } from "react";
import { fmtPrice, fmtVol } from "./ui";
import { TableHelp } from "./help-tooltip";
import type { OpcionDoc } from "@/lib/estrategias";

const OPCIONES_GLOSSARY = [
  { label: "INTRA",         text: "% intradía desde la apertura del día: (last / open − 1) × 100." },
  { label: "1D",            text: "Variación vs cierre del día anterior: (last / closing_price − 1) × 100." },
  { label: "SPREAD PUNTAS", text: "Spread relativo entre puntas: (offer − bid) / mid × 100. Menor = más líquido." },
  { label: "IV",            text: "Volatilidad implícita anualizada (a 1σ a 1 año). Lo que el mercado descuenta que va a moverse el subyacente." },
  { label: "DELTA",         text: "Sensibilidad de la prima al precio del subyacente. Δprima ≈ delta × Δspot. 0.5 ≈ ATM; cerca de 1 está deep ITM." },
  { label: "GAMMA",         text: "Convexidad: cuánto cambia el delta por cada $1 de movimiento del spot. Alto cerca del strike, bajo deep ITM/OTM." },
  { label: "THETA",         text: "Decay temporal: pérdida estimada de prima por día calendario, en pesos. Siempre negativo para el comprador." },
  { label: "VEGA",          text: "Sensibilidad a la volatilidad implícita: cambio de prima por +1% de IV, en pesos." },
  { label: "VOL",           text: "Volumen efectivo del día — total operado en pesos." },
];

type Vista = "CALL" | "PUT";

export function OpcionesTableCompact({
  data,
  selectedInstrumento,
  onSelect,
  vistaControlada,
  hideFilter = false,
}: {
  data: OpcionDoc[];
  selectedInstrumento?: string | null;
  onSelect?: (d: OpcionDoc | null) => void;
  // Cuando el filtro CALL/PUT/ESTRATEGIAS vive afuera (derivados-view), la
  // tabla recibe la vista controlada y oculta sus propios botones.
  vistaControlada?: Vista;
  hideFilter?: boolean;
}) {
  const [vistaInt, setVistaInt] = useState<Vista>("CALL");
  const vista = vistaControlada ?? vistaInt;

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
        {!hideFilter && (
          <>
            <FilterBtn active={vista === "CALL"} onClick={() => setVistaInt("CALL")}>
              CALL
            </FilterBtn>
            <FilterBtn active={vista === "PUT"} onClick={() => setVistaInt("PUT")}>
              PUT
            </FilterBtn>
          </>
        )}
        <TableHelp entries={OPCIONES_GLOSSARY} />
        <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">
          {filtered.length} · ordenado por VOL ↓
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
          SIN DATOS — MERCADO CERRADO
        </p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
              <tr className="text-[var(--t-text-muted)]">
                <th className="!px-1 text-right">STRIKE</th>
                <th className="!px-1 text-right">LAST</th>
                <th className="!px-1 text-right">INTRA</th>
                <th className="!px-1 text-right">1D</th>
                <th className="!px-1 text-right">SPREAD PUNTAS</th>
                <th className="!px-1 text-right">IV</th>
                <th className="!px-1 text-right">DELTA</th>
                <th className="!px-1 text-right">GAMMA</th>
                <th className="!px-1 text-right">THETA</th>
                <th className="!px-1 text-right">VEGA</th>
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
                        ? "bg-[var(--t-accent)]/15"
                        : onSelect
                        ? "hover:bg-[var(--t-border)]"
                        : ""
                    }`}
                    title={onSelect ? "Click para ver costo histórico" : undefined}
                  >
                    <td
                      className={`!px-1 text-right ${
                        itm ? "text-[var(--t-accent)] font-semibold" : "text-[var(--t-accent)]"
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
                          ? "text-[var(--t-text-muted)]"
                          : intraday >= 0
                          ? "text-[var(--t-pos)]"
                          : "text-[var(--t-neg)]"
                      }`}
                    >
                      {intraday !== null
                        ? `${intraday >= 0 ? "+" : ""}${intraday.toFixed(2)}%`
                        : "--"}
                    </td>
                    <td
                      className={`!px-1 text-right ${
                        vs1d === null
                          ? "text-[var(--t-text-muted)]"
                          : vs1d >= 0
                          ? "text-[var(--t-pos)]"
                          : "text-[var(--t-neg)]"
                      }`}
                    >
                      {vs1d !== null
                        ? `${vs1d >= 0 ? "+" : ""}${vs1d.toFixed(2)}%`
                        : "--"}
                    </td>
                    <td className="!px-1 text-right text-[var(--t-text)]">
                      {spreadPct !== null ? `${spreadPct.toFixed(1)}%` : "--"}
                    </td>
                    <td className="!px-1 text-right text-[var(--t-text)]">
                      {r.iv !== undefined ? `${(r.iv * 100).toFixed(1)}%` : "--"}
                    </td>
                    <td className="!px-1 text-right text-[var(--t-text-dim)]">
                      {r.delta !== undefined ? r.delta.toFixed(3) : "--"}
                    </td>
                    <td className="!px-1 text-right text-[var(--t-text-dim)]">
                      {r.gamma !== undefined ? r.gamma.toFixed(4) : "--"}
                    </td>
                    <td className="!px-1 text-right text-[var(--t-text-dim)]">
                      {r.theta !== undefined ? r.theta.toFixed(2) : "--"}
                    </td>
                    <td className="!px-1 text-right text-[var(--t-text-dim)]">
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
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
