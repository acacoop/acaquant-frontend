"use client";

// OPERACIONES → MOVIMIENTOS — vista simple sobre CashFlow.Operaciones.
// Layout: izquierda 50% (arriba Σ bruto por operacion, abajo gráfico Σ bruto por
// fecha) · derecha 50% (tabla Σ bruto por denominacion). Filtro de moneda (campo
// `moneda` del doc). Endpoints: /api/operaciones/ops/{fechas,meta,serie,resumen}.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Moneda = "ARS" | "USD";
type Modo = "ULTIMA" | "DIA" | "TODOS";
type Agg = "DIARIO" | "SEMANAL" | "MENSUAL";

type FechaRow = { fecha: string; n: number };
type SerieRow = { fecha: string; bruto: number };
type OpRow = { operacion: string; bruto: number; n: number };
type DenomRow = { denominacion: string; bruto: number; n: number };
type Meta = { n_boletos: number; ultima_ingesta: string | null };

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtCompact(n: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n), sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + "k";
  return sign + abs.toFixed(0);
}
function fmtFechaDisplay(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${y}`;
}
function fmtFechaCorta(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y.slice(-2)}`;
}
function fmtMesCorto(s: string): string {
  const [y, m] = s.split("-").map(Number);
  return `${MESES[m - 1]} ${String(y).slice(-2)}`;
}
function formatTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    const ar = new Date(new Date(iso).getTime() - 3 * 3600_000);
    return ar.toISOString().slice(11, 19) + " ART";
  } catch { return "—"; }
}
function lunesDeSemana(fecha: string): string {
  const d = new Date(fecha + "T00:00:00Z");
  const dow = d.getUTCDay();
  const off = dow === 0 ? -6 : 1 - dow;
  return new Date(d.getTime() + off * 86400000).toISOString().slice(0, 10);
}
function aggSerie(serie: SerieRow[], agg: Agg): { x: string; bruto: number }[] {
  const m = new Map<string, number>();
  for (const p of serie) {
    const k = agg === "MENSUAL" ? p.fecha.slice(0, 7) : agg === "SEMANAL" ? lunesDeSemana(p.fecha) : p.fecha;
    m.set(k, (m.get(k) ?? 0) + p.bruto);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ x: agg === "MENSUAL" ? fmtMesCorto(k) : fmtFechaCorta(k), bruto: v }));
}

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch { return null; }
}

