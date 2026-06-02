"use client";

// OPERACIONES → AGRO: mismo formato que Operaciones, pero en TONELADAS de Futuros
// Agropecuarios. Izq: Σ ton por commodity (arriba) + gráfico (abajo, más alto).
// Der: Σ ton por cuenta. Tablas = día (modelo ÚLTIMA/DÍA/TODOS); gráfico =
// histórico con rango (1W/1M/…/ALL) + agg + foco día + maximizar.
// Endpoint: /api/operaciones/ops/agro.

import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Agg = "DIARIO" | "MENSUAL";
type Modo = "ULTIMA" | "DIA" | "TODOS";
type RangoKey = "1W" | "1M" | "3M" | "YTD" | "1A" | "ALL";
type SerieRow = { periodo: string; SOJA: number; TRIGO: number; MAIZ: number };
type CuentaRow = { denominacion: string; toneladas: number; n: number };
type Resp = {
  serie: SerieRow[];
  totales: { SOJA: number; TRIGO: number; MAIZ: number };
  por_cuenta: CuentaRow[];
};

const COMMS = [
  { key: "SOJA", label: "Soja", color: "#22c55e" },
  { key: "TRIGO", label: "Trigo", color: "#eab308" },
  { key: "MAIZ", label: "Maíz", color: "#3b82f6" },
] as const;
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const MUTED = "var(--t-border-2)";

