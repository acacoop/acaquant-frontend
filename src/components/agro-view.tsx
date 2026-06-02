"use client";

// OPERACIONES → AGRO: volumen operado en TONELADAS de Futuros Agropecuarios
// (SOJA/TRIGO/MAIZ), por mes o por día. Sobre CashFlow.Operaciones.
// Endpoint: /api/operaciones/ops/agro.

import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Agg = "MENSUAL" | "DIARIO";
type SerieRow = { periodo: string; SOJA: number; TRIGO: number; MAIZ: number };
type Resp = { serie: SerieRow[]; totales: { SOJA: number; TRIGO: number; MAIZ: number } };

const COMMS = [
  { key: "SOJA", label: "Soja", color: "#22c55e" },
  { key: "TRIGO", label: "Trigo", color: "#eab308" },
  { key: "MAIZ", label: "Maíz", color: "#3b82f6" },
] as const;
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

const fmtTon = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
function fmtPeriodo(p: string): string {
  if (p.length === 7) { const [y, m] = p.split("-"); return `${MESES[+m - 1]} ${y.slice(2)}`; }
  const [, m, d] = p.split("-"); return `${d}/${m}`;
}

export function AgroView() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [agg, setAgg] = useState<Agg>("MENSUAL");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/operaciones/ops/fechas", { cache: "no-store" });
        const j = r.ok ? await r.json() : null;
        const f: { fecha: string }[] = j?.fechas ?? [];
        if (f.length) { setHasta((h) => h || f[0].fecha); setDesde((d) => d || f[f.length - 1].fecha); }
      } catch { /* */ }
    })();
  }, []);

  useEffect(() => {
    if (!desde || !hasta) return;
    setLoading(true);
    fetch(`/api/operaciones/ops/agro?desde=${desde}&hasta=${hasta}&agg=${agg}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [desde, hasta, agg]);

  const chartData = useMemo(
    () => (data?.serie ?? []).map((r) => ({ ...r, x: fmtPeriodo(r.periodo) })),
    [data],
  );
  const tot = data?.totales ?? { SOJA: 0, TRIGO: 0, MAIZ: 0 };

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Filtros */}
      <div className="flex items-end flex-wrap gap-3 px-4 py-2 border-b border-[var(--t-border)] shrink-0 text-[11px]">
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Desde</span>
          <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono outline-none [color-scheme:dark]" />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Hasta</span>
          <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono outline-none [color-scheme:dark]" />
        </label>
        <div className="inline-flex border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
          {(["DIARIO", "MENSUAL"] as Agg[]).map((a) => (
            <button key={a} onClick={() => setAgg(a)}
              className={"px-2 py-1 text-[9px] uppercase tracking-wider " + (agg === a
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>{a}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-4 font-mono">
          {COMMS.map((c) => (
            <span key={c.key} className="text-[10px]">
              <span className="inline-block w-2 h-2 mr-1" style={{ background: c.color }} />
              <span className="text-[var(--t-text-muted)]">{c.label}: </span>
              <span className="text-[var(--t-text)] font-semibold">{fmtTon(tot[c.key])} t</span>
            </span>
          ))}
        </div>
      </div>

      {/* Gráfico */}
      <div className="flex-1 min-h-0 p-3 wm-corner">
        <div className="text-[10px] uppercase tracking-widest text-[var(--t-accent)] mb-2">
          Volumen operado · Futuros Agro · toneladas{loading ? " · cargando…" : ""}
        </div>
        <div className="h-[calc(100%-24px)]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
              <XAxis dataKey="x" tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
                angle={-35} textAnchor="end" height={36}
                interval={Math.max(0, Math.floor(chartData.length / 16))} />
              <YAxis tickFormatter={fmtTon} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={64}
                domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} />
              <Tooltip formatter={(v) => `${fmtTon(Number(v))} t`}
                contentStyle={{ fontSize: 11, background: "var(--t-panel)", border: "1px solid var(--t-border)" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              {COMMS.map((c) => <Bar key={c.key} dataKey={c.key} name={c.label} fill={c.color} isAnimationActive={false} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
