"use client";

import { fmtVol } from "./ui";
import { CATEGORIAS, type EstrategiaRow } from "@/lib/estrategias";

interface Props {
  rows: EstrategiaRow[];
  liquidStrikes: number[];
  atmStrike: number | null;
  strike: number | null;
  setStrike: (k: number) => void;
  categoria: string;
  setCategoria: (c: string) => void;
  selected: number;
  setSelected: (i: number) => void;
}

export function EstrategiasTabla({
  rows,
  liquidStrikes,
  atmStrike,
  strike,
  setStrike,
  categoria,
  setCategoria,
  selected,
  setSelected,
}: Props) {
  if (!liquidStrikes.length) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
        Sin strikes con liquidez.
      </p>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 gap-1">
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <label className="text-[10px] text-[var(--t-text-dim)]">
          STRIKE
          <select
            value={strike ?? atmStrike ?? ""}
            onChange={(e) => setStrike(Number(e.target.value))}
            className="ml-1 bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-1 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none"
          >
            {liquidStrikes.map((k) => (
              <option key={k} value={k}>
                {k.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                {k === atmStrike ? " ← ATM" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] text-[var(--t-text-dim)]">
          TIPO
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="ml-1 bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-1 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none"
          >
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">
          {rows.length} variantes
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
            <tr className="text-[var(--t-text-muted)]">
              <th className="!px-1 text-left">ESTRATEGIA</th>
              <th className="!px-1 text-center">STRIKES</th>
              <th className="!px-1 text-right">COSTO</th>
              <th className="!px-1 text-right">VOL</th>
              <th className="!px-1 text-right">Δ</th>
              <th className="!px-1 text-right">Γ</th>
              <th className="!px-1 text-right">Θ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isSel = i === selected;
              const costoClass =
                r.costo === null
                  ? "text-[var(--t-text-muted)]"
                  : r.costo > 0
                  ? "text-[#ff4444] font-semibold"
                  : "text-[#00cc66] font-semibold";
              return (
                <tr
                  key={r.nombre}
                  onClick={() => setSelected(i)}
                  className={`cursor-pointer ${
                    isSel
                      ? "bg-[var(--t-accent)]/15 outline outline-1 outline-[var(--t-accent)]/50"
                      : "hover:bg-[var(--t-border)]"
                  }`}
                >
                  <td className="!px-1 text-[var(--t-text)]">{r.nombre}</td>
                  <td className="!px-1 text-center text-[var(--t-text-dim)]">
                    {r.strikes}
                  </td>
                  <td className={`!px-1 text-right ${costoClass}`}>
                    {r.costo === null ? "Sin Liq" : `$${r.costo.toFixed(2)}`}
                  </td>
                  <td className="!px-1 text-right text-[#ffaa00]">
                    {fmtVol(r.volPata ?? undefined)}
                  </td>
                  <td className="!px-1 text-right text-[var(--t-text-dim)]">
                    {r.delta !== null ? r.delta.toFixed(2) : "--"}
                  </td>
                  <td className="!px-1 text-right text-[var(--t-text-dim)]">
                    {r.gamma !== null ? r.gamma.toFixed(3) : "--"}
                  </td>
                  <td className="!px-1 text-right text-[var(--t-text-dim)]">
                    {r.theta !== null ? r.theta.toFixed(2) : "--"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
