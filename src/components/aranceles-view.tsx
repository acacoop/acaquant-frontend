"use client";

// OPERACIONES → ARANCELES: mismo formato que Operaciones. Izq: Σ aranceles por
// nivel_3 (arriba) + gráfico (abajo). Der: Σ aranceles por cliente. Filtros:
// moneda, segmento (nivel_1), fechas. Interactivo. Endpoint /ops/aranceles.

import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Moneda = "ARS" | "USD";
type Agg = "MENSUAL" | "DIARIO";
type SerieRow = { periodo: string; arancel: number };
type N3Row = { nivel_3: string; arancel: number; n: number };
type CuentaRow = { denominacion: string; arancel: number; n: number };
type Resp = { serie: SerieRow[]; por_nivel3: N3Row[]; por_cuenta: CuentaRow[]; total: number };

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function fmtCompact(n: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return s + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + "k";
  return s + a.toFixed(0);
}
function fmtPeriodo(p: string): string {
  if (p.length === 7) { const [y, m] = p.split("-"); return `${MESES[+m - 1]} ${y.slice(2)}`; }
  const [, m, d] = p.split("-"); return `${d}/${m}`;
}

type Modo = "ULTIMA" | "DIA" | "TODOS";

export function ArancelesView() {
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [agg, setAgg] = useState<Agg>("MENSUAL");
  const [segmento, setSegmento] = useState("");
  const [segmentos, setSegmentos] = useState<string[]>([]);
  const [selN3, setSelN3] = useState<string | null>(null);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [modo, setModo] = useState<Modo>("ULTIMA");
  const [fechas, setFechas] = useState<{ fecha: string }[]>([]);
  const [idx, setIdx] = useState(0);
  const [meta, setMeta] = useState<{ n_boletos: number } | null>(null);

  const fecha = fechas[idx]?.fecha ?? "";
  const rango = useMemo(() => {
    if (!fechas.length) return { desde: "", hasta: "" };
    if (modo === "TODOS") return { desde: fechas[fechas.length - 1].fecha, hasta: fechas[0].fecha };
    return { desde: fecha, hasta: fecha };
  }, [fechas, modo, fecha]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/operaciones/ops/fechas", { cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        setFechas(j?.fechas ?? []);
        const s = await fetch("/api/operaciones/ops/segmentos", { cache: "no-store" }).then((x) => x.ok ? x.json() : null).catch(() => null);
        setSegmentos(s?.segmentos ?? []);
      } catch { /* */ }
    })();
  }, []);

  useEffect(() => { if (modo === "ULTIMA") setIdx(0); }, [modo]);

  useEffect(() => {
    if (modo === "TODOS" || !fecha) { setMeta(null); return; }
    fetch(`/api/operaciones/ops/meta?fecha=${fecha}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => setMeta(j?.meta ?? null)).catch(() => setMeta(null));
  }, [fecha, modo]);

  useEffect(() => {
    if (!rango.desde || !rango.hasta) return;
    setLoading(true);
    const qs = `moneda=${moneda}&desde=${rango.desde}&hasta=${rango.hasta}&agg=${agg}`
      + (segmento ? `&segmento=${encodeURIComponent(segmento)}` : "")
      + (selN3 ? `&nivel3=${encodeURIComponent(selN3)}` : "")
      + (selCuenta ? `&cuenta=${encodeURIComponent(selCuenta)}` : "");
    fetch(`/api/operaciones/ops/aranceles?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setData)
      .catch(() => setData(null)).finally(() => setLoading(false));
  }, [moneda, rango.desde, rango.hasta, agg, segmento, selN3, selCuenta]);

  const chartData = useMemo(() => (data?.serie ?? []).map((r) => ({ x: fmtPeriodo(r.periodo), arancel: r.arancel })), [data]);
  const total = data?.total ?? 0;
  const n3 = data?.por_nivel3 ?? [];
  const cuentas = data?.por_cuenta ?? [];

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Filtros — modelo ÚLTIMA/DÍA/TODOS (tablas del día; gráfico histórico) */}
      <div className="flex items-center flex-wrap gap-2 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          <button onClick={() => { setModo("DIA"); setIdx((i) => Math.min(i + 1, fechas.length - 1)); }} disabled={idx >= fechas.length - 1} className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">‹</button>
          <button onClick={() => { setModo("DIA"); setIdx((i) => Math.max(i - 1, 0)); }} disabled={idx <= 0} className="px-2 py-0.5 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-30">›</button>
        </div>
        {(["ULTIMA", "DIA", "TODOS"] as Modo[]).map((m) => (
          <button key={m} onClick={() => setModo(m)} className={"px-2 py-0.5 border text-[11px] font-semibold " + (modo === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]" : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]")}>{m}</button>
        ))}
        <span className="font-mono text-[12px] text-[var(--t-accent)] mx-1">
          {modo === "TODOS" ? "histórico" : (fecha || "—")}
        </span>
        {meta && modo !== "TODOS" && (
          <><span className="text-[#333]">│</span>
          <span className="text-[10px] text-[var(--t-text-muted)] uppercase tracking-wider">
            Boletos: <span className="text-[var(--t-text)] font-mono">{meta.n_boletos}</span>
          </span></>
        )}
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)] ml-2">
          {(["DIARIO", "MENSUAL"] as Agg[]).map((a) => (
            <button key={a} onClick={() => setAgg(a)} className={"px-2 py-0.5 text-[9px] uppercase tracking-wider " + (agg === a ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{a}</button>
          ))}
        </div>
        <select value={segmento} onChange={(e) => setSegmento(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[11px] px-2 py-0.5 outline-none [color-scheme:dark]">
          <option value="">Todos los segmentos</option>
          {segmentos.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["ARS", "USD"] as Moneda[]).map((m) => (
            <button key={m} onClick={() => setMoneda(m)} className={"px-3 py-0.5 text-[10px] uppercase tracking-wider " + (moneda === m ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{m}</button>
          ))}
        </div>
        {(selN3 || selCuenta) && (
          <button onClick={() => { setSelN3(null); setSelCuenta(null); }} className="text-[10px] text-[var(--t-accent)] border border-[var(--t-accent)] px-2 py-0.5">✕ {selN3 || selCuenta}</button>
        )}
        <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">
          TOTAL: <span className="text-[var(--t-text)] font-semibold">{fmtCompact(total)} {moneda}</span>{loading ? " · cargando…" : ""}
        </span>
      </div>

      {/* Cuerpo 50/50 */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* IZQUIERDA: nivel_3 (arriba) + gráfico (abajo) — tamaños FIJOS */}
        <div className="min-h-0 grid grid-rows-2 gap-3 overflow-hidden">
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por nivel 3</span>
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">Σ {fmtCompact(total)} {moneda}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <tbody>
                  {n3.map((r) => {
                    const act = selN3 === r.nivel_3;
                    return (
                      <tr key={r.nivel_3} onClick={() => { setSelN3(act ? null : r.nivel_3); setSelCuenta(null); }}
                        className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                        <td className="px-3 py-1 truncate max-w-[220px]" title={r.nivel_3}>{r.nivel_3}</td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.arancel)}</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)] w-12">{total ? ((r.arancel / total) * 100).toFixed(0) : "0"}%</td>
                      </tr>
                    );
                  })}
                  {!n3.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 border-b border-[var(--t-border)] text-[10px] uppercase tracking-widest text-[var(--t-text-muted)] shrink-0">
              Aranceles operados · {moneda}
            </div>
            <div className="flex-1 min-h-0 p-2 wm-corner">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 10, left: 6, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
                  <XAxis dataKey="x" tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} interval={Math.max(0, Math.floor(chartData.length / 12))} angle={-35} textAnchor="end" height={28} />
                  <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={52} domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} />
                  <Tooltip formatter={(v) => `${fmtCompact(Number(v))} ${moneda}`} contentStyle={{ fontSize: 11, background: "var(--t-panel)", border: "1px solid var(--t-border)" }} />
                  <Bar dataKey="arancel" name="Aranceles" fill="var(--t-brand)" isAnimationActive={false} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* DERECHA: por cliente */}
        <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por cliente</span>
            <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{cuentas.length} · Σ {fmtCompact(total)} {moneda}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cliente</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Aranceles</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((r) => {
                  const act = selCuenta === r.denominacion;
                  return (
                    <tr key={r.denominacion} onClick={() => { setSelCuenta(act ? null : r.denominacion); setSelN3(null); }}
                      className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                      <td className="px-3 py-1 truncate max-w-[320px]" title={r.denominacion}>{r.denominacion}</td>
                      <td className="px-3 py-1 text-right font-semibold">{fmtCompact(r.arancel)}</td>
                      <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{r.n}</td>
                    </tr>
                  );
                })}
                {!cuentas.length && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
