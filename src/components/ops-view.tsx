"use client";

// OPERACIONES → MOVIMIENTOS sobre CashFlow.Operaciones.
// Izq 50%: arriba Σbruto por operacion, abajo gráfico Σbruto por fecha (rango +
// agregación + foco día + maximizar). Der 50%: Σbruto por denominacion.
// Interactivo: elegir una operacion o una denominacion filtra la otra tabla + el
// gráfico. Excluye los "Cierre" (server-side). Filtro de moneda (campo `moneda`).

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Moneda = "ARS" | "USD";
type Modo = "ULTIMA" | "DIA" | "TODOS";
type Agg = "DIARIO" | "SEMANAL" | "MENSUAL";
type RangoKey = "1W" | "1M" | "3M" | "YTD" | "1A" | "ALL";

type FechaRow = { fecha: string; n: number };
type SerieRow = { fecha: string; bruto: number };
type OpRow = { operacion: string; bruto: number; n: number };
type DenomRow = { denominacion: string; bruto: number; n: number };
type Meta = { n_boletos: number; ultima_ingesta: string | null };

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MUTED = "var(--t-border-2)";

function fmtCompact(n: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n), sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + "k";
  return sign + abs.toFixed(0);
}
const fmtFechaDisplay = (s: string) => { const [y,m,d] = s.split("-").map(Number); return `${d} ${MESES[m-1]} ${y}`; };
const fmtFechaCorta = (s: string) => { const [y,m,d] = s.split("-"); return `${d}/${m}/${y.slice(-2)}`; };
const fmtMesCorto = (s: string) => { const [y,m] = s.split("-").map(Number); return `${MESES[m-1]} ${String(y).slice(-2)}`; };
function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try { return new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(11, 19) + " ART"; }
  catch { return "—"; }
}
function lunesDeSemana(fecha: string): string {
  const d = new Date(fecha + "T00:00:00Z"); const dow = d.getUTCDay(); const off = dow === 0 ? -6 : 1 - dow;
  return new Date(d.getTime() + off * 86400000).toISOString().slice(0, 10);
}
function bucketKey(fecha: string, agg: Agg): string {
  return agg === "MENSUAL" ? fecha.slice(0, 7) : agg === "SEMANAL" ? lunesDeSemana(fecha) : fecha;
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
function aggSerie(serie: SerieRow[], agg: Agg): { key: string; x: string; bruto: number }[] {
  const m = new Map<string, number>();
  for (const p of serie) { const k = bucketKey(p.fecha, agg); m.set(k, (m.get(k) ?? 0) + p.bruto); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ key: k, x: agg === "MENSUAL" ? fmtMesCorto(k) : fmtFechaCorta(k), bruto: v }));
}
async function getJSON<T>(url: string): Promise<T | null> {
  try { const r = await fetch(url, { cache: "no-store" }); return r.ok ? (await r.json()) as T : null; }
  catch { return null; }
}

