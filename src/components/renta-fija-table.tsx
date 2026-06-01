"use client";

import { useState } from "react";
import type { FlujoTicker, RentaFijaDoc } from "@/lib/types";
import { shortTicker, fmtPrice, fmtVol } from "./ui";
import { LibroPanel } from "./libro-panel";

interface ForwardDoc {
  curva: string;
  tasas?: Record<string, number>;
}

// ISO YYYY-MM-DD → "DD/MM/YY" (corto para entrar en la columna).
function fmtMatur(iso: string | null | undefined): string {
  if (!iso) return "--";
  const s = iso.slice(0, 10);
  if (s.length !== 10 || s[4] !== "-" || s[7] !== "-") return s;
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(2, 4)}`;
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
  const [vista, setVista] = useState<
    "tasa_fija" | "cer" | "soberanos" | "dolar_linked" | "libro"
  >("tasa_fija");
  const curva = vista === "libro" ? "tasa_fija" : vista;

  const tickerCurvaMap: Record<string, string> = {};
  const tickerVtoMap: Record<string, string> = {};
  const tickerFlujoVtoMap: Record<string, number> = {};
  const tickerFijadoSet = new Set<string>();
  for (const f of flujos) {
    // curva_efectiva mueve los CER fijados a tasa_fija; si no viene
    // (backend viejo) caemos a la curva original.
    tickerCurvaMap[f.ticker] = f.curva_efectiva ?? f.curva;
    if (f.fecha_vencimiento) tickerVtoMap[f.ticker] = f.fecha_vencimiento;
    if (f.flujo_vencimiento != null) tickerFlujoVtoMap[f.ticker] = f.flujo_vencimiento;
    if (f.cer_fijado) tickerFijadoSet.add(f.ticker);
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
    .sort((a, b) => {
      // Bonos sin duration al final (ej. tickers nuevos sin enrich todavía).
      const da = a.metrics?.duration ?? Infinity;
      const db = b.metrics?.duration ?? Infinity;
      return da - db;
    });

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
          HARD DOLAR
        </FilterBtn>
        <FilterBtn active={vista === "dolar_linked"} onClick={() => setVista("dolar_linked")}>
          DOLAR LINKED
        </FilterBtn>
        <FilterBtn active={vista === "libro"} onClick={() => setVista("libro")}>
          LIBRO
        </FilterBtn>
      </div>

      {vista === "libro" ? (
        <LibroPanel data={data} />
      ) : sorted.length > 0 ? (
        // Sin overflow propio: el componente Panel padre ya scrolea
        // (overflow-y-auto en su content). El wrapper antiguo con altura
        // fija h-[380px] generaba doble scrollbar — pasa más visible en
        // CER que tiene más filas que tasa_fija.
        <div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="!px-1 text-center">Ticker</th>
                <th className="!px-1 text-center">Matur.</th>
                <th className="!px-1 text-center">LAST</th>
                <th className="!px-1 text-center">Intra</th>
                <th className="!px-1 text-center">1D</th>
                <th
                  className="!px-1 text-center"
                  title={curva === "tasa_fija" ? "Pago al vencimiento por 100 VN (bullet)" : undefined}
                >
                  {curva === "tasa_fija" ? "Pago Final" : "VWAP"}
                </th>
                <th className="!px-1 text-center">TNA</th>
                <th className="!px-1 text-center">TEA</th>
                {curva === "tasa_fija" && (
                  <th className="!px-1 text-center">TEM</th>
                )}
                <th className="!px-1 text-center">DUR</th>
                <th className="!px-1 text-center">MOD DUR</th>
                <th className="!px-1 text-center">CONVEX.</th>
                {curva === "tasa_fija" && (
                  <th className="!px-1 text-center">TC BE</th>
                )}
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
                const tna =
                  tea !== undefined
                    ? (Math.pow(1 + tea, 1 / 12) - 1) * 12 * 100
                    : null;

                return (
                  <tr key={r.instrumento}>
                    <td className="!px-1 text-[var(--t-accent)]">
                      {short}
                      {tickerFijadoSet.has(short) && (
                        <span
                          className="ml-1 text-[8px] text-[var(--t-pos)] font-semibold"
                          title="CER de liquidación ya publicado por BCRA — se comporta como tasa fija"
                        >
                          FIJ
                        </span>
                      )}
                    </td>
                    <td className="!px-1 text-center text-[var(--t-text-dim)] tabular-nums">
                      {fmtMatur(tickerVtoMap[short])}
                    </td>
                    <td className="!px-1 text-right font-semibold">
                      {fmtPrice(last)}
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
                    <td className="!px-1 text-right text-[var(--t-text-dim)]">
                      {curva === "tasa_fija"
                        ? fmtPrice(tickerFlujoVtoMap[short])
                        : fmtPrice(r.metrics?.vwap)}
                    </td>
                    <td className="!px-1 text-right text-[var(--t-text)]">
                      {tna !== null ? `${tna.toFixed(1)}%` : "--"}
                    </td>
                    <td className="!px-1 text-right text-[var(--t-text)]">
                      {tea !== undefined ? `${(tea * 100).toFixed(1)}%` : "--"}
                    </td>
                    {curva === "tasa_fija" && (
                      <td className="!px-1 text-right text-[var(--t-text)]">
                        {tem !== null ? `${tem.toFixed(2)}%` : "--"}
                      </td>
                    )}
                    <td className="!px-1 text-right text-[var(--t-text)]">
                      {r.metrics?.duration !== undefined
                        ? r.metrics.duration.toFixed(2)
                        : "--"}
                    </td>
                    <td className="!px-1 text-right text-[var(--t-text)]">
                      {r.metrics?.mod_duration !== undefined
                        ? r.metrics.mod_duration.toFixed(2)
                        : "--"}
                    </td>
                    <td className="!px-1 text-right text-[var(--t-text)]">
                      {r.metrics?.convexity !== undefined
                        ? r.metrics.convexity.toFixed(2)
                        : "--"}
                    </td>
                    {curva === "tasa_fija" && (
                      <td className="!px-1 text-right text-[#ffcc00] font-semibold tabular-nums">
                        {r.metrics?.tc_breakeven != null
                          ? Math.round(r.metrics.tc_breakeven).toLocaleString("es-AR")
                          : "--"}
                      </td>
                    )}
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
        <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
          SIN DATOS — MERCADO CERRADO
        </p>
      )}

      {vista !== "libro" && (
        <div className="mt-1 text-[10px] text-[var(--t-text-muted)] text-right">
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
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
