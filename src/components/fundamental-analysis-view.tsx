"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Vista Análisis Fundamental (Renta Variable) — 4 paneles sobre research.*
// (fundamentals de Refinitiv). Read-only. Selector de empresa + Anual/Trimestral.

type Company = { ric: string; ticker: string; nombre: string; sector: string };
type Analisis = {
  company: {
    ric: string; ticker: string; nombre: string; sector: string;
    pais: string; bolsa: string; moneda: string; cedear_ticker: string;
  } | null;
  market: {
    price: number | null; high_52w: number | null; low_52w: number | null;
    market_cap: number | null; ev: number | null; shares: number | null;
    div_yield: number | null; currency: string | null; updated_at: string | null;
  } | null;
  periodos: string[];
  evolucion: { periodo: string; ingresos: number | null; ebitda: number | null; neto: number | null }[];
  margenes: { periodo: string; bruto: number | null; ebitda: number | null; operativo: number | null; neto: number | null }[];
  ratios: { periodo: string; roe: number | null; roa: number | null; ps: number | null; pb: number | null }[];
  segmentos: { segmento: string; valor: number | null }[];
};

const PIE = ["var(--t-accent)", "var(--t-brand)", "var(--t-pos)", "#9333ea", "#0891b2", "#d97706"];

const fmtN = (n: number | null | undefined, d = 0) =>
  n == null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtM = (n: number | null | undefined) => (n == null ? "—" : fmtN(n / 1e6) + " M");
const fmtCap = (n: number | null | undefined) =>
  n == null ? "—" : n >= 1e9 ? (n / 1e9).toFixed(1) + " B" : (n / 1e6).toFixed(0) + " M";
const fmtPct = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(1) + "%");

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
      <div className="px-2 py-1 border-b border-[var(--t-border)] shrink-0 flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">{title}</span>
        {sub && <span className="text-[9px] text-[var(--t-text-muted)]">{sub}</span>}
      </div>
      <div className="flex-1 min-h-0 p-2">{children}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">{label}</span>
      <span className="text-[13px] font-semibold text-[var(--t-text)] tabular-nums">{value}</span>
    </div>
  );
}

