"use client";

// Gráfico de barras ÚNICO de /operaciones (OPERACIONES · ARANCELES · AGRO).
// Fuente de verdad del toolbar: DIARIO/SEMANAL/MENSUAL + rango (1W…ALL) +
// ◀▶ período + Foco día + maximizar. La serie SIEMPRE llega DIARIA; este
// componente agrega/filtra en el cliente (los toggles no refetchean).
//
// Soporta 1 serie (ops/aranceles) o multi-serie (agro: SOJA/TRIGO/MAIZ).
// Renderiza el panel completo (header + chart + overlay maximizado) para ser
// drop-in dentro de la celda del grid de cada vista.

import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export type Agg = "DIARIO" | "SEMANAL" | "MENSUAL";
type RangoKey = "1W" | "1M" | "3M" | "YTD" | "1A" | "ALL";
export type SerieDef = { key: string; label: string; color: string };
export type SerieRow = { fecha: string; [k: string]: number | string };
type ChartRow = { key: string; x: string; [k: string]: number | string };

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MUTED = "var(--t-border-2)";

const fmtFechaCorta = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y.slice(-2)}`; };
const fmtMesCorto = (s: string) => { const [y, m] = s.split("-").map(Number); return `${MESES[m - 1]} ${String(y).slice(-2)}`; };

function lunesDeSemana(fecha: string): string {
  const d = new Date(fecha + "T00:00:00Z"); const dow = d.getUTCDay(); const off = dow === 0 ? -6 : 1 - dow;
  return new Date(d.getTime() + off * 86400000).toISOString().slice(0, 10);
}
function bucketKey(fecha: string, agg: Agg): string {
  return agg === "MENSUAL" ? fecha.slice(0, 7) : agg === "SEMANAL" ? lunesDeSemana(fecha) : fecha;
}
function bucketLabel(key: string, agg: Agg): string {
  return agg === "MENSUAL" ? fmtMesCorto(key) : fmtFechaCorta(key);
}
function filtrarRango(serie: SerieRow[], rango: RangoKey, offset: number): SerieRow[] {
  if (rango === "ALL" || !serie.length) return serie;
  if (rango === "YTD") {
    const yyyy = new Date().getFullYear() - offset;
    return serie.filter((s) => s.fecha.startsWith(`${yyyy}-`));
  }
  const n = rango === "1W" ? 5 : rango === "1M" ? 22 : rango === "3M" ? 65 : 252;
  const end = serie.length - offset * n;
  return serie.slice(Math.max(0, end - n), Math.max(0, end));
}
function aggSerie(serie: SerieRow[], keys: string[], agg: Agg): ChartRow[] {
  const m = new Map<string, Record<string, number>>();
  for (const p of serie) {
    const k = bucketKey(p.fecha, agg);
    const cur = m.get(k) ?? Object.fromEntries(keys.map((kk) => [kk, 0]));
    for (const kk of keys) cur[kk] += Number(p[kk] ?? 0);
    m.set(k, cur);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ key: k, x: bucketLabel(k, agg), ...v }));
}

export function OpsBarChart({
  serie, series, fmt, unidad, focoFecha = null, defaultAgg = "DIARIO", onAllSelected, titulo,
  soloMensual = false,
}: {
  serie: SerieRow[];
  series: SerieDef[];
  fmt: (n: number) => string;
  unidad: string;            // sufijo para tooltip/header: "ARS" | "USD" | "toneladas"
  focoFecha?: string | null; // día seleccionado (modo DIA) → resaltar; null = sin foco
  defaultAgg?: Agg;
  onAllSelected?: () => void; // se llama al elegir "ALL" (vistas con serie acotada → traen historia completa)
  titulo?: string;           // título del header (default "Volumen operado")
  soloMensual?: boolean;     // fuerza MENSUAL y oculta toggles agg/rango/foco + total (modo share)
}) {
  const [agg, setAgg] = useState<Agg>(defaultAgg);
  const [rango, setRango] = useState<RangoKey>("YTD");
  const [rangoOffset, setRangoOffset] = useState(0);
  const [focoDia, setFocoDia] = useState(false);
  const [maxi, setMaxi] = useState(false);

  // En modo share el dato es mensual y todo el histórico: sin agregación ni rango.
  const effAgg: Agg = soloMensual ? "MENSUAL" : agg;
  const effSerie = soloMensual ? serie : filtrarRango(serie, rango, rangoOffset);

  const keys = series.map((s) => s.key);
  const keySig = keys.join("|");
  const chartData = useMemo(
    () => aggSerie(effSerie, keys, effAgg),
    [effSerie, effAgg, keySig], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const totalPeriodo = useMemo(
    () => chartData.reduce((a, p) => a + keys.reduce((s, k) => s + Number(p[k] ?? 0), 0), 0),
    [chartData, keySig], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const focoKey = focoDia && focoFecha ? bucketKey(focoFecha, effAgg) : null;
  const multi = series.length > 1;

  const Chart = (
    <BarChart data={chartData} margin={{ top: 6, right: 10, left: 6, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
      <XAxis dataKey="x" tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} />
      <YAxis tickFormatter={fmt} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={52}
        domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} />
      <Tooltip formatter={(v, n) => multi ? [`${fmt(Number(v))} ${unidad}`, String(n)] : `${fmt(Number(v))} ${unidad}`}
        contentStyle={{ fontSize: 11, background: "var(--t-panel)", border: "1px solid var(--t-border)" }}
        labelStyle={{ color: "var(--t-text)" }}
        cursor={{ fill: "var(--t-border)", opacity: 0.3 }} />
      {multi && <Legend wrapperStyle={{ fontSize: 9, color: "var(--t-text-dim)" }} />}
      {series.map((s) => (
        // `fill` en el Bar (además del Cell) → la leyenda y el tooltip toman el
        // color de la serie; los Cells lo overridean por-barra para el foco día.
        <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} isAnimationActive={false} maxBarSize={64}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={focoKey && d.key !== focoKey ? MUTED : s.color} />
          ))}
        </Bar>
      ))}
    </BarChart>
  );

  const chartHeader = (
    <div className="flex items-center flex-wrap gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
      <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)] truncate max-w-[260px]" title={titulo ?? "Volumen operado"}>{titulo ?? "Volumen operado"} · {unidad}</span>
      {chartData.length > 0 && <span className="text-[9px] font-mono text-[var(--t-text-muted)]">{chartData[0].x} → {chartData[chartData.length - 1].x}</span>}
      {!soloMensual && (
        <span className="text-[10px] font-mono"><span className="text-[var(--t-text-muted)] uppercase tracking-wider">Total período: </span><span className="text-[var(--t-accent)] font-semibold">{fmt(totalPeriodo)} {unidad === "toneladas" ? "t" : ""}</span></span>
      )}
      {!soloMensual && (
        <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["DIARIO","SEMANAL","MENSUAL"] as Agg[]).map((k) => (
            <button key={k} onClick={() => setAgg(k)} className={"px-2 py-0.5 text-[9px] uppercase tracking-wider " + (agg === k ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{k}</button>
          ))}
        </div>
      )}
      {!soloMensual && <button onClick={() => setRangoOffset((o) => o + 1)} className="px-1 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)]" title="Período anterior">◀</button>}
      {!soloMensual && (
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["1W","1M","3M","YTD","1A","ALL"] as RangoKey[]).map((k) => (
            <button key={k} onClick={() => { setRango(k); setRangoOffset(0); if (k === "ALL") onAllSelected?.(); }} className={"px-2 py-0.5 text-[9px] uppercase tracking-wider " + (rango === k ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{k}</button>
          ))}
        </div>
      )}
      {!soloMensual && <button onClick={() => setRangoOffset((o) => Math.max(0, o - 1))} disabled={rangoOffset === 0} className="px-1 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] disabled:opacity-30" title="Período siguiente">▶</button>}
      {!soloMensual && <button onClick={() => setFocoDia((v) => !v)} className={"px-2 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--t-border-2)] " + (focoDia ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>Foco día {focoDia ? "✓" : "○"}</button>}
      <button onClick={() => setMaxi((v) => !v)} className={(soloMensual ? "ml-auto " : "") + "px-2 py-0.5 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"} title="Maximizar gráfico">⤢</button>
    </div>
  );

  return (
    <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden h-full">
      {chartHeader}
      <div className="flex-1 min-h-0 p-2 wm-corner"><ResponsiveContainer width="100%" height="100%">{Chart}</ResponsiveContainer></div>

      {maxi && (
        <div className="fixed inset-0 z-50 bg-[var(--t-bg)]/95 flex flex-col p-4">
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col flex-1 min-h-0 overflow-hidden">
            {chartHeader}
            <div className="flex-1 min-h-0 p-2 wm-corner"><ResponsiveContainer width="100%" height="100%">{Chart}</ResponsiveContainer></div>
          </div>
        </div>
      )}
    </div>
  );
}
