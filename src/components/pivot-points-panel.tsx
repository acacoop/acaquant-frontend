"use client";

import { useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { TableHelp } from "./help-tooltip";
import type { PivotData, PivotFrame } from "@/lib/types-scanner";

/**
 * PIVOTS del ADR — la ventana PIVOTS de TRADING → MONITOR (renta variable).
 *
 * Es el panel ZONAS que vivía en /renta-variable hasta el refactor 2026-09-10,
 * sin la tab VOLATILIDAD & BETA (se borró con `/api/scanner/quant`). Por
 * timeframe (DIARIO / SEMANAL / MENSUAL / ANUAL) muestra el máximo, mínimo y
 * cierre del período PREVIO cerrado y los 7 niveles Floor Trader (R3…S3) con la
 * distancia al último precio.
 *
 * ⚠️ Todo en USD del SUBYACENTE (`GET /api/scanner/pivot/{ticker}` resuelve
 * YPFD → YPF y lee `mercado.precios_acciones`). No son los pivots en pesos de
 * la tab PIVOTS de /trading (`/api/trading/pivots`, otro service, otra tabla):
 * los dos conviven y ninguno pisa al otro.
 *
 * El `last` viene pisado con el precio del ADR (Finnhub, ~15') cuando lo hay
 * (`LIVE`) o es el cierre EOD (`EOD`). Se pollea cada 60 s con techo, por
 * `usePoll`: los niveles no cambian intradía, el `last` un par de veces por
 * rueda.
 */

const GLOSARIO = [
  { label: "ZONAS",              text: "Pivot Points (Floor Trader). Niveles de soporte/resistencia calculados sobre el máximo, mínimo y cierre del período PREVIO cerrado. Si el precio supera R1, probable continuación; toca y rebota, posible reversión." },
  { label: "vs LAST",            text: "Distancia % de la zona al precio actual: (zona / last − 1) × 100. Positivo = la zona está ARRIBA del precio (target alcista / resistencia por romper). Negativo = la zona está ABAJO (soporte para defender / objetivo bajista)." },
  { label: "DIARIO/SEM/MES/AÑO", text: "Período del que se sacan máximo / mínimo / cierre. Diario = día hábil anterior. Semanal = lun-vie pasados. Mensual = mes calendario previo. Anual = año calendario previo." },
  { label: "R1/R2/R3",           text: "Resistencias arriba del PP. Niveles donde un precio en suba tiende a frenar." },
  { label: "PP",                 text: "Pivot Point = (H + L + C) / 3 del período previo. Eje del movimiento esperado." },
  { label: "S1/S2/S3",           text: "Soportes abajo del PP. Niveles donde un precio en baja tiende a rebotar." },
];

type SubTab = "diario" | "semanal" | "mensual" | "anual";

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: "diario",  label: "DIARIO"  },
  { key: "semanal", label: "SEMANAL" },
  { key: "mensual", label: "MENSUAL" },
  { key: "anual",   label: "ANUAL"   },
];

const POLL_MS = 60_000;

export function PivotPointsPanel({ ticker }: { ticker: string }) {
  const [subTab, setSubTab] = useState<SubTab>("diario");
  const { data: pivot, lastAt, error } = usePoll<PivotData | null>(
    `/api/scanner/pivot/${encodeURIComponent(ticker)}`,
    null,
    POLL_MS,
    { fetchOnMount: true },
  );

  return (
    <div className="h-full flex flex-col min-h-0 text-[10px]">
      <div className="flex items-center flex-wrap gap-1 mb-2 shrink-0">
        {SUB_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
              subTab === key
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}
          >
            {label}
          </button>
        ))}
        <TableHelp entries={GLOSARIO} />
        <span className="ml-auto text-[var(--t-text-dim)]">
          last{" "}
          <span className="text-[var(--t-text)] font-mono">
            {pivot?.last != null ? `$${pivot.last.toFixed(2)}` : "--"}
          </span>
          {pivot?.last_source === "live" && (
            <span className="ml-1 text-[8px] text-[var(--t-pos)] tracking-widest align-middle">LIVE</span>
          )}
          {pivot?.last_source === "eod" && (
            <span className="ml-1 text-[8px] text-[var(--t-text-muted)] tracking-widest align-middle">EOD</span>
          )}
        </span>
      </div>

      {error && !pivot ? (
        <p className="text-[var(--t-neg)] text-xs py-4 text-center">
          No pude traer los pivots ({error})
        </p>
      ) : lastAt === 0 && !pivot ? (
        <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">Cargando…</p>
      ) : (
        <PivotView
          frame={pivot?.frames[subTab] ?? null}
          last={pivot?.last ?? null}
          tabLabel={subTab}
        />
      )}
    </div>
  );
}

