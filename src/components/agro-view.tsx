"use client";

// OPERACIONES → AGRO: mismo formato que Operaciones, pero en TONELADAS de Futuros
// Agropecuarios. Izq: Σ ton por commodity (arriba) + gráfico (abajo). Der: Σ ton
// por cuenta. Interactivo (clic commodity/cuenta filtra el resto).
// Endpoint: /api/operaciones/ops/agro.

import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type Agg = "MENSUAL" | "DIARIO";
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

const fmtTon = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
function fmtPeriodo(p: string): string {
  if (p.length === 7) { const [y, m] = p.split("-"); return `${MESES[+m - 1]} ${y.slice(2)}`; }
  const [, m, d] = p.split("-"); return `${d}/${m}`;
}

export function AgroView() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [agg, setAgg] = useState<Agg>("MENSUAL");
  const [selComm, setSelComm] = useState<string | null>(null);
  const [selCuenta, setSelCuenta] = useState<string | null>(null);
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
    const qs = `desde=${desde}&hasta=${hasta}&agg=${agg}`
      + (selComm ? `&commodity=${selComm}` : "")
      + (selCuenta ? `&cuenta=${encodeURIComponent(selCuenta)}` : "");
    fetch(`/api/operaciones/ops/agro?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).then(setData)
      .catch(() => setData(null)).finally(() => setLoading(false));
  }, [desde, hasta, agg, selComm, selCuenta]);

  const chartData = useMemo(
    () => (data?.serie ?? []).map((r) => ({ ...r, x: fmtPeriodo(r.periodo) })),
    [data],
  );
  const tot = data?.totales ?? { SOJA: 0, TRIGO: 0, MAIZ: 0 };
  const totGral = tot.SOJA + tot.TRIGO + tot.MAIZ;
  const cuentas = data?.por_cuenta ?? [];

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
        {(selComm || selCuenta) && (
          <button onClick={() => { setSelComm(null); setSelCuenta(null); }}
            className="text-[10px] text-[var(--t-accent)] border border-[var(--t-accent)] px-2 py-1">✕ filtro: {selComm || selCuenta}</button>
        )}
        <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)]">
          TOTAL: <span className="text-[var(--t-text)] font-semibold">{fmtTon(totGral)} t</span>{loading ? " · cargando…" : ""}
        </span>
      </div>

      {/* Cuerpo 50/50 */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 p-3 overflow-hidden">
        {/* IZQUIERDA: tabla commodity (arriba) + gráfico (abajo) — tamaños FIJOS */}
        <div className="min-h-0 grid grid-rows-2 gap-3 overflow-hidden">
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
            <div className="flex items-center flex-wrap gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
              <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">Volumen operado · toneladas</span>
              {desde && hasta && <span className="text-[9px] font-mono text-[var(--t-text-muted)]">{desde.slice(5)} → {hasta.slice(5)}</span>}
              <span className="text-[10px] font-mono"><span className="text-[var(--t-text-muted)] uppercase tracking-wider">Total: </span><span className="text-[var(--t-accent)] font-semibold">{fmtTon(totGral)} t</span></span>
            </div>
            <div className="flex-1 min-h-0 p-2 wm-corner">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 10, left: 6, bottom: 4 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
                  <XAxis dataKey="x" tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
                    interval={Math.max(0, Math.floor(chartData.length / 12))} angle={-35} textAnchor="end" height={28} />
                  <YAxis tickFormatter={fmtTon} tick={{ fontSize: 9, fill: "var(--t-text-muted)" }} width={56}
                    domain={[0, (max: number) => Math.ceil((max || 1) * 1.15)]} />
                  <Tooltip formatter={(v, n) => [`${fmtTon(Number(v))} t`, String(n)]}
                    contentStyle={{ fontSize: 11, background: "var(--t-panel)", border: "1px solid var(--t-border)" }} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  {COMMS.filter((c) => !selComm || selComm === c.key).map((c) => (
                    <Bar key={c.key} dataKey={c.key} name={c.label} fill={c.color} isAnimationActive={false} maxBarSize={48} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
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
    </div>
  );
}