const fmtTon = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
const fmtFechaCorta = (s: string) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y.slice(-2)}`; };
const fmtMesCorto = (s: string) => { const [y, m] = s.split("-").map(Number); return `${MESES[m - 1]} ${String(y).slice(-2)}`; };

function bucketKey(fecha: string, agg: Agg): string {
  return agg === "MENSUAL" ? fecha.slice(0, 7) : fecha;
}
function filtrarRango(serie: SerieRow[], rango: RangoKey, offset: number): SerieRow[] {
  if (rango === "ALL" || !serie.length) return serie;
  if (rango === "YTD") {
    const yyyy = new Date().getFullYear() - offset;
    return serie.filter((s) => s.periodo.startsWith(`${yyyy}-`));
  }
  const n = rango === "1W" ? 5 : rango === "1M" ? 22 : rango === "3M" ? 65 : 252;
  const end = serie.length - offset * n;
  return serie.slice(Math.max(0, end - n), Math.max(0, end));
}
function aggSerie(serie: SerieRow[], agg: Agg): { key: string; x: string; SOJA: number; TRIGO: number; MAIZ: number }[] {
  const m = new Map<string, { SOJA: number; TRIGO: number; MAIZ: number }>();
  for (const p of serie) {
    const k = bucketKey(p.periodo, agg);
    const cur = m.get(k) ?? { SOJA: 0, TRIGO: 0, MAIZ: 0 };
    cur.SOJA += p.SOJA; cur.TRIGO += p.TRIGO; cur.MAIZ += p.MAIZ;
    m.set(k, cur);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ key: k, x: agg === "MENSUAL" ? fmtMesCorto(k) : fmtFechaCorta(k), ...v }));
}

export function AgroView() {
  const [modo, setModo] = useState<Modo>("ULTIMA");
  const [fechas, setFechas] = useState<{ fecha: string; n: number }[]>([]);
  const [idx, setIdx] = useState(0);
  const [meta, setMeta] = useState<{ n_boletos: number; ultima_ingesta: string | null } | null>(null);
  const [selComm, setSelComm] = useState<string | null>(null);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  // Controles del gráfico (histórico)
  const [agg, setAgg] = useState<Agg>("MENSUAL");
  const [rango, setRango] = useState<RangoKey>("YTD");
  const [rangoOffset, setRangoOffset] = useState(0);
  const [focoDia, setFocoDia] = useState(false);
  const [maxi, setMaxi] = useState(false);

  const fecha = fechas[idx]?.fecha ?? "";
  const rangoFecha = useMemo(() => {
    if (!fechas.length) return { desde: "", hasta: "" };
    if (modo === "TODOS") return { desde: fechas[fechas.length - 1].fecha, hasta: fechas[0].fecha };
    return { desde: fecha, hasta: fecha };
  }, [modo, fecha, fechas]);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/operaciones/ops/fechas", { cache: "no-store" }).then((x) => x.ok ? x.json() : null).catch(() => null);
      setFechas(r?.fechas ?? []); setIdx(0);
    })();
  }, []);
  useEffect(() => { if (modo === "ULTIMA") setIdx(0); }, [modo]);
  useEffect(() => {
    if (modo === "TODOS" || !fecha) { setMeta(null); return; }
    fetch(`/api/operaciones/ops/meta?fecha=${fecha}`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : null).then((j) => setMeta(j?.meta ?? null)).catch(() => setMeta(null));
  }, [modo, fecha]);

  // Datos: tablas = rango [desde,hasta]; serie = histórica DIARIA (se agrega/filtra
  // en cliente). Por eso pedimos agg=DIARIO siempre; el toggle del gráfico no refetch.
  useEffect(() => {
    if (!rangoFecha.desde || !rangoFecha.hasta) return;
    setLoading(true);
    const qs = `desde=${rangoFecha.desde}&hasta=${rangoFecha.hasta}&agg=DIARIO`
      + (selComm ? `&commodity=${selComm}` : "")
      + (selCuenta ? `&cuenta=${encodeURIComponent(selCuenta)}` : "");
    fetch(`/api/operaciones/ops/agro?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setData)
      .catch(() => setData(null)).finally(() => setLoading(false));
  }, [rangoFecha.desde, rangoFecha.hasta, selComm, selCuenta]);

  const serie = useMemo(() => data?.serie ?? [], [data]);
  const chartData = useMemo(() => aggSerie(filtrarRango(serie, rango, rangoOffset), agg), [serie, rango, rangoOffset, agg]);
  const totalPeriodo = useMemo(() => chartData.reduce((a, p) => a + p.SOJA + p.TRIGO + p.MAIZ, 0), [chartData]);
  const focoKey = modo === "DIA" && focoDia && fecha ? bucketKey(fecha, agg) : null;
  const tot = data?.totales ?? { SOJA: 0, TRIGO: 0, MAIZ: 0 };
  const totGral = tot.SOJA + tot.TRIGO + tot.MAIZ;
  const cuentas = data?.por_cuenta ?? [];

  const Chart = (
    <BarChart data={chartData} margin={{ top: 6, right: 10, left: 6, bottom: 4 }} barCategoryGap="12%">
      <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
      <XAxis dataKey="x" tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} angle={-35} textAnchor="end" height={28} />
      <YAxis tickFormatter={fmtTon} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={56}
        domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} />
      <Tooltip formatter={(v, n) => [`${fmtTon(Number(v))} t`, String(n)]}
        contentStyle={{ fontSize: 11, background: "var(--t-panel)", border: "1px solid var(--t-border)" }} />
      <Legend wrapperStyle={{ fontSize: 9 }} />
      {COMMS.filter((c) => !selComm || selComm === c.key).map((c) => (
        <Bar key={c.key} dataKey={c.key} name={c.label} isAnimationActive={false} maxBarSize={64}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={focoKey && d.key !== focoKey ? MUTED : c.color} />
          ))}
        </Bar>
      ))}
    </BarChart>
  );

  const chartHeader = (
    <div className="flex items-center flex-wrap gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
      <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Volumen operado · toneladas</span>
      {chartData.length > 0 && <span className="text-[9px] font-mono text-[var(--t-text-muted)]">{chartData[0].x} → {chartData[chartData.length - 1].x}</span>}
      <span className="text-[10px] font-mono"><span className="text-[var(--t-text-muted)] uppercase tracking-wider">Total período: </span><span className="text-[var(--t-accent)] font-semibold">{fmtTon(totalPeriodo)} t</span></span>
      <div className="ml-auto inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
        {(["DIARIO", "MENSUAL"] as Agg[]).map((k) => (
          <button key={k} onClick={() => setAgg(k)} className={"px-2 py-0.5 text-[9px] uppercase tracking-wider " + (agg === k ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{k}</button>
        ))}
      </div>
      <button onClick={() => setRangoOffset((o) => o + 1)} className="px-1 text-[10px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] hover:text-[var(--t-accent)]" title="Período anterior">◀</button>
      <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
        {(["1W", "1M", "3M", "YTD", "1A", "ALL"] as RangoKey[]).map((k) => (
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
      {/* Filtros — modelo ÚLTIMA/DÍA/TODOS (las tablas son del día; el gráfico es histórico) */}
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
        {(selComm || selCuenta) && (
          <button onClick={() => { setSelComm(null); setSelCuenta(null); }} className="text-[10px] text-[var(--t-accent)] border border-[var(--t-accent)] px-2 py-0.5">✕ {selComm || selCuenta}</button>
        )}
        <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">
          TOTAL: <span className="text-[var(--t-text)] font-semibold">{fmtTon(totGral)} t</span>{loading ? " · cargando…" : ""}
        </span>
      </div>

      {/* Cuerpo 50/50 */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* IZQUIERDA: tabla commodity (arriba, chica) + gráfico (abajo, MÁS ALTO) */}
        <div className="min-h-0 grid grid-rows-[2fr_3fr] gap-3 overflow-hidden">
          {/* Por commodity */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por commodity</span>
              <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">Σ {fmtTon(totGral)} t</span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-[11px] font-mono tabular-nums">
                <tbody>
                  {COMMS.filter((c) => tot[c.key] !== 0).map((c) => {
                    const act = selComm === c.key;
                    return (
                      <tr key={c.key} onClick={() => { setSelComm(act ? null : c.key); setSelCuenta(null); }}
                        className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                        <td className="px-3 py-1">
                          <span className="inline-block w-2 h-2 mr-2" style={{ background: c.color }} />{c.label}
                        </td>
                        <td className="px-3 py-1 text-right font-semibold">{fmtTon(tot[c.key])} t</td>
                        <td className="px-3 py-1 text-right text-[var(--t-text-dim)] w-12">{totGral ? ((tot[c.key] / totGral) * 100).toFixed(0) : "0"}%</td>
                      </tr>
                    );
                  })}
                  {!totGral && <tr><td className="px-3 py-3 text-[var(--t-text-muted)]">sin datos</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          {/* Gráfico */}
          <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
            {chartHeader}
            <div className="flex-1 min-h-0 p-2 wm-corner">
              <ResponsiveContainer width="100%" height="100%">{Chart}</ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* DERECHA: por cuenta */}
        <div className="min-h-0 border border-[var(--t-border)] flex flex-col overflow-hidden">
          <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Por cuenta</span>
            <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">{cuentas.length} · Σ {fmtTon(totGral)} t</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[var(--t-panel)] text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
                <tr>
                  <th className="px-3 py-1.5 text-left border-b border-[var(--t-border)]">Cuenta</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">Toneladas</th>
                  <th className="px-3 py-1.5 text-right border-b border-[var(--t-border)]">N</th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((r) => {
                  const act = selCuenta === r.denominacion;
                  return (
                    <tr key={r.denominacion} onClick={() => { setSelCuenta(act ? null : r.denominacion); setSelComm(null); }}
                      className={"border-t border-[var(--t-border)] cursor-pointer " + (act ? "bg-[var(--t-accent)]/15" : "hover:bg-[var(--t-surface-2)]")}>
                      <td className="px-3 py-1 truncate max-w-[320px]" title={r.denominacion}>{r.denominacion}</td>
                      <td className="px-3 py-1 text-right font-semibold">{fmtTon(r.toneladas)}</td>
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

      {/* Gráfico maximizado */}
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
