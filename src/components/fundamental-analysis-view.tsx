"use client";

import { useEffect, useState } from "react";

// Vista Análisis Fundamental (Renta Variable) — informe denso estilo research
// sobre research.* (fundamentals de Refinitiv). Tablas: estado de resultados,
// múltiplos/ratios, márgenes, balance, flujo de caja e ingresos por segmento.

type Company = { ric: string; ticker: string; nombre: string; sector: string };
type Fila = { item: string; valores: (number | null)[] };
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
  tablas: { income: Fila[]; balance: Fila[]; cashflow: Fila[]; ratios: Fila[] };
  margenes: { periodo: string; bruto: number | null; ebitda: number | null; operativo: number | null; neto: number | null }[];
  segmentos: { periodos: string[]; filas: { segmento: string; valores: (number | null)[] }[] };
};

const nf = (n: number, d = 0) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

// formatters de celda
const fMill = (v: number | null, label = "") =>
  v == null ? "—" : /per share/i.test(label) ? nf(v, 2) : nf(v / 1e6);
const fRatio = (v: number | null) => (v == null ? "—" : nf(v, 2));
const fPct = (v: number | null | undefined) => (v == null ? "—" : nf(v, 1) + "%");
const fCap = (v: number | null | undefined) =>
  v == null ? "—" : v >= 1e9 ? nf(v / 1e9, 1) + " B" : nf(v / 1e6) + " M";

function Tabla({
  title, sub, cols, filas, format,
}: {
  title: string;
  sub?: string;
  cols: string[];
  filas: { label: string; valores: (number | null)[] }[];
  format: (v: number | null, label: string) => string;
}) {
  if (!filas.length || !cols.length) return null;
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
      <div className="px-2 py-1 border-b border-[var(--t-border)] flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)]">{title}</span>
        {sub && <span className="text-[9px] text-[var(--t-text-muted)]">{sub}</span>}
      </div>
      <table className="w-full text-[11px] tabular-nums border-collapse">
        <thead>
          <tr className="text-[9px] uppercase text-[var(--t-text-muted)]">
            <th className="text-left font-normal px-2 py-1">Concepto</th>
            {cols.map((c) => (
              <th key={c} className="text-right font-normal px-2 py-1">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.label} className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
              <td className="text-left px-2 py-[3px] text-[var(--t-text-dim)]">{f.label}</td>
              {f.valores.map((v, i) => (
                <td
                  key={i}
                  className={"text-right px-2 py-[3px] " + (v != null && v < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text)]")}
                >
                  {format(v, f.label)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
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
  const periodos = data?.periodos ?? [];
  const asFilas = (f: Fila[]) => f.map((x) => ({ label: x.item, valores: x.valores }));

  const margFilas = (
    [
      ["Margen Bruto", "bruto"],
      ["Margen EBITDA", "ebitda"],
      ["Margen Operativo", "operativo"],
      ["Margen Neto", "neto"],
    ] as const
  ).map(([label, key]) => ({
    label,
    valores: (data?.margenes ?? []).map((x) => x[key]),
  }));

  const segFilas = (data?.segmentos.filas ?? []).map((s) => ({ label: s.segmento, valores: s.valores }));

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
        {loading && <span className="text-[10px] text-[var(--t-text-muted)]">cargando…</span>}
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

      {/* cuerpo del informe */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2">
        {/* ficha + mercado */}
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-2">
          <div className="text-[16px] font-bold text-[var(--t-text)] leading-tight">{c?.nombre || "—"}</div>
          <div className="text-[10px] text-[var(--t-text-muted)] font-mono mb-2">
            {c?.ticker} · {c?.ric}
            {c?.sector ? " · " + c.sector : ""}
            {c?.bolsa ? " · " + c.bolsa : ""}
            {m?.currency ? " · " + m.currency : ""}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Metric label="Precio" value={m?.price != null ? nf(m.price, 2) : "—"} />
            <Metric label="Cap. de mercado" value={fCap(m?.market_cap)} />
            <Metric label="Enterprise Value" value={fCap(m?.ev)} />
            <Metric label="Máx 52 sem" value={m?.high_52w != null ? nf(m.high_52w, 2) : "—"} />
            <Metric label="Mín 52 sem" value={m?.low_52w != null ? nf(m.low_52w, 2) : "—"} />
            <Metric label="Acciones (MM)" value={m?.shares != null ? nf(m.shares / 1e6) : "—"} />
            <Metric label="Dividend yield" value={fPct(m?.div_yield)} />
          </div>
        </div>

        {/* estado de resultados */}
        <Tabla
          title="Estado de resultados"
          sub="USD millones (BPA por acción)"
          cols={periodos}
          filas={asFilas(data?.tablas.income ?? [])}
          format={fMill}
        />

        {/* múltiplos/ratios + márgenes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <Tabla title="Múltiplos y ratios" cols={periodos} filas={asFilas(data?.tablas.ratios ?? [])} format={(v) => fRatio(v)} />
          <Tabla title="Márgenes" sub="% sobre ingresos" cols={periodos} filas={margFilas} format={(v) => fPct(v)} />
        </div>

        {/* balance + flujo de caja */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <Tabla title="Balance" sub="USD millones" cols={periodos} filas={asFilas(data?.tablas.balance ?? [])} format={fMill} />
          <Tabla title="Flujo de caja" sub="USD millones" cols={periodos} filas={asFilas(data?.tablas.cashflow ?? [])} format={fMill} />
        </div>

        {/* segmentos */}
        <Tabla
          title="Ingresos por segmento"
          sub="USD millones · trimestral"
          cols={data?.segmentos.periodos ?? []}
          filas={segFilas}
          format={fMill}
        />

        {!loading && !data && (
          <div className="text-[11px] text-[var(--t-text-muted)] px-2 py-6 text-center">sin datos para esta empresa</div>
        )}
      </div>
    </div>
  );
}