export function OpsView() {
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [modo, setModo] = useState<Modo>("ULTIMA");
  const [agg, setAgg] = useState<Agg>("DIARIO");
  const [rango, setRango] = useState<RangoKey>("YTD");
  const [rangoOffset, setRangoOffset] = useState(0);
  const [focoDia, setFocoDia] = useState(false);
  const [maxi, setMaxi] = useState(false);
  const [fechas, setFechas] = useState<FechaRow[]>([]);
  const [idx, setIdx] = useState(0);
  const [selOp, setSelOp] = useState<string | null>(null);
  const [selDenom, setSelDenom] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [serie, setSerie] = useState<SerieRow[]>([]);
  const [porOp, setPorOp] = useState<OpRow[]>([]);
  const [porDenom, setPorDenom] = useState<DenomRow[]>([]);
  const [total, setTotal] = useState(0);

  const fechasAsc = useMemo(() => [...fechas].map((f) => f.fecha).sort(), [fechas]);
  const fecha = fechas[idx]?.fecha ?? "";
  const rangoFecha = useMemo(() => {
    if (!fechas.length) return { desde: "", hasta: "" };
    if (modo === "TODOS") return { desde: fechas[fechas.length - 1].fecha, hasta: fechas[0].fecha };
    return { desde: fecha, hasta: fecha };
  }, [modo, fecha, fechas]);

  const selQS = (selOp ? `&operacion=${encodeURIComponent(selOp)}` : "")
    + (selDenom ? `&denominacion=${encodeURIComponent(selDenom)}` : "");

  const cargarFechas = useCallback(async () => {
    const f = await getJSON<{ fechas: FechaRow[] }>("/api/operaciones/ops/fechas");
    setFechas(f?.fechas ?? []); setIdx(0);
  }, []);
  useEffect(() => { cargarFechas(); }, [cargarFechas]);
  useEffect(() => { if (modo === "ULTIMA") setIdx(0); }, [modo]);

  // Gráfico: serie por fecha (depende de moneda + selección cruzada).
  useEffect(() => {
    (async () => {
      const d = await getJSON<{ serie: SerieRow[] }>(`/api/operaciones/ops/serie?moneda=${moneda}${selQS}`);
      setSerie(d?.serie ?? []);
    })();
  }, [moneda, selQS]);

  // Meta + resumen (cross-filter) para el scope.
  useEffect(() => {
    if (!fechas.length) return;
    (async () => {
      const [mt, rs] = await Promise.all([
        modo === "TODOS" ? Promise.resolve(null)
          : getJSON<{ meta: Meta }>(`/api/operaciones/ops/meta?fecha=${fecha}`),
        getJSON<{ por_operacion: OpRow[]; por_denominacion: DenomRow[]; total: number }>(
          `/api/operaciones/ops/resumen?moneda=${moneda}&desde=${rangoFecha.desde}&hasta=${rangoFecha.hasta}${selQS}`,
        ),
      ]);
      setMeta(mt?.meta ?? null);
      setPorOp(rs?.por_operacion ?? []);
      setPorDenom(rs?.por_denominacion ?? []);
      setTotal(rs?.total ?? 0);
    })();
  }, [modo, fecha, moneda, rangoFecha.desde, rangoFecha.hasta, selQS, fechas.length]);

  const chartData = useMemo(() => aggSerie(filtrarRango(serie, rango, rangoOffset), agg), [serie, rango, rangoOffset, agg]);
  const totalPeriodo = useMemo(() => chartData.reduce((a, p) => a + p.bruto, 0), [chartData]);
  const focoKey = modo === "DIA" && focoDia && fecha ? bucketKey(fecha, agg) : null;

  const pickFecha = (picked: string) => {
    if (!picked) return;
    const snap = fechasAsc.includes(picked) ? picked : (fechasAsc.find((f) => f >= picked) ?? fechasAsc[fechasAsc.length - 1]);
    if (snap) { setModo("DIA"); setIdx(fechas.findIndex((f) => f.fecha === snap)); }
  };

  const Chart = (
    <BarChart data={chartData} margin={{ top: 6, right: 10, left: 6, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
      <XAxis dataKey="x" tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} />
      <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={48} />
      <Tooltip formatter={(v) => `${fmtCompact(Number(v))} ${moneda}`}
        contentStyle={{ fontSize: 11, background: "var(--t-panel)", border: "1px solid var(--t-border)" }} />
      <Bar dataKey="bruto" name="Bruto" isAnimationActive={false}>
        {chartData.map((d, i) => (
          <Cell key={i} fill={focoKey && d.key !== focoKey ? MUTED : "var(--t-brand)"} />
        ))}
      </Bar>
    </BarChart>
  );

  const chartHeader = (
    <div className="flex items-center flex-wrap gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
      <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Volumen operado · {moneda}</span>
      {chartData.length > 0 && <span className="text-[9px] font-mono text-[var(--t-text-muted)]">{chartData[0].x} → {chartData[chartData.length - 1].x}</span>}
      <span className="text-[10px] font-mono"><span className="text-[var(--t-text-muted)] uppercase tracking-wider">Total período: </span><span className="text-[var(--t-accent)] font-semibold">{fmtCompact(totalPeriodo)}</span></span>
      <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
        {(["DIARIO","SEMANAL","MENSUAL"] as Agg[]).map((k) => (
          <button key={k} onClick={() => setAgg(k)} className={"px-2 py-0.5 text-[9px] uppercase tracking-wider " + (agg === k ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{k}</button>
        ))}
      </div>
      <button onClick={() => setRangoOffset((o) => o + 1)} className="px-1 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)]" title="Período anterior">◀</button>
      <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
        {(["1W","1M","3M","YTD","1A","ALL"] as RangoKey[]).map((k) => (
          <button key={k} onClick={() => { setRango(k); setRangoOffset(0); }} className={"px-2 py-0.5 text-[9px] uppercase tracking-wider " + (rango === k ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{k}</button>
        ))}
      </div>
      <button onClick={() => setRangoOffset((o) => Math.max(0, o - 1))} disabled={rangoOffset === 0} className="px-1 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)] disabled:opacity-30" title="Período siguiente">▶</button>
      <button onClick={() => setFocoDia((v) => !v)} className={"px-2 py-0.5 text-[9px] uppercase tracking-wider border border-[var(--t-border-2)] " + (focoDia ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>Foco día {focoDia ? "✓" : "○"}</button>
      <button onClick={() => setMaxi((v) => !v)} className="px-2 py-0.5 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]" title="Maximizar gráfico">⤢</button>
    </div>
  );

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* ── Filtros ───────────────────────────────────────────── */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          <button onClick={() => { setModo("DIA"); setIdx((i) => Math.min(i + 1, fechas.length - 1)); }} disabled={idx >= fechas.length - 1} className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">‹</button>
          <input type="date" value={fecha} min={fechasAsc[0] || undefined} max={fechasAsc[fechasAsc.length - 1] || undefined}
            disabled={!fechas.length} onChange={(e) => pickFecha(e.target.value)}
            className="bg-[var(--t-panel)] px-2 py-0.5 text-[12px] font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
          <button onClick={() => { setModo("DIA"); setIdx((i) => Math.max(i - 1, 0)); }} disabled={idx <= 0} className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">›</button>
        </div>
        {(["ULTIMA","DIA","TODOS"] as Modo[]).map((m) => (
          <Pill key={m} active={modo === m} onClick={() => setModo(m)}>{m}</Pill>
        ))}
        <span className="font-mono text-[12px] text-[var(--t-accent)] mx-1">
          {modo === "TODOS" ? `${fmtFechaCorta(rangoFecha.desde)} → ${fmtFechaCorta(rangoFecha.hasta)}` : (fecha ? fmtFechaDisplay(fecha) : "—")}
        </span>
        <span className="text-[#333]">│</span>
        {meta && modo !== "TODOS" && (
          <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wider">
            Boletos: <span className="text-[var(--t-text)] font-mono">{meta.n_boletos}</span>
            {meta.ultima_ingesta && <> · Últ. ingesta: <span className="text-[var(--t-text)] font-mono">{formatTime(meta.ultima_ingesta)}</span></>}
          </span>
        )}
        {(selOp || selDenom) && (
          <button onClick={() => { setSelOp(null); setSelDenom(null); }} className="text-[10px] text-[var(--t-accent)] border border-[var(--t-accent)] px-2 py-0.5">✕ filtro: {selOp || selDenom}</button>
        )}
        <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["ARS","USD"] as Moneda[]).map((m) => (
            <button key={m} onClick={() => setMoneda(m)} className={"px-3 py-0.5 text-[10px] uppercase tracking-wider " + (moneda === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{m}</button>
          ))}
        </div>
        <button onClick={() => cargarFechas()} className="border border-[var(--t-border-2)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--t-text-dim)] hover:text-[var(--t-accent)]">↻ Refresh</button>
      </div>

      {/* ── Cuerpo 50/50 ──────────────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* IZQUIERDA */}
        <div className="min-h-0 grid grid-rows-2 gap-3 overflow-hidden">
          {/* Σ por operacion */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por operación</span>
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">Σ {fmtCompact(total)} {moneda}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <tbody>
                  {porOp.map((r) => {
                    const act = selOp === r.operacion;
                    return (
                      <tr key={r.operacion} onClick={() => { setSelOp(act ? null : r.operacion); setSelDenom(null); }}
                        className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]" : "hover:bg-[var(--t-surface-2)]")}>
                        <td className="px-3 py-1">{r.operacion}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.bruto)}</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)] w-12">{total ? ((r.bruto / total) * 100).toFixed(0) : "0"}%</td>
                      </tr>
                    );
                  })}
                  {!porOp.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {/* Gráfico */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            {chartHeader}
            <div className="flex-1 min-h-0 p-2"><ResponsiveContainer width="100%" height="100%">{Chart}</ResponsiveContainer></div>
          </div>
        </div>

        {/* DERECHA: por denominacion (sin título repetido — solo el thead) */}
        <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-accent)]/10 text-[9px] uppercase tracking-widest text-[var(--t-accent)]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Denominación</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Σ Bruto</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                </tr>
              </thead>
              <tbody>
                {porDenom.map((r) => {
                  const act = selDenom === r.denominacion;
                  return (
                    <tr key={r.denominacion} onClick={() => { setSelDenom(act ? null : r.denominacion); setSelOp(null); }}
                      className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15 text-[var(--t-accent)]" : "hover:bg-[var(--t-surface-2)]")}>
                      <td className="px-3 py-1 truncate max-w-[320px]" title={r.denominacion}>{r.denominacion}</td>
                      <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.bruto)}</td>
                      <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                    </tr>
                  );
                })}
                {!porDenom.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Gráfico maximizado ────────────────────────────────── */}
      {maxi && (
        <div className="fixed inset-0 z-50 bg-[var(--t-bg)]/95 flex flex-col p-4">
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col flex-1 min-h-0 overflow-hidden">
            {chartHeader}
            <div className="flex-1 min-h-0 p-2"><ResponsiveContainer width="100%" height="100%">{Chart}</ResponsiveContainer></div>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={"px-2 py-0.5 border text-[11px] font-semibold " + (active ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]")}>
      {children}
    </button>
  );
}