function PivotView({
  frame,
  last,
  tabLabel,
}: {
  frame: PivotFrame | null;
  last: number | null;
  tabLabel: string;
}) {
  if (!frame) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
        Sin data para {tabLabel.toUpperCase()} (probable: ticker arrancó después del rango)
      </p>
    );
  }
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {/* El período previo del que salen los niveles: máximo, mínimo y cierre. */}
      <div className="flex items-center gap-3 px-1 pb-2 font-mono tabular-nums">
        <Dato label="MÁX" value={frame.h} />
        <Dato label="MÍN" value={frame.l} />
        <Dato label="CIERRE" value={frame.c} />
        <span
          className="ml-auto text-[9px] text-[var(--t-text-muted)]"
          title="Período previo cerrado del que salen los niveles (cantidad de velas)"
        >
          {frame.fecha_desde} → {frame.fecha_hasta} · {frame.n_velas} velas
        </span>
      </div>
      <table className="w-full table-fixed">
        <colgroup>
          <col className="w-1/3" />
          <col className="w-1/3" />
          <col className="w-1/3" />
        </colgroup>
        <thead>
          <tr className="text-[var(--t-text-muted)]">
            <th className="!px-1 text-center">NIVEL</th>
            <th className="!px-1 text-center">PRECIO</th>
            <th className="!px-1 text-center">vs LAST</th>
          </tr>
        </thead>
        <tbody>
          <Row label="R3" value={frame.levels.r3} last={last} color="resistance" />
          <Row label="R2" value={frame.levels.r2} last={last} color="resistance" />
          <Row label="R1" value={frame.levels.r1} last={last} color="resistance" />
          <Row label="PP" value={frame.levels.pp} last={last} color="pivot" />
          <Row label="S1" value={frame.levels.s1} last={last} color="support" />
          <Row label="S2" value={frame.levels.s2} last={last} color="support" />
          <Row label="S3" value={frame.levels.s3} last={last} color="support" />
        </tbody>
      </table>
    </div>
  );
}

function Dato({ label, value }: { label: string; value: number }) {
  return (
    <span>
      <span className="text-[9px] text-[var(--t-text-muted)] tracking-wide">{label} </span>
      <span className="text-[var(--t-text)] font-semibold">{value.toFixed(2)}</span>
    </span>
  );
}

function Row({
  label,
  value,
  last,
  color,
}: {
  label: string;
  value: number;
  last: number | null;
  color: "resistance" | "pivot" | "support";
}) {
  // Distancia DE LA ZONA al precio actual. Positivo = zona por arriba del last
  // (target alcista / resistencia por romper). Negativo = zona por abajo
  // (soporte para defender / objetivo bajista).
  const dist = last !== null && last > 0 ? ((value / last) - 1) * 100 : null;
  const labelColor =
    color === "resistance"
      ? "text-[var(--t-neg)]"
      : color === "support"
      ? "text-[var(--t-pos)]"
      : "text-[var(--t-accent)]";
  return (
    <tr>
      <td className={`!px-1 font-semibold text-center ${labelColor}`}>{label}</td>
      <td className="!px-1 text-center tabular-nums font-semibold">
        {value.toFixed(2)}
      </td>
      <td
        className={`!px-1 text-center tabular-nums ${
          dist === null
            ? "text-[var(--t-text-muted)]"
            : dist >= 0
            ? "text-[var(--t-pos)]"
            : "text-[var(--t-neg)]"
        }`}
      >
        {dist !== null ? `${dist >= 0 ? "+" : ""}${dist.toFixed(2)}%` : "--"}
      </td>
    </tr>
  );
}