export function OpsView() {
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [modo, setModo] = useState<Modo>("ULTIMA");
  const [agg, setAgg] = useState<Agg>("DIARIO");
  const [fechas, setFechas] = useState<FechaRow[]>([]);
  const [idx, setIdx] = useState(0);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [serie, setSerie] = useState<SerieRow[]>([]);
  const [porOp, setPorOp] = useState<OpRow[]>([]);
  const [porDenom, setPorDenom] = useState<DenomRow[]>([]);
  const [total, setTotal] = useState(0);

  const fecha = fechas[idx]?.fecha ?? "";
  const rango = useMemo(() => {
    if (!fechas.length) return { desde: "", hasta: "" };
    if (modo === "TODOS") return { desde: fechas[fechas.length - 1].fecha, hasta: fechas[0].fecha };
    return { desde: fecha, hasta: fecha };
  }, [modo, fecha, fechas]);

  const cargarFechas = useCallback(async () => {
    const f = await getJSON<{ fechas: FechaRow[] }>("/api/operaciones/ops/fechas");
    setFechas(f?.fechas ?? []);
    setIdx(0);
  }, []);
  useEffect(() => { cargarFechas(); }, [cargarFechas]);
  useEffect(() => { if (modo === "ULTIMA") setIdx(0); }, [modo]);

  // Gráfico: serie completa por fecha (depende solo de moneda).
  useEffect(() => {
    (async () => {
      const d = await getJSON<{ serie: SerieRow[] }>(`/api/operaciones/ops/serie?moneda=${moneda}`);
      setSerie(d?.serie ?? []);
    })();
  }, [moneda]);

  // Meta + resumen (por_operacion / por_denominacion) para el scope.
  useEffect(() => {
    if (!fechas.length) return;
    (async () => {
      const [mt, rs] = await Promise.all([
        modo === "TODOS" ? Promise.resolve(null)
          : getJSON<{ meta: Meta }>(`/api/operaciones/ops/meta?fecha=${fecha}`),
        getJSON<{ por_operacion: OpRow[]; por_denominacion: DenomRow[]; total: number }>(
          `/api/operaciones/ops/resumen?moneda=${moneda}&desde=${rango.desde}&hasta=${rango.hasta}`,
        ),
      ]);
      setMeta(mt?.meta ?? null);
      setPorOp(rs?.por_operacion ?? []);
      setPorDenom(rs?.por_denominacion ?? []);
      setTotal(rs?.total ?? 0);
    })();
  }, [modo, fecha, moneda, rango.desde, rango.hasta, fechas.length]);

  const chartData = useMemo(() => aggSerie(serie, agg), [serie, agg]);
  const totalPeriodo = useMemo(() => serie.reduce((a, p) => a + p.bruto, 0), [serie]);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* ── Filtros ─────────────────────────────────────────────── */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          <button onClick={() => setIdx((i) => Math.min(i + 1, fechas.length - 1))}
            disabled={modo !== "DIA" || idx >= fechas.length - 1}
            className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">‹</button>
          <button onClick={() => setIdx((i) => Math.max(i - 1, 0))}
            disabled={modo !== "DIA" || idx <= 0}
            className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">›</button>
        </div>
        {(["ULTIMA", "DIA", "TODOS"] as Modo[]).map((m) => (
          <Pill key={m} active={modo === m} onClick={() => setModo(m)}>{m}</Pill>
        ))}
        <span className="font-mono text-[12px] text-[var(--t-accent)] mx-1">
          {modo === "TODOS"
            ? `${fmtFechaCorta(rango.desde)} → ${fmtFechaCorta(rango.hasta)}`
            : (fecha ? fmtFechaDisplay(fecha) : "—")}
        </span>
        <span className="text-[#333]">│</span>
        {meta && modo !== "TODOS" && (
          <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wider">
            Boletos: <span className="text-[var(--t-text)] font-mono">{meta.n_boletos}</span>
            {meta.ultima_ingesta && <> · Últ. ingesta: <span className="text-[var(--t-text)] font-mono">{formatTime(meta.ultima_ingesta)}</span></>}
          </span>
        )}
        <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["ARS", "USD"] as Moneda[]).map((m) => (
            <button key={m} onClick={() => setMoneda(m)}
              className={"px-3 py-0.5 text-[10px] uppercase tracking-wider " + (moneda === m
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{m}</button>
          ))}
        </div>
        <button onClick={() => { cargarFechas(); }}
          className="border border-[var(--t-border-2)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--t-text-dim)] hover:text-[var(--t-accent)]">↻ Refresh</button>
      </div>

      {/* ── Cuerpo: 50% / 50% ───────────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">

        {/* IZQUIERDA: arriba operaciones, abajo gráfico */}
        <div className="min-h-0 grid grid-rows-2 gap-3 overflow-hidden">

          {/* Σ bruto por operacion (solo != 0) */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por operación</span>
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">Σ {fmtCompact(total)} {moneda}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <tbody>
                  {porOp.map((r) => (
                    <tr key={r.operacion} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                      <td className="px-3 py-1 text-[var(--t-text)]">{r.operacion}</td>
                      <td className="px-3 py-1 text-right text-[var(--t-text)] font-semibold">{fmtCompact(r.bruto)}</td>
                      <td className="px-3 py-1 text-right text-[var(--t-text-dim)] w-12">{total ? ((r.bruto / total) * 100).toFixed(0) : "0"}%</td>
                    </tr>
                  ))}
                  {!porOp.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gráfico Σ bruto por fecha */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center flex-wrap gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Volumen operado · {moneda}</span>
              {chartData.length > 0 && (
                <span className="text-[9px] font-mono text-[var(--t-text-muted)]">{chartData[0].x} → {chartData[chartData.length - 1].x}</span>
              )}
              <span className="text-[10px] font-mono">
                <span className="text-[var(--t-text-muted)] uppercase tracking-wider">Total período: </span>
                <span className="text-[var(--t-accent)] font-semibold">{fmtCompact(totalPeriodo)}</span>
              </span>
              <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
                {(["DIARIO", "SEMANAL", "MENSUAL"] as Agg[]).map((k) => (
                  <button key={k} onClick={() => setAgg(k)}
                    className={"px-2 py-0.5 text-[9px] uppercase tracking-wider " + (agg === k
                      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                      : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{k}</button>
                ))}
              </div>
            </div>
            <div className="flex-1 min-h-0 p-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 10, left: 6, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
                  <XAxis dataKey="x" tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} />
                  <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={48} />
                  <Tooltip formatter={(v) => `${fmtCompact(Number(v))} ${moneda}`}
                    contentStyle={{ fontSize: 11, background: "var(--t-panel)", border: "1px solid var(--t-border)" }} />
                  <Bar dataKey="bruto" name="Bruto" fill="var(--t-brand)" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* DERECHA: Σ bruto por denominación */}
        <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por denominación</span>
            <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{porDenom.length} · Σ {fmtCompact(total)} {moneda}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Denominación</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Σ Bruto</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                </tr>
              </thead>
              <tbody>
                {porDenom.map((r) => (
                  <tr key={r.denominacion} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                    <td className="px-3 py-1 text-[var(--t-text)] truncate max-w-[320px]" title={r.denominacion}>{r.denominacion}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text)] font-semibold">{fmtCompact(r.bruto)}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                  </tr>
                ))}
                {!porDenom.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={"px-2 py-0.5 border text-[11px] font-semibold " + (active
        ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
        : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]")}>
      {children}
    </button>
  );
}