export function FundamentalAnalysisView() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [ric, setRic] = useState<string>("");
  const [freq, setFreq] = useState<"FY" | "Q">("FY");
  const [data, setData] = useState<Analisis | null>(null);
  const [loading, setLoading] = useState(false);

  // Universo de empresas (una vez)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/research/companies", { cache: "no-store" });
        if (!alive || !r.ok) return;
        const cs = (await r.json()) as Company[];
        setCompanies(cs);
        if (cs.length) setRic((prev) => prev || cs[0].ric);
      } catch {
        /* noop */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Datos de la empresa seleccionada
  useEffect(() => {
    if (!ric) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/research/fundamentals?ric=${encodeURIComponent(ric)}&freq=${freq}`,
          { cache: "no-store" },
        );
        if (!alive) return;
        setData(r.ok ? ((await r.json()) as Analisis) : null);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ric, freq]);

  const c = data?.company;
  const m = data?.market;
  const evol = (data?.evolucion ?? []).map((r) => ({
    periodo: r.periodo,
    Ingresos: r.ingresos == null ? null : r.ingresos / 1e6,
    EBITDA: r.ebitda == null ? null : r.ebitda / 1e6,
    Neto: r.neto == null ? null : r.neto / 1e6,
  }));
  const seg = (data?.segmentos ?? []).filter((s) => s.valor != null && s.valor > 0);

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* toolbar */}
      <div className="flex items-center gap-2 px-2 py-1.5 shrink-0 border-b border-[var(--t-border)]">
        <select
          value={ric}
          onChange={(e) => setRic(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[12px] px-2 py-1 rounded-sm min-w-[220px]"
        >
          {!companies.length && <option value="">(sin empresas cargadas)</option>}
          {companies.map((co) => (
            <option key={co.ric} value={co.ric}>
              {co.nombre || co.ticker} · {co.ticker}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-0.5">
          {(["FY", "Q"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFreq(f)}
              className={
                "px-2 py-1 text-[10px] font-semibold border rounded-sm " +
                (freq === f
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)]")
              }
            >
              {f === "FY" ? "Anual" : "Trimestral"}
            </button>
          ))}
        </div>
      </div>

      {/* 4 paneles */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-2 p-2">
        {/* 1 — Ficha + mercado */}
        <Panel title="Ficha + Mercado" sub={c?.sector || ""}>
          <div className="h-full flex flex-col gap-3 overflow-y-auto">
            <div>
              <div className="text-[15px] font-bold text-[var(--t-text)]">{c?.nombre || "—"}</div>
              <div className="text-[10px] text-[var(--t-text-muted)] font-mono">
                {c?.ticker} · {c?.ric} {c?.bolsa ? "· " + c.bolsa : ""} {m?.currency ? "· " + m.currency : ""}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <Metric label="Precio" value={fmtN(m?.price, 2)} />
              <Metric label="Cap. de mercado" value={fmtCap(m?.market_cap)} />
              <Metric label="Enterprise Value" value={fmtCap(m?.ev)} />
              <Metric label="Acciones" value={fmtM(m?.shares)} />
              <Metric label="Máx 52 sem" value={fmtN(m?.high_52w, 2)} />
              <Metric label="Mín 52 sem" value={fmtN(m?.low_52w, 2)} />
              <Metric label="Dividend yield" value={fmtPct(m?.div_yield)} />
              <Metric label="Sector" value={c?.sector || "—"} />
            </div>
          </div>
        </Panel>

        {/* 2 — Evolución financiera */}
        <Panel title="Evolución financiera" sub="ingresos · EBITDA · neto (USD MM)">
          {evol.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evol} margin={{ top: 6, right: 8, left: 0, bottom: 4 }}>
                <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: "var(--t-text-dim)" }} />
                <YAxis tick={{ fontSize: 10, fill: "var(--t-text-dim)" }} width={44} />
                <Tooltip
                  contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 11 }}
                  formatter={(v) => fmtN(Number(v)) + " M"}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="Ingresos" fill="var(--t-accent)" />
                <Bar dataKey="EBITDA" fill="var(--t-brand)" />
                <Bar dataKey="Neto" fill="var(--t-pos)" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty loading={loading} />
          )}
        </Panel>

        {/* 3 — Márgenes & ratios */}
        <Panel title="Márgenes & ratios" sub="márgenes % · ROE/ROA">
          {data?.margenes.length ? (
            <div className="h-full flex flex-col gap-1">
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.margenes} margin={{ top: 6, right: 8, left: 0, bottom: 4 }}>
                    <XAxis dataKey="periodo" tick={{ fontSize: 10, fill: "var(--t-text-dim)" }} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--t-text-dim)" }} width={36} unit="%" />
                    <Tooltip
                      contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 11 }}
                      formatter={(v) => fmtPct(Number(v))}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Line type="monotone" dataKey="bruto" name="Bruto" stroke="var(--t-accent)" dot={false} />
                    <Line type="monotone" dataKey="ebitda" name="EBITDA" stroke="var(--t-brand)" dot={false} />
                    <Line type="monotone" dataKey="operativo" name="Operativo" stroke="#9333ea" dot={false} />
                    <Line type="monotone" dataKey="neto" name="Neto" stroke="var(--t-pos)" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="shrink-0 grid grid-cols-4 gap-1 text-center border-t border-[var(--t-border)] pt-1">
                {(() => {
                  const last = data.ratios.at(-1);
                  return (
                    <>
                      <Metric label="ROE" value={fmtPct(last?.roe)} />
                      <Metric label="ROA" value={fmtPct(last?.roa)} />
                      <Metric label="P/S" value={fmtN(last?.ps, 1)} />
                      <Metric label="P/B" value={fmtN(last?.pb, 1)} />
                    </>
                  );
                })()}
              </div>
            </div>
          ) : (
            <Empty loading={loading} />
          )}
        </Panel>

        {/* 4 — Segmentos */}
        <Panel title="Segmentos" sub="ingresos por línea de negocio (último período)">
          {seg.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={seg}
                  dataKey="valor"
                  nameKey="segmento"
                  cx="50%"
                  cy="50%"
                  outerRadius="78%"
                >
                  {seg.map((_, i) => (
                    <Cell key={i} fill={PIE[i % PIE.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 11 }}
                  formatter={(v) => fmtN(Number(v) / 1e6) + " M"}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Empty loading={loading} msg="sin datos de segmentos" />
          )}
        </Panel>
      </div>
    </div>
  );
}

function Empty({ loading, msg = "sin datos" }: { loading: boolean; msg?: string }) {
  return (
    <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-muted)]">
      {loading ? "cargando…" : msg}
    </div>
  );
}
