"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { usePersistedState } from "@/lib/use-persisted-state";
import { usePoll } from "@/lib/use-poll";

// RESEARCH → RENTA VARIABLE INTERNACIONAL → sub-vista FUNDAMENTALS.
//
// Rediseñada 2026-08-07 a CUATRO cuadrantes del 50% (mismo patrón que la ficha
// y que casi toda la app). La tabla sola contestaba "cómo está esta empresa" pero
// no "cómo está el conjunto", que es la pregunta de research:
//
//   ┌─ SCREENER (tabla, columnas curadas) ─┬─ AGREGADO (Σ del universo en el tiempo) ─┐
//   ├─ DISPERSIÓN (P/E vs. lo que elijas) ─┴─ COMPOSICIÓN (peso de cada rubro) ───────┤
//
// Todo el panel se filtra por RUBRO (catálogo propio `mercado.rubros`, el mismo
// del scanner de renta variable) para comparar manzanas con manzanas.
const POLL_MS = 60_000;   // los fundamentals cambian 1 vez por día

interface FundRow {
  ticker: string;
  ric: string | null;
  nombre: string | null;
  rubro: string | null;
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

interface PuntoAgregado {
  periodo: string;
  n: number;
  [metrica: string]: number | string | null;
}

interface Agregado {
  periodo: string;
  rubro: string | null;
  canasta: string;
  puntos: PuntoAgregado[];
  empresas: string[];
  excluidas: { ticker: string; motivo: string }[];
}

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

// Etiqueta CORTA para ejes y barras (millones de USD → "1,2 B" / "340 M").
function cortoUSD(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} T`;
  if (abs >= 1000) return `${(v / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} B`;
  return `${v.toLocaleString("es-AR", { maximumFractionDigits: 0 })} M`;
}

function cortoPct(v: number): string {
  return `${v.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
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

// Paleta para colorear por RUBRO (dispersión y composición). Se asigna por
// posición del rubro ordenado alfabéticamente → el mismo rubro conserva su
// color entre los dos paneles.
const PALETA = [
  "#3b82f6", "#ff9900", "#10b981", "#a855f7", "#ef4444", "#06b6d4",
  "#eab308", "#ec4899", "#84cc16", "#f97316", "#8b5cf6", "#14b8a6",
  "#f43f5e", "#22c55e", "#0ea5e9", "#d946ef",
];
const SIN_RUBRO = "sin rubro";

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
  {
    key: "rubro", label: "RUBRO", texto: true,
    title: "Clasificación de negocio propia (la misma del scanner de renta variable, editable en Manager → Títulos → Renta Variable). Es lo que permite comparar contra pares y no contra todo el mercado.",
    render: (r) => <span className="text-[var(--t-text-dim)]">{r.rubro ?? "—"}</span>,
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

// La tabla ahora vive en un cuadrante del 50% → NO puede mostrar las 22
// columnas. Default curado (lo que se mira primero); el resto se prende desde
// COLUMNAS. Clave de preferencia .v2 para que la del layout viejo no reviva
// las 22 (mismo truco que el tablero de cotizaciones).
const OCULTAS_DEFAULT: Partial<Record<Key, boolean>> = Object.fromEntries(
  (["ev", "fwd_pe", "fwd_ev_ebitda", "p_bv", "div_yield", "gross_profit", "fcf",
    "capex", "margen_bruto", "margen_operativo", "deuda_total", "caja",
    "current_ratio", "proximo_balance"] as Key[]).map((k) => [k, true]),
);

// ── métricas graficables ────────────────────────────────────────────────────
interface MetricaDef { key: string; label: string; color: string }

const GRUPOS_AGREGADO: Record<string, { label: string; pct?: boolean; series: MetricaDef[] }> = {
  resultados: {
    label: "RESULTADOS",
    series: [
      { key: "revenue", label: "Ingresos", color: "#3b82f6" },
      { key: "ebitda", label: "EBITDA", color: "#ff9900" },
      { key: "net_income", label: "Resultado", color: "#10b981" },
      { key: "fcf", label: "FCF", color: "#a855f7" },
      { key: "capex", label: "Capex", color: "#ef4444" },
    ],
  },
  margenes: {
    label: "MÁRGENES",
    pct: true,
    series: [
      { key: "margen_bruto", label: "Bruto", color: "#3b82f6" },
      { key: "margen_operativo", label: "Operativo", color: "#ff9900" },
      { key: "margen_neto", label: "Neto", color: "#10b981" },
    ],
  },
  salud: {
    label: "SALUD",
    series: [
      { key: "deuda", label: "Deuda total", color: "#ef4444" },
      { key: "caja", label: "Caja", color: "#10b981" },
    ],
  },
};
type GrupoAgregado = keyof typeof GRUPOS_AGREGADO;

// Ejes disponibles en la dispersión. `pct`/`x` solo definen cómo se formatea.
const EJES: { key: Key; label: string; fmt: (v: number) => string }[] = [
  { key: "pe", label: "P/E", fmt: (v) => `${fmtN(v, 1)}x` },
  { key: "fwd_pe", label: "P/E FWD", fmt: (v) => `${fmtN(v, 1)}x` },
  { key: "ev_ebitda", label: "EV/EBITDA", fmt: (v) => `${fmtN(v, 1)}x` },
  { key: "p_bv", label: "P/VL", fmt: (v) => `${fmtN(v, 1)}x` },
  { key: "margen_neto", label: "MG NETO", fmt: cortoPct },
  { key: "margen_operativo", label: "MG OPER", fmt: cortoPct },
  { key: "margen_bruto", label: "MG BRUTO", fmt: cortoPct },
  { key: "div_yield", label: "DIV %", fmt: cortoPct },
  { key: "deuda_neta_ebitda", label: "DN/EBITDA", fmt: (v) => `${fmtN(v, 1)}x` },
  { key: "market_cap", label: "MKT CAP", fmt: (v) => fmtGrande(v) },
  { key: "revenue", label: "INGRESOS", fmt: cortoUSD },
  { key: "ebitda", label: "EBITDA", fmt: cortoUSD },
];

// Métricas sumables para la composición por rubro (foto del último año fiscal).
// Van TODAS como columnas — sin selector: un rubro puede pesar 20% del market
// cap y 2% del capex, y esa comparación es justamente lo que interesa.
// Subconjunto NUMÉRICO de las columnas: el acumulador se indexa por estas, y si
// se usara `Key` (que incluye `rubro`, texto) los tipos se mezclarían.
type MetricaComp = "market_cap" | "revenue" | "ebitda" | "net_income" | "capex";

const COMPOSICION: { key: MetricaComp; label: string; fmt: (v: number) => string }[] = [
  { key: "market_cap", label: "MKT CAP", fmt: (v) => fmtGrande(v) },
  { key: "revenue", label: "INGRESOS", fmt: cortoUSD },
  { key: "ebitda", label: "EBITDA", fmt: cortoUSD },
  { key: "net_income", label: "RESULTADO", fmt: cortoUSD },
  { key: "capex", label: "CAPEX", fmt: cortoUSD },
];

// Tabs del cuadrante de abajo a la derecha.
type TabComp = "composicion" | "segmentos" | "geografia";
const TABS_COMP: { v: TabComp; label: string; titulo: string; ayuda: string }[] = [
  {
    v: "composicion", label: "COMPOSICIÓN", titulo: "COMPOSICIÓN POR RUBRO",
    ayuda: "Cuánto pesa cada rubro en market cap, ingresos, EBITDA, resultado y capex — todo junto.",
  },
  {
    v: "segmentos", label: "SEGMENTOS", titulo: "SEGMENTOS · DE DÓNDE SALE LA PLATA",
    ayuda: "Ranking de segmentos de negocio del universo filtrado, con lo que factura cada uno. "
      + "Ojo: cada empresa nombra sus segmentos a su manera (Apple y Coca-Cola los reportan por región).",
  },
  {
    v: "geografia", label: "GEOGRAFÍA", titulo: "GEOGRAFÍA · DE DÓNDE SALE LA PLATA",
    ayuda: "Ranking por país/región: acá los nombres sí se repiten entre empresas, "
      + "así que la suma es directamente comparable.",
  },
];

// ── medición del panel (los SVG se dibujan al tamaño REAL del cuadrante) ────
function useTamano<T extends HTMLElement>(minW = 240, minH = 140) {
  const ref = useRef<T | null>(null);
  const [dim, setDim] = useState({ w: 480, h: 220 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setDim({ w: Math.max(el.clientWidth, minW), h: Math.max(el.clientHeight, minH) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [minW, minH]);
  return { ref, dim };
}

// Tope "redondo" (1/2/2.5/5 × 10^k) para que el eje se lea en números humanos.
function redondear(v: number): number {
  if (v <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  const nm = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nm * p;
}

// n+1 valores repartidos parejo entre lo y hi (marcas del eje).
function ticksLineales(lo: number, hi: number, n = 4): number[] {
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) return [lo];
  const paso = (hi - lo) / n;
  return Array.from({ length: n + 1 }, (_, i) => lo + paso * i);
}

// Cuantil (interpolado). Lo usa la dispersión para RECORTAR EXTREMOS: con 184
// empresas, un solo P/E de 1.043x aplasta a las otras 183 contra el margen y el
// gráfico deja de decir nada.
function cuantil(vs: number[], q: number): number {
  if (!vs.length) return 0;
  const s = [...vs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

// Marco del área de dibujo: eje Y a la izquierda y eje X abajo. Sin esto los
// gráficos "flotan" y no se sabe dónde empieza y termina el lienzo.
function Marco({ x0, x1, y0, y1 }: { x0: number; x1: number; y0: number; y1: number }) {
  return (
    <>
      <line x1={x0} x2={x0} y1={y0} y2={y1} stroke="var(--t-border-2)" strokeWidth={1} />
      <line x1={x0} x2={x1} y1={y1} y2={y1} stroke="var(--t-border-2)" strokeWidth={1} />
    </>
  );
}

type CuadranteId = "screener" | "agregado" | "dispersion" | "composicion";

function Cuadrante({ id, titulo, children, extra, maxi, setMaxi }: {
  id: CuadranteId;
  titulo: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
  maxi: CuadranteId | null;
  setMaxi: (m: CuadranteId | null) => void;
}) {
  const esMax = maxi === id;
  if (maxi && !esMax) return null;
  return (
    <div className={`bg-[var(--t-panel)] min-w-0 min-h-0 flex flex-col border border-[var(--t-border)] ${esMax ? "col-span-2 row-span-2" : ""}`}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b-2 border-[var(--t-border-2)] bg-[var(--t-surface)] shrink-0">
        <span className="text-[9px] tracking-widest font-bold text-[var(--t-accent)] shrink-0">{titulo}</span>
        <div className="ml-auto flex items-center gap-1.5 min-w-0">
          {extra}
          <button
            onClick={() => setMaxi(esMax ? null : id)}
            title={esMax ? "Restaurar los 4 paneles" : "Maximizar este panel"}
            className="px-1.5 py-0.5 text-[10px] leading-none border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] transition-colors shrink-0"
          >
            {esMax ? "🗗" : "⛶"}
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

// Botón chiquito de barra (toggle). Unifica los ~8 selectores del panel.
function Chip({ activo, onClick, title, children }: {
  activo: boolean; onClick: () => void; title?: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title}
      className={`px-1.5 py-0.5 text-[8px] font-semibold border transition-colors whitespace-nowrap ${
        activo
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
      }`}>
      {children}
    </button>
  );
}

function Selector<T extends string>({ value, onChange, opciones, title }: {
  value: T; onChange: (v: T) => void; opciones: { v: T; label: string }[]; title?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} title={title}
      className="text-[8px] tracking-wide border border-[var(--t-border-2)] px-1 py-0.5 bg-[var(--t-panel)] text-[var(--t-text-dim)] outline-none cursor-pointer">
      {opciones.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
    </select>
  );
}

// ── CUADRANTE 2: el universo SUMADO en el tiempo ────────────────────────────
function ChartAgregado({ data, grupo, cargando }: {
  data: Agregado | null; grupo: GrupoAgregado; cargando: boolean;
}) {
  const [apagadas, setApagadas] = useState<Set<string>>(new Set());
  const def = GRUPOS_AGREGADO[grupo];
  const activas = def.series.filter((s) => !apagadas.has(s.key));
  const puntos = data?.puntos ?? [];
  const { ref, dim } = useTamano<HTMLDivElement>();

  const fmt = def.pct ? cortoPct : cortoUSD;
  const vals = puntos.flatMap((p) => activas.map((s) => num(p[s.key])))
    .filter((v): v is number => v !== null);
  const topPos = redondear(Math.max(0, ...vals.filter((v) => v > 0)));
  const topNeg = redondear(Math.max(0, ...vals.filter((v) => v < 0).map((v) => -v)));

  // Área de dibujo con márgenes FIJOS: el eje Y vive en ML, las etiquetas de
  // período abajo de MB. Antes las barras se comían el margen y quedaban
  // pegadas al borde (o directamente afuera).
  const W = dim.w;
  const H = dim.h;
  const ML = 60, MR = 12, MT = 12, MB = 22;
  const alto = Math.max(H - MT - MB, 20);
  const escala = alto / ((topPos + topNeg) || 1);
  const cero = MT + topPos * escala;
  const slot = (W - ML - MR) / Math.max(puntos.length, 1);
  // Marcas parejas de arriba a abajo (siempre incluye el 0 porque el dominio
  // va de -topNeg a +topPos y el 0 cae adentro).
  const ticks = topNeg > 0
    ? [...ticksLineales(0, topPos, 2), ...ticksLineales(-topNeg, 0, 2).slice(0, -1)]
    : ticksLineales(0, topPos, 4);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1.5 shrink-0">
        {def.series.map((s) => (
          <button key={s.key}
            onClick={() => setApagadas((prev) => {
              const n = new Set(prev);
              if (n.has(s.key)) n.delete(s.key); else n.add(s.key);
              return n;
            })}
            className={`flex items-center gap-1 text-[8px] px-1 py-0.5 border border-[var(--t-border-2)] transition-colors ${
              apagadas.has(s.key) ? "text-[var(--t-text-dim)] opacity-50" : "text-[var(--t-text)]"
            }`}>
            <span className="w-2 h-2 inline-block" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
        <span className="ml-auto text-[8px] text-[var(--t-text-dim)]">
          {def.pct ? "% del agregado" : "USD"}
        </span>
      </div>
      {puntos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4 text-center text-[10px] text-[var(--t-text-dim)]">
          {cargando
            ? "cargando…"
            : "sin series todavía — se llenan con la próxima pasada diaria del feed de la oficina"}
        </div>
      ) : (
        <div ref={ref} className="flex-1 min-h-0 px-2 pb-1 overflow-hidden">
          <svg width={W} height={H}>
            {/* grilla + valores del eje Y */}
            {ticks.map((t) => {
              const y = cero - t * escala;
              return (
                <g key={t}>
                  <line x1={ML} x2={W - MR} y1={y} y2={y} stroke="var(--t-border-2)"
                    strokeWidth={t === 0 ? 1 : 0.5}
                    strokeDasharray={t === 0 ? undefined : "3,4"} />
                  <text x={ML - 6} y={y + 3} textAnchor="end"
                    className="fill-[var(--t-text-muted)] font-medium" fontSize={9}
                    fontFamily="JetBrains Mono, monospace">
                    {fmt(t)}
                  </text>
                </g>
              );
            })}
            <Marco x0={ML} x1={W - MR} y0={MT} y1={H - MB} />
            {puntos.map((p, i) => {
              // 12% de aire a cada lado del slot para que las barras de un
              // período no se toquen con las del siguiente.
              const x0 = ML + i * slot + slot * 0.12;
              const util = slot * 0.76;
              const ancho = util / Math.max(activas.length, 1);
              return (
                <g key={p.periodo}>
                  {activas.map((s, j) => {
                    const v = num(p[s.key]);
                    if (v === null) return null;
                    const h = Math.max(1.5, Math.abs(v) * escala);
                    const y = v >= 0 ? cero - h : cero;
                    const cobertura = num(p[`${s.key}_n`]);
                    return (
                      <rect key={s.key} x={x0 + j * ancho}
                        width={Math.max(ancho - (activas.length > 1 ? 1.5 : 0), 1.5)}
                        y={y} height={h} fill={s.color} opacity={0.9}>
                        <title>{`${p.periodo} · ${s.label}: ${fmt(v)}${
                          cobertura !== null ? ` (${cobertura} empresa${cobertura === 1 ? "" : "s"})` : ""}`}</title>
                      </rect>
                    );
                  })}
                  <text x={ML + i * slot + slot / 2} y={H - MB + 13} textAnchor="middle"
                    className="fill-[var(--t-text-muted)] font-medium" fontSize={9.5}
                    fontFamily="JetBrains Mono, monospace">
                    {p.periodo}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}

// ── CUADRANTE 3: dispersión (por default P/E contra margen neto) ────────────
function ChartDispersion({ filas, colorDe, ejeX, ejeY, onFicha, extremos, setExtremos }: {
  filas: FundRow[];
  colorDe: (rubro: string | null) => string;
  ejeX: typeof EJES[number];
  ejeY: typeof EJES[number];
  onFicha: (t: string) => void;
  extremos: boolean;
  setExtremos: (v: boolean) => void;
}) {
  const { ref, dim } = useTamano<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const puntos = filas
    .map((r) => ({ r, x: num(r[ejeX.key]), y: num(r[ejeY.key]) }))
    .filter((p): p is { r: FundRow; x: number; y: number } => p.x !== null && p.y !== null);

  // RECORTE DE EXTREMOS: el dominio va del percentil 2 al 98 (con aire), no del
  // mínimo al máximo. Con 184 empresas basta un P/E de 1.043x o uno de −71x
  // para que las otras 183 queden apiladas en una esquina. Los que caen afuera
  // NO se esconden: se dibujan pegados al borde y huecos, para que se vea que
  // están y en qué dirección. El botón EXTREMOS muestra el rango completo.
  const dominio = (vs: number[]): [number, number] => {
    if (!vs.length) return [0, 1];
    let lo = extremos ? Math.min(...vs) : cuantil(vs, 0.02);
    let hi = extremos ? Math.max(...vs) : cuantil(vs, 0.98);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  };
  const [x0, x1] = dominio(puntos.map((p) => p.x));
  const [y0, y1] = dominio(puntos.map((p) => p.y));
  const fuera = puntos.filter((p) => p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1).length;

  const W = dim.w;
  const H = dim.h;
  const ML = 56, MB = 26, MT = 10, MR = 14;
  const ancho = Math.max(W - ML - MR, 10);
  const alto = Math.max(H - MB - MT, 10);
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  const px = (v: number) => ML + clamp((v - x0) / (x1 - x0), 0, 1) * ancho;
  const py = (v: number) => H - MB - clamp((v - y0) / (y1 - y0), 0, 1) * alto;
  // Con muchos puntos los nombres se pisan y no se lee nada → etiqueta fija
  // solo si son pocos; con muchos, aparece al pasar el mouse.
  const etiquetar = puntos.length <= 35;

  return (
    <div className="h-full flex flex-col min-h-0">
      {puntos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4 text-center text-[10px] text-[var(--t-text-dim)]">
          ninguna empresa del filtro tiene {ejeX.label} y {ejeY.label} a la vez
          {" "}— probá con otras métricas.
        </div>
      ) : (
        <div ref={ref} className="flex-1 min-h-0 overflow-hidden">
          <svg width={W} height={H}>
            {/* grilla horizontal + valores del eje Y */}
            {ticksLineales(y0, y1, 4).map((t, i) => (
              <g key={`y${i}`}>
                <line x1={ML} x2={W - MR} y1={py(t)} y2={py(t)}
                  stroke="var(--t-border-2)" strokeWidth={0.5} strokeDasharray="3,4" />
                <text x={ML - 5} y={py(t) + 3} textAnchor="end" fontSize={8.5}
                  className="fill-[var(--t-text-muted)]" fontFamily="JetBrains Mono, monospace">
                  {ejeY.fmt(t)}
                </text>
              </g>
            ))}
            {/* grilla vertical + valores del eje X */}
            {ticksLineales(x0, x1, 4).map((t, i) => (
              <g key={`x${i}`}>
                <line x1={px(t)} x2={px(t)} y1={MT} y2={H - MB}
                  stroke="var(--t-border-2)" strokeWidth={0.5} strokeDasharray="3,4" />
                <text x={px(t)} y={H - MB + 12} textAnchor="middle" fontSize={8.5}
                  className="fill-[var(--t-text-muted)]" fontFamily="JetBrains Mono, monospace">
                  {ejeX.fmt(t)}
                </text>
              </g>
            ))}
            <Marco x0={ML} x1={W - MR} y0={MT} y1={H - MB} />
            {puntos.map(({ r, x, y }) => {
              const recortado = x < x0 || x > x1 || y < y0 || y > y1;
              const activo = hover === r.ticker;
              return (
                <g key={r.ticker} className="cursor-pointer"
                  onClick={() => onFicha(r.ticker)}
                  onMouseEnter={() => setHover(r.ticker)}
                  onMouseLeave={() => setHover((h) => (h === r.ticker ? null : h))}>
                  <circle cx={px(x)} cy={py(y)} r={activo ? 5.5 : 4}
                    fill={recortado ? "none" : colorDe(r.rubro)}
                    stroke={colorDe(r.rubro)} strokeWidth={recortado ? 1.5 : 0}
                    opacity={activo ? 1 : 0.85}>
                    <title>{`${r.ticker} — ${r.nombre ?? ""}\n${r.rubro ?? SIN_RUBRO}\n`
                      + `${ejeX.label}: ${ejeX.fmt(x)}\n${ejeY.label}: ${ejeY.fmt(y)}`
                      + (recortado ? "\n(fuera de escala — mostrado en el borde)" : "")}</title>
                  </circle>
                  {(etiquetar || activo) && (
                    <text x={px(x) + 6} y={py(y) + 3} fontSize={activo ? 9 : 8}
                      className={activo ? "fill-[var(--t-text)] font-semibold" : "fill-[var(--t-text-dim)]"}
                      style={{ pointerEvents: "none" }}
                      fontFamily="JetBrains Mono, monospace">
                      {r.ticker}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      )}
      <div className="flex items-center gap-2 px-2 py-1 text-[8px] text-[var(--t-text-dim)] border-t border-[var(--t-border)] shrink-0">
        <span>
          {puntos.length} de {filas.length} graficadas
          {puntos.length < filas.length && " · al resto le falta alguno de los dos datos"}
        </span>
        {ejeX.key === ejeY.key && (
          <span className="text-[var(--t-neg)]">
            · los dos ejes son {ejeX.label}: cambiá uno para que el gráfico diga algo
          </span>
        )}
        <button onClick={() => setExtremos(!extremos)}
          title={extremos
            ? "Volver a recortar el 2% de cada punta para que se vea el grueso"
            : "Mostrar el rango COMPLETO (un solo outlier puede aplastar el resto)"}
          className={`ml-auto px-1.5 py-0.5 border transition-colors shrink-0 ${
            extremos
              ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
              : "border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
          }`}>
          {extremos ? "RANGO COMPLETO" : `RECORTADO${fuera ? ` · ${fuera} en el borde` : ""}`}
        </button>
      </div>
    </div>
  );
}

// ── CUADRANTE 4 · tab COMPOSICIÓN — todas las métricas JUNTAS ───────────────
// Antes había un dropdown para elegir UNA métrica: obligaba a mirar de a una y
// no dejaba comparar (un rubro puede pesar 20% del market cap y 2% del capex —
// eso es justo lo interesante). Ahora es una tabla: una fila por rubro, una
// COLUMNA POR MÉTRICA, con la barra de participación dentro de cada celda.
function TablaComposicion({ filas, colorDe, rubroActivo, onRubro }: {
  filas: FundRow[];
  colorDe: (rubro: string | null) => string;
  rubroActivo: string;
  onRubro: (r: string) => void;
}) {
  const [orden, setOrden] = useState<MetricaComp>("market_cap");

  const { datos, maximos, totales } = useMemo(() => {
    const acum = new Map<string, { n: number } & Partial<Record<MetricaComp, number>>>();
    for (const r of filas) {
      const k = r.rubro ?? SIN_RUBRO;
      const fila = acum.get(k) ?? { n: 0 };
      fila.n += 1;
      for (const c of COMPOSICION) {
        const v = num(r[c.key]);
        if (v !== null) fila[c.key] = (fila[c.key] ?? 0) + v;
      }
      acum.set(k, fila);
    }
    const lista = Array.from(acum, ([rubro, v]) => ({ rubro, ...v }));
    lista.sort((a, b) => Math.abs(b[orden] ?? 0) - Math.abs(a[orden] ?? 0));
    const maximos = Object.fromEntries(COMPOSICION.map((c) =>
      [c.key, Math.max(1, ...lista.map((f) => Math.abs(f[c.key] ?? 0)))])) as Record<MetricaComp, number>;
    const totales = Object.fromEntries(COMPOSICION.map((c) =>
      [c.key, lista.reduce((s, f) => s + (f[c.key] ?? 0), 0)])) as Record<MetricaComp, number>;
    return { datos: lista, maximos, totales };
  }, [filas, orden]);

  if (datos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-4 text-center text-[10px] text-[var(--t-text-dim)]">
        sin empresas para componer.
      </div>
    );
  }
  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)] z-10">
        <tr className="text-[var(--t-text-dim)] tracking-widest text-[8px]">
          <th className="px-2 py-1.5 text-left">RUBRO</th>
          {COMPOSICION.map((c) => (
            <th key={c.key} onClick={() => setOrden(c.key)}
              title={`Ordenar por ${c.label} (suma de todas las empresas del rubro)`}
              className={`px-2 py-1.5 text-right cursor-pointer select-none hover:text-[var(--t-accent)] whitespace-nowrap ${
                orden === c.key ? "text-[var(--t-accent)]" : ""}`}>
              {c.label}{orden === c.key && " ▼"}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {datos.map((f) => {
          const activo = rubroActivo === f.rubro;
          return (
            <tr key={f.rubro}
              onClick={() => onRubro(activo ? "" : f.rubro)}
              title={`${f.rubro} · ${f.n} empresa${f.n === 1 ? "" : "s"}\nClick para filtrar todo el panel por este rubro`}
              className={`border-b border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-surface-2)] ${
                activo ? "bg-[var(--t-surface-2)]" : ""}`}>
              <td className="px-2 py-1 max-w-[150px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 shrink-0"
                    style={{ background: colorDe(f.rubro === SIN_RUBRO ? null : f.rubro) }} />
                  <span className={`truncate ${activo ? "text-[var(--t-accent)] font-semibold" : "text-[var(--t-text)]"}`}>
                    {f.rubro}
                  </span>
                  <span className="text-[8px] text-[var(--t-text-muted)] shrink-0">{f.n}</span>
                </span>
              </td>
              {COMPOSICION.map((c) => {
                const v = f[c.key];
                const share = v !== undefined && totales[c.key]
                  ? (v / totales[c.key]) * 100 : null;
                return (
                  <td key={c.key} className="px-2 py-1 text-right relative whitespace-nowrap"
                    title={share !== null ? `${fmtN(share, 1)}% del total del universo` : undefined}>
                    {/* barra de participación DENTRO de la celda: se compara de
                        un vistazo hacia abajo, sin leer los números */}
                    <span className="absolute inset-y-[3px] right-1 opacity-20 pointer-events-none"
                      style={{
                        width: `${Math.min(Math.abs(v ?? 0) / maximos[c.key] * 90, 90)}%`,
                        background: colorDe(f.rubro === SIN_RUBRO ? null : f.rubro),
                      }} />
                    <span className={`relative ${v !== undefined && v < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"}`}>
                      {v === undefined ? "—" : c.fmt(v)}
                    </span>
                  </td>
                );
              })}
            </tr>
          );
        })}
        <tr className="border-t-2 border-[var(--t-border-2)] text-[var(--t-text)]">
          <td className="px-2 py-1 font-semibold text-[9px] tracking-widest">TOTAL</td>
          {COMPOSICION.map((c) => (
            <td key={c.key} className="px-2 py-1 text-right font-semibold whitespace-nowrap">
              {c.fmt(totales[c.key])}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

// ── CUADRANTE 4 · tabs SEGMENTOS y GEOGRAFÍA ────────────────────────────────
// De dónde sale la plata del universo que estás mirando: el backend suma el
// último período de CADA empresa por segmento (o por país) y respeta el filtro
// de rubro y el buscador, así el ranking se adapta solo.
interface FilaSegmento {
  segmento: string;
  ingresos: number;
  share: number | null;
  empresas: number;
  tickers: string[];
}

interface AgregadoSegmentos {
  tipo: string;
  total: number;
  filas: FilaSegmento[];
  otros: { ingresos: number; segmentos: number } | null;
  ajustes: number;
  empresas: number;
  fechas: { desde: string; hasta: string } | null;
}

function RankingSegmentos({ tipo, rubro, tickers }: {
  tipo: "negocio" | "geografico";
  rubro: string;
  tickers: string | null;
}) {
  const url = `/api/research1816/reuters/segmentos/agregado?tipo=${tipo}`
    + `${rubro ? `&rubro=${encodeURIComponent(rubro)}` : ""}`
    + `${tickers ? `&tickers=${encodeURIComponent(tickers)}` : ""}`;
  const { data, lastAt } = usePoll<AgregadoSegmentos | null>(url, null, POLL_MS,
    { fetchOnMount: true });

  const filas = data?.filas ?? [];
  const max = Math.max(1, ...filas.map((f) => Math.abs(f.ingresos)));

  if (filas.length === 0) {
    return (
      <div className="h-full flex items-center justify-center px-4 text-center text-[10px] text-[var(--t-text-dim)]">
        {lastAt === 0
          ? "cargando…"
          : `sin desglose ${tipo === "negocio" ? "por segmento" : "por región"} todavía`
            + " — se carga con la próxima pasada diaria del feed de la oficina"}
      </div>
    );
  }
  return (
    <div className="flex flex-col min-h-0">
      <div className="px-2 py-1 text-[8px] text-[var(--t-text-dim)] border-b border-[var(--t-border)] shrink-0">
        {data?.empresas} empresa{data?.empresas === 1 ? "" : "s"} con desglose · total{" "}
        <span className="text-[var(--t-text)]">{cortoUSD(data?.total ?? 0)}</span>
        {data?.fechas && ` · último balance de cada una (${data.fechas.desde.slice(0, 7)} a ${data.fechas.hasta.slice(0, 7)})`}
      </div>
      <div className="p-2 space-y-1">
        {filas.map((f) => (
          <div key={f.segmento} className="group"
            title={`${f.segmento}\n${cortoUSD(f.ingresos)} · ${fmtN(f.share, 1)}% del total`
              + `\n${f.empresas} empresa${f.empresas === 1 ? "" : "s"}: ${f.tickers.join(", ")}`
              + (f.empresas > f.tickers.length ? "…" : "")}>
            <div className="flex items-baseline gap-2 text-[9px]">
              <span className="truncate text-[var(--t-text)]">{f.segmento}</span>
              <span className="text-[8px] text-[var(--t-text-muted)] shrink-0 truncate max-w-[110px]">
                {f.tickers.join(" ")}
              </span>
              <span className="ml-auto text-[var(--t-text-dim)] font-mono shrink-0">
                {cortoUSD(f.ingresos)}
              </span>
              <span className="text-[var(--t-text-muted)] font-mono w-[38px] text-right shrink-0">
                {fmtN(f.share, 1)}%
              </span>
            </div>
            <div className="h-1.5 bg-[var(--t-surface-2)] mt-0.5">
              <div className="h-full bg-[var(--t-accent)] opacity-70 group-hover:opacity-100"
                style={{ width: `${Math.max(Math.abs(f.ingresos) / max * 100, 1)}%` }} />
            </div>
          </div>
        ))}
        {data?.otros && (
          <div className="text-[8px] text-[var(--t-text-dim)] pt-1">
            + otros {data.otros.segmentos} segmentos: {cortoUSD(data.otros.ingresos)}
          </div>
        )}
        {!!data?.ajustes && (
          <div className="text-[8px] text-[var(--t-text-dim)]"
            title="Eliminaciones entre segmentos y corporate: no son un negocio ni un país, pero son lo que hace cerrar la suma contra los ingresos totales de cada empresa.">
            ajustes (eliminaciones / corporate): {cortoUSD(data.ajustes)}
          </div>
        )}
      </div>
    </div>
  );
}

export function ReutersFundamentals({ onFicha }: { onFicha: (ticker: string) => void }) {
  const { data: rows } = usePoll<FundRow[]>(
    "/api/research1816/reuters/fundamentals", [], POLL_MS, { fetchOnMount: true },
  );

  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 } | null>(null);
  const [ocultas, setOcultas] = usePersistedState<Partial<Record<Key, boolean>>>(
    "reuters.fund.ocultas.v2", OCULTAS_DEFAULT, "local",
  );
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [rubroFiltro, setRubroFiltro] = usePersistedState("reuters.fund.rubro", "");
  const [maxi, setMaxi] = useState<CuadranteId | null>(null);

  // Estado de cada cuadrante
  const [periodo, setPeriodo] = usePersistedState<"anual" | "trimestral">(
    "reuters.fund.periodo", "anual");
  const [canasta, setCanasta] = usePersistedState<"constante" | "todas">(
    "reuters.fund.canasta", "constante");
  const [grupo, setGrupo] = usePersistedState<GrupoAgregado>("reuters.fund.grupo", "resultados");
  const [ejeXKey, setEjeXKey] = usePersistedState<Key>("reuters.fund.ejex", "margen_neto");
  const [ejeYKey, setEjeYKey] = usePersistedState<Key>("reuters.fund.ejey", "pe");
  const [extremos, setExtremos] = usePersistedState("reuters.fund.extremos", false);
  const [tabComp, setTabComp] = usePersistedState<TabComp>("reuters.fund.tabcomp", "composicion");

  // El AGREGADO lo calcula el backend (suma las series de todas las empresas y
  // arma la canasta) — el front no re-suma nada, así el panel no puede
  // contradecir al endpoint.
  const urlAgregado = `/api/research1816/reuters/fundamentals/agregado?periodo=${periodo}`
    + `&canasta=${canasta}${rubroFiltro ? `&rubro=${encodeURIComponent(rubroFiltro)}` : ""}`;
  const { data: agregado, lastAt } = usePoll<Agregado | null>(
    urlAgregado, null, POLL_MS, { fetchOnMount: true });

  const visibles = useMemo(() => COLS.filter((c) => c.fija || !ocultas[c.key]), [ocultas]);
  const nOcultas = COLS.length - visibles.length;

  const todas = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  // Rubros presentes (dropdown del filtro) + color estable por rubro.
  const rubros = useMemo(() => {
    const set = new Set(todas.map((r) => r.rubro).filter((x): x is string => !!x));
    return Array.from(set).sort();
  }, [todas]);
  const colorDe = useMemo(() => {
    const idx = new Map(rubros.map((r, i) => [r, PALETA[i % PALETA.length]]));
    return (rubro: string | null) => (rubro && idx.get(rubro)) || "var(--t-text-dim)";
  }, [rubros]);

  const clickSort = (col: ColDef) => {
    setSort((s) => {
      if (s?.key === col.key) return { key: col.key, dir: s.dir === 1 ? -1 : 1 };
      return { key: col.key, dir: col.texto ? 1 : -1 };
    });
  };

  // Buscador MULTI-empresa: "AAPL, MSFT NVDA" → matchea cualquiera de los términos.
  const buscadas = useMemo(() => {
    const terminos = busqueda.toUpperCase().split(/[\s,;]+/).filter(Boolean);
    if (!terminos.length) return todas;
    return todas.filter((r) => terminos.some((t) =>
      r.ticker.toUpperCase().includes(t) || (r.nombre ?? "").toUpperCase().includes(t)));
  }, [todas, busqueda]);

  // Screener y dispersión respetan rubro + buscador; la COMPOSICIÓN muestra
  // siempre todos los rubros (si no, filtrar por uno la dejaría en una sola
  // barra) y resalta el elegido.
  const filtradas = useMemo(
    () => (rubroFiltro ? buscadas.filter((r) => r.rubro === rubroFiltro) : buscadas),
    [buscadas, rubroFiltro],
  );

  const filas = useMemo(() => {
    const base = [...filtradas];
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
  }, [filtradas, sort]);

  const ejeX = EJES.find((e) => e.key === ejeXKey) ?? EJES[4];
  const ejeY = EJES.find((e) => e.key === ejeYKey) ?? EJES[0];
  // El ranking de segmentos lo calcula el backend, así que necesita saber QUÉ
  // empresas mirar. El rubro viaja como parámetro propio; el buscador, como
  // lista de tickers — solo cuando hay búsqueda activa (sin filtro son 184
  // tickers en la URL al pedo).
  const tickersFiltrados = busqueda.trim()
    ? buscadas.map((r) => r.ticker).join(",")
    : null;
  const nExcluidas = agregado?.excluidas?.length ?? 0;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Barra COMÚN a los 4 cuadrantes */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[10px] text-[var(--t-text-muted)]">
          {filas.length} empresa{filas.length === 1 ? "" : "s"}
          {rubroFiltro ? ` · ${rubroFiltro}` : ""}
        </span>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="comparar: AAPL, MSFT, NVDA…"
          spellCheck={false}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[200px]"
        />
        {/* Filtro por RUBRO — el mismo catálogo que el scanner de renta variable */}
        {rubros.length > 0 && (
          <select
            value={rubroFiltro}
            onChange={(e) => setRubroFiltro(e.target.value)}
            title="Filtrar TODO el panel por rubro (tabla, agregado y dispersión)"
            className={`text-[9px] tracking-wide border px-1.5 py-0.5 bg-[var(--t-panel)] outline-none cursor-pointer ${
              rubroFiltro
                ? "text-[var(--t-accent)] border-[var(--t-accent)]"
                : "text-[var(--t-text-dim)] border-[var(--t-border-2)]"
            }`}
          >
            <option value="">RUBRO: todos</option>
            {rubros.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
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
              <div className="flex gap-1 mt-1">
                <button onClick={() => setOcultas({})}
                  className="flex-1 text-[9px] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] border border-[var(--t-border-2)] px-1.5 py-0.5">
                  Todas
                </button>
                <button onClick={() => setOcultas(OCULTAS_DEFAULT)}
                  className="flex-1 text-[9px] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] border border-[var(--t-border-2)] px-1.5 py-0.5">
                  Por defecto
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Período + canasta: mandan sobre el AGREGADO */}
        <div className="flex items-center gap-1">
          {([["anual", "ANUAL"], ["trimestral", "TRIMESTRAL"]] as const).map(([k, lbl]) => (
            <Chip key={k} activo={periodo === k} onClick={() => setPeriodo(k)}
              title="Período del panel AGREGADO">
              {lbl}
            </Chip>
          ))}
          <Chip activo={canasta === "constante"}
            onClick={() => setCanasta(canasta === "constante" ? "todas" : "constante")}
            title={"CANASTA CONSTANTE: suma solo las empresas con datos en TODOS los períodos, "
              + "para que un salto de la curva sea negocio y no una empresa que entró o salió del feed. "
              + "Apagado suma todo lo que haya (más cobertura, menos comparable)."}>
            CANASTA FIJA
          </Chip>
        </div>

        <span className="ml-auto text-[9px] text-[var(--t-text-dim)]">
          último año fiscal · actualiza 1 vez por día
        </span>
      </div>

      {/* 4 cuadrantes del 50% */}
      <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-px bg-[var(--t-border)]"
        onClick={() => selectorAbierto && setSelectorAbierto(false)}>

        <Cuadrante id="screener" titulo="SCREENER" maxi={maxi} setMaxi={setMaxi}>
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
                      className={`px-2 py-2 cursor-pointer select-none hover:text-[var(--t-accent)] whitespace-nowrap ${c.texto ? "text-left" : "text-right"} ${sort?.key === c.key ? "text-[var(--t-accent)]" : ""}`}>
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
                        className={`px-2 py-1.5 whitespace-nowrap text-[var(--t-text-dim)] ${c.key === "ticker" ? "text-left px-3 max-w-[240px] overflow-hidden" : c.texto ? "text-left" : "text-right"}`}>
                        {c.render(r)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Cuadrante>

        <Cuadrante id="agregado" maxi={maxi} setMaxi={setMaxi}
          titulo={`AGREGADO ${rubroFiltro ? `· ${rubroFiltro.toUpperCase()}` : "· TODO EL UNIVERSO"}`}
          extra={
            <>
              <span className="text-[8px] text-[var(--t-text-dim)] truncate"
                title={nExcluidas
                  ? `Fuera de la canasta: ${agregado?.excluidas.map((e) => `${e.ticker} (${e.motivo})`).join(" · ")}`
                  : "Todas las empresas del filtro entran a la suma"}>
                {agregado ? `${agregado.empresas.length} en la canasta` : ""}
                {nExcluidas ? ` · ${nExcluidas} afuera` : ""}
              </span>
              <Selector value={grupo} onChange={setGrupo}
                title="Qué se suma"
                opciones={(Object.keys(GRUPOS_AGREGADO) as GrupoAgregado[])
                  .map((g) => ({ v: g, label: GRUPOS_AGREGADO[g].label }))} />
            </>
          }>
          <ChartAgregado data={agregado} grupo={grupo} cargando={lastAt === 0} />
        </Cuadrante>

        <Cuadrante id="dispersion" titulo="DISPERSIÓN" maxi={maxi} setMaxi={setMaxi}
          extra={
            <>
              <span className="text-[8px] text-[var(--t-text-dim)]">Y</span>
              <Selector value={ejeYKey} onChange={setEjeYKey} title="Métrica del eje vertical"
                opciones={EJES.map((e) => ({ v: e.key, label: e.label }))} />
              <span className="text-[8px] text-[var(--t-text-dim)]">X</span>
              <Selector value={ejeXKey} onChange={setEjeXKey} title="Métrica del eje horizontal"
                opciones={EJES.map((e) => ({ v: e.key, label: e.label }))} />
            </>
          }>
          <ChartDispersion filas={filas} colorDe={colorDe} ejeX={ejeX} ejeY={ejeY}
            onFicha={onFicha} extremos={extremos} setExtremos={setExtremos} />
        </Cuadrante>

        <Cuadrante id="composicion" maxi={maxi} setMaxi={setMaxi}
          titulo={TABS_COMP.find((t) => t.v === tabComp)?.titulo ?? "COMPOSICIÓN"}
          extra={
            <div className="flex gap-1">
              {TABS_COMP.map((t) => (
                <Chip key={t.v} activo={tabComp === t.v} onClick={() => setTabComp(t.v)}
                  title={t.ayuda}>
                  {t.label}
                </Chip>
              ))}
            </div>
          }>
          {tabComp === "composicion" ? (
            <TablaComposicion filas={buscadas} colorDe={colorDe}
              rubroActivo={rubroFiltro} onRubro={setRubroFiltro} />
          ) : (
            <RankingSegmentos tipo={tabComp === "segmentos" ? "negocio" : "geografico"}
              rubro={rubroFiltro} tickers={tickersFiltrados} />
          )}
        </Cuadrante>
      </div>
    </div>
  );
}
