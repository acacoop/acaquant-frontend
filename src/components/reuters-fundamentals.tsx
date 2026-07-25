"use client";

import { useMemo, useState } from "react";

import { usePersistedState } from "@/lib/use-persisted-state";
import { usePoll } from "@/lib/use-poll";

// TRADING → REUTERS → sub-vista FUNDAMENTALS: el "scanner" de fundamentals.
// Cada fila una empresa, cada columna una métrica de la ficha (valuación /
// negocio / salud) — para COMPARAR. Buscador multi-empresa (AAPL, MSFT NVDA…),
// columnas ordenables y ocultables, click en fila abre la ficha.
const POLL_MS = 60_000;   // los fundamentals cambian 1 vez por día

interface FundRow {
  ticker: string;
  ric: string | null;
  nombre: string | null;
  industria: string | null;
  market_cap: number | null;
  ev: number | null;
  pe: number | null;
  fwd_pe: number | null;
  ev_ebitda: number | null;
  fwd_ev_ebitda: number | null;
  ev_ebit: number | null;
  p_bv: number | null;
  div_yield: number | null;
  revenue: number | null;
  gross_profit: number | null;
  ebitda: number | null;
  ebit: number | null;
  net_income: number | null;
  fcf: number | null;
  capex: number | null;
  margen_bruto: number | null;
  margen_operativo: number | null;
  margen_neto: number | null;
  deuda_total: number | null;
  caja: number | null;
  deuda_neta_ebitda: number | null;
  current_ratio: number | null;
  quick_ratio: number | null;
  min_52s: number | null;
  max_52s: number | null;
  proximo_balance: string | null;
}

type Key = keyof FundRow;

function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

function fmtGrande(v: unknown): string {
  const n = num(v);
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toLocaleString("es-AR", { maximumFractionDigits: 2 })} T`;
  if (abs >= 1e9) return `${(n / 1e9).toLocaleString("es-AR", { maximumFractionDigits: 1 })} B`;
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 0 })} M`;
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

// Resultados en MILLONES de USD.
function fmtMill(v: unknown): string {
  const n = num(v);
  if (n === null) return "—";
  if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} B`;
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })} M`;
}

function fmtX(v: unknown): string {
  const n = num(v);
  return n === null ? "—" : `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}x`;
}

function fmtPctPlano(v: unknown): string {
  const n = num(v);
  return n === null ? "—" : `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

function fmtN(v: unknown, dec = 2): string {
  const n = num(v);
  return n === null ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: dec });
}

function varClass(v: unknown): string {
  const n = num(v);
  if (n === null || n === 0) return "text-[var(--t-text-dim)]";
  return n > 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]";
}

interface ColDef {
  key: Key;
  label: string;
  title?: string;
  fija?: boolean;
  texto?: boolean;
  render: (r: FundRow) => React.ReactNode;
}

const COLS: ColDef[] = [
  {
    key: "ticker", label: "EMPRESA", fija: true, texto: true,
    render: (r) => (
      <>
        <span className="text-[var(--t-accent)] font-semibold">{r.ticker}</span>
        <span className="ml-1.5 text-[9px] text-[var(--t-text-dim)] truncate">{r.nombre ?? ""}</span>
      </>
    ),
  },
  { key: "market_cap", label: "MKT CAP", title: "Capitalización bursátil: precio × acciones en circulación — lo que vale el equity de la empresa en bolsa.", render: (r) => fmtGrande(r.market_cap) },
  { key: "pe", label: "P/E", title: "Precio ÷ ganancia por acción de los últimos 12 meses: cuántos años de ganancias actuales pagás por la empresa. Alto = cara o con mucha expectativa de crecimiento. Vacío = la empresa pierde plata.", render: (r) => fmtX(r.pe) },
  { key: "fwd_pe", label: "P/E FWD", title: "P/E forward: precio ÷ ganancia ESTIMADA por el consenso para el próximo año. Más útil que el P/E común en empresas que crecen rápido.", render: (r) => fmtX(r.fwd_pe) },
  { key: "ev_ebitda", label: "EV/EBITDA", title: "Enterprise Value (market cap + deuda − caja) ÷ EBITDA: cuántos años de generación operativa vale la empresa ENTERA. Permite comparar empresas con distinto endeudamiento. Menos = más barata.", render: (r) => fmtX(r.ev_ebitda) },
  { key: "fwd_ev_ebitda", label: "EV/EBITDA FWD", title: "EV/EBITDA con el EBITDA estimado para el próximo año.", render: (r) => fmtX(r.fwd_ev_ebitda) },
  { key: "p_bv", label: "P/VL", title: "Precio ÷ valor libro contable por acción. Debajo de 1 la empresa cotiza por menos que su patrimonio contable.", render: (r) => fmtX(r.p_bv) },
  { key: "div_yield", label: "DIV %", title: "Dividend yield: dividendos pagados en el año ÷ precio — la renta anual por dividendos que pagás hoy.", render: (r) => fmtPctPlano(r.div_yield) },
  { key: "revenue", label: "INGRESOS", title: "Ventas totales del último año fiscal, en USD.", render: (r) => fmtMill(r.revenue) },
  { key: "gross_profit", label: "UT. BRUTA", title: "Utilidad bruta: ingresos − costo directo de lo vendido.", render: (r) => fmtMill(r.gross_profit) },
  { key: "ebitda", label: "EBITDA", title: "Resultado antes de intereses, impuestos, depreciación y amortización ≈ la caja que genera el negocio operando, sin efectos financieros ni contables.", render: (r) => <span className={varClass(r.ebitda)}>{fmtMill(r.ebitda)}</span> },
  { key: "net_income", label: "RESULTADO", title: "Ganancia neta final del año, después de TODO (costos, intereses, impuestos).", render: (r) => <span className={varClass(r.net_income)}>{fmtMill(r.net_income)}</span> },
  { key: "fcf", label: "FCF", title: "Free cash flow: la caja que queda después de operar Y de invertir (capex) — la plata realmente disponible para pagar deuda, dividendos o recomprar acciones.", render: (r) => <span className={varClass(r.fcf)}>{fmtMill(r.fcf)}</span> },
  { key: "capex", label: "CAPEX", title: "Inversión del año en activos fijos (plantas, equipos). Negativo porque es salida de caja.", render: (r) => fmtMill(r.capex) },
  { key: "margen_bruto", label: "MG BRUTO", title: "De cada $100 vendidos, cuántos quedan después del costo directo de producir.", render: (r) => fmtPctPlano(r.margen_bruto) },
  { key: "margen_operativo", label: "MG OPER", title: "De cada $100 vendidos, cuántos quedan después de TODOS los costos de operar (antes de intereses e impuestos). Negativo = el negocio pierde plata operando.", render: (r) => <span className={varClass(r.margen_operativo)}>{fmtPctPlano(r.margen_operativo)}</span> },
  { key: "margen_neto", label: "MG NETO", title: "De cada $100 vendidos, cuántos llegan como ganancia final al accionista.", render: (r) => <span className={varClass(r.margen_neto)}>{fmtPctPlano(r.margen_neto)}</span> },
  { key: "deuda_total", label: "DEUDA", title: "Deuda financiera total (corto + largo plazo), en USD.", render: (r) => fmtGrande(r.deuda_total) },
  { key: "caja", label: "CAJA", title: "Efectivo y equivalentes disponibles, en USD.", render: (r) => fmtGrande(r.caja) },
  { key: "deuda_neta_ebitda", label: "DN/EBITDA", title: "(Deuda − caja) ÷ EBITDA: cuántos años de EBITDA hacen falta para pagar la deuda neta. <1 = holgado · >3 = muy apalancada · vacío = EBITDA negativo o caja mayor a la deuda.", render: (r) => fmtX(r.deuda_neta_ebitda) },
  { key: "current_ratio", label: "CURRENT", title: "Activos corrientes ÷ pasivos corrientes: capacidad de cubrir lo que vence en el año. >1 cubre; muy alto puede ser caja ociosa.", render: (r) => fmtN(r.current_ratio) },
  {
    key: "proximo_balance", label: "REPORTA", texto: true,
    title: "Fecha estimada de presentación del próximo balance trimestral.",
    render: (r) => {
      if (!r.proximo_balance) return "—";
      const d = new Date(r.proximo_balance);
      return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
    },
  },
];

export function ReutersFundamentals({ onFicha }: { onFicha: (ticker: string) => void }) {
  const { data: rows } = usePoll<FundRow[]>(
    "/api/research1816/reuters/fundamentals", [], POLL_MS, { fetchOnMount: true },
  );
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 } | null>(null);
  const [ocultas, setOcultas] = usePersistedState<Partial<Record<Key, boolean>>>(
    "reuters.fund.ocultas", {}, "local",
  );
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const visibles = useMemo(() => COLS.filter((c) => c.fija || !ocultas[c.key]), [ocultas]);
  const nOcultas = COLS.length - visibles.length;

  const clickSort = (col: ColDef) => {
    setSort((s) => {
      if (s?.key === col.key) return { key: col.key, dir: s.dir === 1 ? -1 : 1 };
      return { key: col.key, dir: col.texto ? 1 : -1 };
    });
  };

  const filas = useMemo(() => {
    let base = Array.isArray(rows) ? [...rows] : [];
    // Buscador MULTI-empresa: "AAPL, MSFT NVDA" → matchea cualquiera de los términos.
    const terminos = busqueda.toUpperCase().split(/[\s,;]+/).filter(Boolean);
    if (terminos.length) {
      base = base.filter((r) => terminos.some((t) =>
        r.ticker.toUpperCase().includes(t) ||
        (r.nombre ?? "").toUpperCase().includes(t)));
    }
    if (!sort) return base;
    const { key, dir } = sort;
    return base.sort((a, b) => {
      const va = a[key];
      const vb = b[key];
      if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * dir;
      }
      return ((va as number) - (vb as number)) * dir;
    });
  }, [rows, sort, busqueda]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[10px] text-[var(--t-text-muted)]">
          {filas.length} empresa{filas.length === 1 ? "" : "s"}
        </span>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="comparar: AAPL, MSFT, NVDA…"
          spellCheck={false}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[240px]"
        />
        {sort && (
          <button onClick={() => setSort(null)}
            className="text-[9px] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] border border-[var(--t-border-2)] px-1.5 py-0.5"
            title="Volver al orden original">
            ✕ orden
          </button>
        )}
        <div className="relative">
          <button onClick={() => setSelectorAbierto((v) => !v)}
            className={`text-[9px] tracking-widest border px-1.5 py-0.5 transition-colors ${
              selectorAbierto || nOcultas > 0
                ? "text-[var(--t-accent)] border-[var(--t-accent)]"
                : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}>
            COLUMNAS{nOcultas > 0 ? ` (${nOcultas} ocultas)` : ""} ▾
          </button>
          {selectorAbierto && (
            <div className="absolute left-0 top-full mt-1 z-30 bg-[var(--t-surface)] border border-[var(--t-border-2)] shadow-lg p-2 max-h-[60vh] overflow-auto min-w-[180px]">
              {COLS.filter((c) => !c.fija).map((c) => (
                <label key={c.key} className="flex items-center gap-2 px-1 py-0.5 text-[10px] text-[var(--t-text)] cursor-pointer hover:bg-[var(--t-surface-2)]">
                  <input type="checkbox" checked={!ocultas[c.key]}
                    onChange={() => setOcultas((o) => ({ ...o, [c.key]: !o[c.key] }))} />
                  {c.label}
                </label>
              ))}
              <button onClick={() => setOcultas({})}
                className="mt-1 w-full text-[9px] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] border border-[var(--t-border-2)] px-1.5 py-0.5">
                Mostrar todas
              </button>
            </div>
          )}
        </div>
        <span className="ml-auto text-[9px] text-[var(--t-text-dim)]">datos del último año fiscal · se actualizan a diario</span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto" onClick={() => selectorAbierto && setSelectorAbierto(false)}>
        {filas.length === 0 ? (
          <div className="p-4 text-[11px] text-[var(--t-text-muted)]">
            Sin fundamentals todavía — se cargan solos con la primera pasada diaria del feed de la oficina.
          </div>
        ) : (
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10">
              <tr className="text-[var(--t-text-dim)] tracking-widest text-[9px]">
                {visibles.map((c) => (
                  <th key={c.key} onClick={() => clickSort(c)}
                    title={c.title ?? "Click para ordenar"}
                    className={`px-2 py-2 cursor-pointer select-none hover:text-[var(--t-accent)] whitespace-nowrap ${c.key === "ticker" ? "text-left" : "text-right"} ${sort?.key === c.key ? "text-[var(--t-accent)]" : ""}`}>
                    {c.label}
                    {c.title && <span className="ml-0.5 text-[7px] align-super opacity-50">?</span>}
                    {sort?.key === c.key && <span className="ml-0.5">{sort.dir === -1 ? "▼" : "▲"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.ticker}
                  onClick={() => onFicha(r.ticker)}
                  title={`Abrir la ficha de ${r.ticker}`}
                  className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)] cursor-pointer">
                  {visibles.map((c) => (
                    <td key={c.key}
                      className={`px-2 py-1.5 whitespace-nowrap text-[var(--t-text-dim)] ${c.key === "ticker" ? "text-left px-3 max-w-[240px] overflow-hidden" : "text-right"}`}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
