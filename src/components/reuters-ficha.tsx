"use client";

import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  createChart,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

import { usePersistedState } from "@/lib/use-persisted-state";
import { usePoll } from "@/lib/use-poll";

// TRADING → REUTERS → FICHA de empresa. Layout 2×2 (mismo patrón que la vista
// de negocio): arriba-izq chart de precio 1 año · abajo-izq retornos en tabla
// + market cap + rango 52 semanas · arriba-der métricas en TABS (NEGOCIO /
// SALUD / VALUACIÓN) · abajo-der la EVOLUCIÓN 5 AÑOS graficada (barras por
// año fiscal, series seleccionables). Menos es más — sin consenso de analistas.
const POLL_MS = 10_000;

interface SerieAnual {
  fecha: string;
  revenue?: number | null;
  ebitda?: number | null;
  net_income?: number | null;
  fcf?: number | null;
  deuda?: number | null;
  caja?: number | null;
  margen_bruto?: number | null;
  margen_operativo?: number | null;
  margen_neto?: number | null;
}

interface Ficha {
  ticker: string;
  ric: string | null;
  ratio: number | null;
  quote: Record<string, number | string | null> | null;
  fundamentals: (Record<string, number | string | null> & {
    serie_anual?: SerieAnual[];
    serie_trimestral?: SerieAnual[];
  }) | null;
  velas: { fecha: string; close: number }[];
}

// ── formato ──────────────────────────────────────────────────────────────────
function num(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) ? v : null;
}

function fmtGrande(v: unknown): string {
  const n = num(v);
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toLocaleString("es-AR", { maximumFractionDigits: 2 })} T`;
  if (abs >= 1e9) return `$${(n / 1e9).toLocaleString("es-AR", { maximumFractionDigits: 1 })} B`;
  if (abs >= 1e6) return `$${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 0 })} M`;
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
}

// Los resultados FY0 y la serie anual vienen en MILLONES de USD.
function fmtMillones(v: unknown): string {
  const n = num(v);
  if (n === null) return "—";
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} B`;
  return `$${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })} M`;
}

function fmtX(v: unknown, dec = 1): string {
  const n = num(v);
  return n === null ? "—" : `${n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}x`;
}

function fmtN(v: unknown, dec = 2): string {
  const n = num(v);
  return n === null ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtPct(v: unknown, dec = 1): string {
  const n = num(v);
  if (n === null) return "—";
  return `${n > 0 ? "+" : ""}${n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;
}

function pctPlano(v: unknown, dec = 1): string {
  const n = num(v);
  return n === null ? "—" : `${n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}%`;
}

function varClass(v: unknown): string {
  const n = num(v);
  if (n === null || n === 0) return "text-[var(--t-text-dim)]";
  return n > 0 ? "text-green-400" : "text-red-400";
}

function fecha(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

// ── chart de precio 1 año (mismo motor y tema que el resto de la app) ────────
function ChartAnual({ velas }: { velas: { fecha: string; close: number }[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [isLight, setIsLight] = useState(false);

  useEffect(() => {
    const el = document.documentElement;
    const read = () => setIsLight(el.classList.contains("light"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const txt = isLight ? "#16203a" : "#8a8a8a";
    const grid = isLight ? "#eef2f7" : "#141414";
    const border = isLight ? "#aab6c9" : "#2a2a2a";
    const bg = isLight ? "#ffffff" : "#080808";
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: txt, fontSize: 10,
        fontFamily: "JetBrains Mono, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: grid, style: LineStyle.Dotted },
        horzLines: { color: grid, style: LineStyle.Dotted },
      },
      leftPriceScale: { visible: true, borderColor: border, scaleMargins: { top: 0.08, bottom: 0.08 } },
      rightPriceScale: { visible: false },
      timeScale: { borderColor: border, timeVisible: false, rightOffset: 2 },
      localization: {
        priceFormatter: (v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
      },
    });
    const series = chart.addSeries(AreaSeries, {
      priceScaleId: "left",
      lineColor: "#ff9900", lineWidth: 2,
      topColor: "rgba(255, 153, 0, 0.30)", bottomColor: "rgba(255, 153, 0, 0.02)",
      priceLineVisible: false, lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => { chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [isLight]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    series.setData(velas.map((v) => ({ time: v.fecha as Time, value: v.close })));
    chartRef.current?.timeScale().fitContent();
  }, [velas, isLight]);

  return <div ref={ref} className="w-full h-full" />;
}

// ── evolución 5 años: barras agrupadas por año fiscal (SVG propio) ───────────
// Los MÚLTIPLOS no se grafican a propósito: la "serie" que devuelve la fuente
// es precio de HOY / resultados de cada año — no el múltiplo que se pagaba
// entonces (verificado 2026-07-17). Solo grupos con historia REAL.
type GrupoSerie = "resultados" | "margenes" | "salud";

interface DefSerie { key: keyof SerieAnual; label: string; color: string }

// Etiquetas cortas para el eje Y y las barras (los montos vienen en MILLONES).
function cortoUSD(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${(n / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })}B`;
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 0 })}M`;
}

function cortoPct(n: number): string {
  return `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

const GRUPOS_5A: Record<GrupoSerie, {
  label: string;
  fmt: (v: unknown) => string;          // tooltip
  corto: (n: number) => string;         // eje Y + etiqueta de barra
  series: DefSerie[];
}> = {
  resultados: {
    label: "RESULTADOS",
    fmt: fmtMillones,
    corto: cortoUSD,
    series: [
      { key: "revenue", label: "Ingresos", color: "#3b82f6" },
      { key: "ebitda", label: "EBITDA", color: "#ff9900" },
      { key: "net_income", label: "Resultado", color: "#10b981" },
      { key: "fcf", label: "FCF", color: "#a855f7" },
    ],
  },
  margenes: {
    label: "MÁRGENES",
    fmt: (v) => pctPlano(v),
    corto: cortoPct,
    series: [
      { key: "margen_bruto", label: "Bruto", color: "#3b82f6" },
      { key: "margen_operativo", label: "Operativo", color: "#ff9900" },
      { key: "margen_neto", label: "Neto", color: "#10b981" },
    ],
  },
  salud: {
    label: "SALUD",
    fmt: fmtMillones,
    corto: cortoUSD,
    series: [
      { key: "deuda", label: "Deuda total", color: "#ef4444" },
      { key: "caja", label: "Caja", color: "#10b981" },
    ],
  },
};

function ChartEvolucion({ anual, trimestral, grupo }: {
  anual: SerieAnual[]; trimestral: SerieAnual[]; grupo: GrupoSerie;
}) {
  const [apagadas, setApagadas] = useState<Set<string>>(new Set());
  const [per, setPer] = useState<"anual" | "trim">("anual");
  const serie = per === "anual" ? anual : trimestral;
  const def = GRUPOS_5A[grupo];
  const activas = def.series.filter((s) => !apagadas.has(s.key));

  // Escala: positivos arriba del cero, negativos abajo — cada lado con su
  // propio máximo (una pérdida grande ya no se sale del lienzo).
  const vals = serie.flatMap((a) => activas.map((s) => num(a[s.key]))).filter((v): v is number => v !== null);
  const maxPos = Math.max(0, ...vals.filter((v) => v > 0));
  const maxNeg = Math.max(0, ...vals.filter((v) => v < 0).map((v) => -v));
  const H = 150;
  const M = 40;                                    // margen izquierdo (eje Y)
  const escala = (H - 24) / ((maxPos + maxNeg) || 1);
  const cero = 8 + maxPos * escala;
  const W = M + Math.max(serie.length, 1) * 96;

  // Ticks del eje Y (0, mitad y tope de cada lado, sin duplicados)
  const ticks = [...new Set([maxPos, maxPos / 2, 0, -maxNeg / 2, -maxNeg]
    .filter((t) => t === 0 || Math.abs(t) > (maxPos + maxNeg) * 0.04))];

  const etiqueta = (fecha: string) =>
    per === "anual" ? fecha.slice(0, 4) : `${fecha.slice(5, 7)}/${fecha.slice(2, 4)}`;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-2 pt-2 shrink-0">
        {def.series.map((s) => (
          <button key={s.key}
            onClick={() => setApagadas((prev) => {
              const n = new Set(prev);
              if (n.has(s.key)) n.delete(s.key); else n.add(s.key);
              return n;
            })}
            className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 border transition-colors ${
              apagadas.has(s.key)
                ? "border-[var(--t-border-2)] text-[var(--t-text-dim)] opacity-50"
                : "border-[var(--t-border-2)] text-[var(--t-text)]"
            }`}>
            <span className="w-2 h-2 inline-block" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {([["anual", "ANUAL"], ["trim", "TRIMESTRAL"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setPer(k)}
              className={`px-1.5 py-0.5 text-[8px] font-semibold border transition-colors ${
                per === k
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
              }`}>
              {lbl}
            </button>
          ))}
          <span className="text-[8px] text-[var(--t-text-dim)] pl-1">
            {grupo === "margenes" ? "%" : "USD"}
          </span>
        </div>
      </div>
      {serie.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">
          sin datos {per === "anual" ? "anuales" : "trimestrales"} todavía — se cargan con la próxima pasada del feed
        </div>
      ) : (
        <div className="flex-1 min-h-0 px-2 pb-1">
          <svg viewBox={`0 0 ${W} ${H + 16}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
            {/* eje Y: gridlines + valores */}
            {ticks.map((t) => {
              const y = cero - t * escala;
              return (
                <g key={t}>
                  <line x1={M} x2={W} y1={y} y2={y} stroke="var(--t-border-2)"
                    strokeWidth={t === 0 ? 0.8 : 0.4} strokeDasharray={t === 0 ? undefined : "2,3"} />
                  <text x={M - 4} y={y + 2.5} textAnchor="end"
                    className="fill-[var(--t-text-dim)]" fontSize={7.5}
                    fontFamily="JetBrains Mono, monospace">
                    {def.corto(t)}
                  </text>
                </g>
              );
            })}
            {serie.map((a, i) => {
              const x0 = M + i * 96 + 10;
              const ancho = 72 / Math.max(activas.length, 1);
              return (
                <g key={a.fecha}>
                  {activas.map((s, j) => {
                    const v = num(a[s.key]);
                    if (v === null) return null;
                    const h = Math.max(1, Math.abs(v) * escala);
                    const y = v >= 0 ? cero - h : cero;
                    return (
                      <g key={s.key}>
                        <rect x={x0 + j * ancho} width={ancho - 3} y={y} height={h}
                          fill={s.color} opacity={0.85}>
                          <title>{`${etiqueta(a.fecha)} · ${s.label}: ${def.fmt(v)}`}</title>
                        </rect>
                        {/* valor sobre la barra cuando entra (pocas series activas) */}
                        {activas.length <= 2 && (
                          <text x={x0 + j * ancho + (ancho - 3) / 2}
                            y={v >= 0 ? y - 2 : y + h + 7}
                            textAnchor="middle" className="fill-[var(--t-text-dim)]"
                            fontSize={7} fontFamily="JetBrains Mono, monospace">
                            {def.corto(v)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text x={M + i * 96 + 46} y={H + 12} textAnchor="middle"
                    className="fill-[var(--t-text-dim)]" fontSize={8.5}
                    fontFamily="JetBrains Mono, monospace">
                    {etiqueta(a.fecha)}
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

// ── bloques auxiliares ───────────────────────────────────────────────────────
function Dato({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px] font-mono border-b border-[var(--t-border)] py-1 last:border-0" title={title}>
      <span className="text-[var(--t-text-muted)] whitespace-nowrap">{label}</span>
      <span className="text-[var(--t-text)] text-right whitespace-nowrap">{children}</span>
    </div>
  );
}

function Cuadrante({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] min-w-0 min-h-0 flex flex-col">
      <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">{titulo}</span>
        {extra}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

type TabMetricas = "negocio" | "salud" | "valuacion";

export function ReutersFicha({ ticker, onVolver }: { ticker: string; onVolver: () => void }) {
  const { data } = usePoll<Ficha | null>(
    `/api/trading/reuters/ficha?ticker=${encodeURIComponent(ticker)}`,
    null, POLL_MS, { fetchOnMount: true },
  );
  const [tab, setTab] = usePersistedState<TabMetricas>("reuters.ficha.tab", "negocio");
  // Grupo graficado abajo-derecha: sigue al tab de métricas (valuación no tiene
  // serie con historia real → mantiene el último grupo), pero se puede elegir.
  const [grupo, setGrupo] = useState<GrupoSerie>("resultados");
  useEffect(() => {
    if (tab === "negocio") setGrupo("resultados");
    else if (tab === "salud") setGrupo("salud");
  }, [tab]);

  const q = data?.quote ?? null;
  const f = data?.fundamentals ?? null;
  const serieAnual = (f?.serie_anual ?? []).slice().reverse();         // viejo → nuevo
  const serieTrim = (f?.serie_trimestral ?? []).slice().reverse();
  const last = num(q?.last);
  const min52 = num(f?.min_52s);
  const max52 = num(f?.max_52s);
  const pos52 = last !== null && min52 !== null && max52 !== null && max52 > min52
    ? Math.min(1, Math.max(0, (last - min52) / (max52 - min52)))
    : null;

  const RETORNOS: { label: string; key: string }[] = [
    { label: "Hoy", key: "var_pct" },
    { label: "5 días", key: "ret_5d" },
    { label: "Semana (WTD)", key: "ret_wtd" },
    { label: "Mes (MTD)", key: "ret_mtd" },
    { label: "Trimestre (QTD)", key: "ret_qtd" },
    { label: "Año (YTD)", key: "ret_ytd" },
    { label: "1 mes móvil", key: "ret_1m" },
    { label: "3 meses", key: "ret_3m" },
    { label: "1 año", key: "ret_1y" },
    { label: "5 años", key: "ret_5y" },
  ];

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header slim */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <button onClick={onVolver}
          className="px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors">
          ← VOLVER
        </button>
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-[var(--t-text)] truncate">{(f?.nombre as string) ?? ticker}</span>
          <span className="text-[10px] text-[var(--t-accent)] font-mono">{ticker}</span>
          {data?.ric && <span className="text-[9px] text-[var(--t-text-dim)] font-mono">{data.ric}</span>}
          <span className="text-[9px] text-[var(--t-text-muted)]">
            {(f?.industria as string) ?? ""}{data?.ratio ? ` · ratio ${fmtN(data.ratio, 0)}:1` : ""}
            {f?.proximo_balance ? ` · reporta ${fecha(f.proximo_balance)}` : ""}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-4 font-mono">
          {q?.pre_var_pct != null && (
            <span className="text-[10px]" title="Pre market vs cierre anterior">
              <span className="text-[var(--t-text-dim)]">PRE </span>
              <span className={varClass(q.pre_var_pct)}>{fmtPct(q.pre_var_pct)}</span>
            </span>
          )}
          {q?.ah_var_pct != null && (
            <span className="text-[10px]" title="After market vs cierre de hoy">
              <span className="text-[var(--t-text-dim)]">AFTER </span>
              <span className={varClass(q.ah_var_pct)}>{fmtPct(q.ah_var_pct)}</span>
            </span>
          )}
          <span className="text-[15px] font-semibold text-[var(--t-text)]">{last === null ? "—" : fmtN(last)}</span>
          <span className={`text-[11px] ${varClass(q?.var_pct)}`}>{fmtPct(q?.var_pct, 2)}</span>
        </div>
      </div>

      {!data ? (
        <div className="p-4 text-[11px] text-[var(--t-text-muted)]">Cargando {ticker}…</div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-2 p-2">
          {/* ── Arriba-izquierda: precio 1 año ── */}
          <Cuadrante titulo="PRECIO — 1 AÑO">
            {data.velas.length > 0
              ? <ChartAnual velas={data.velas} />
              : <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">sin serie de precios todavía</div>}
          </Cuadrante>

          {/* ── Arriba-derecha: métricas en tabs ── */}
          <Cuadrante titulo="MÉTRICAS" extra={
            <div className="ml-auto flex gap-1">
              {([["negocio", "NEGOCIO"], ["salud", "SALUD"], ["valuacion", "VALUACIÓN"]] as const).map(([k, lbl]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-2 py-0.5 text-[9px] font-semibold border transition-colors ${
                    tab === k
                      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                      : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                  }`}>
                  {lbl}
                </button>
              ))}
            </div>
          }>
            {!f ? (
              <div className="p-3 text-[10px] text-[var(--t-text-muted)]">
                Sin fundamentals todavía — se cargan solos con la primera pasada diaria del feed de la oficina.
              </div>
            ) : (
              <div className="px-3 py-1">
                {tab === "negocio" && (
                  <>
                    <Dato label="Ingresos (últ. año fiscal)">{fmtMillones(f.revenue)}</Dato>
                    <Dato label="Utilidad bruta">{fmtMillones(f.gross_profit)}</Dato>
                    <Dato label="EBITDA">{fmtMillones(f.ebitda)}</Dato>
                    <Dato label="Resultado operativo">{fmtMillones(f.ebit)}</Dato>
                    <Dato label="Resultado neto">{fmtMillones(f.net_income)}</Dato>
                    <Dato label="Free cash flow">{fmtMillones(f.fcf)}</Dato>
                    <Dato label="Capex">{fmtMillones(f.capex)}</Dato>
                    <Dato label="Margen bruto">{pctPlano(f.margen_bruto)}</Dato>
                    <Dato label="Margen operativo"><span className={varClass(f.margen_operativo)}>{pctPlano(f.margen_operativo)}</span></Dato>
                    <Dato label="Margen neto"><span className={varClass(f.margen_neto)}>{pctPlano(f.margen_neto)}</span></Dato>
                  </>
                )}
                {tab === "salud" && (
                  <>
                    <Dato label="Deuda total">{fmtGrande(f.deuda_total)}</Dato>
                    <Dato label="Caja y equivalentes">{fmtGrande(f.caja)}</Dato>
                    <Dato label="Deuda neta / EBITDA">{fmtX(f.deuda_neta_ebitda)}</Dato>
                    <Dato label="Current ratio">{fmtN(f.current_ratio, 2)}</Dato>
                    <Dato label="Quick ratio">{fmtN(f.quick_ratio, 2)}</Dato>
                    <Dato label="Acciones en circulación">{fmtGrande(f.acciones).replace("$", "")}</Dato>
                  </>
                )}
                {tab === "valuacion" && (
                  <>
                    <Dato label="Market cap">{fmtGrande(f.market_cap)}</Dato>
                    <Dato label="Enterprise value">{fmtGrande(f.ev)}</Dato>
                    <Dato label="P/E">{fmtX(f.pe)}</Dato>
                    <Dato label="P/E forward">{fmtX(f.fwd_pe)}</Dato>
                    <Dato label="EV/EBITDA">{fmtX(f.ev_ebitda)}</Dato>
                    <Dato label="EV/EBITDA forward">{fmtX(f.fwd_ev_ebitda)}</Dato>
                    <Dato label="EV/EBIT">{fmtX(f.ev_ebit)}</Dato>
                    <Dato label="Precio / valor libro">{fmtX(f.p_bv)}</Dato>
                    <Dato label="Dividend yield">{pctPlano(f.div_yield)}</Dato>
                  </>
                )}
              </div>
            )}
          </Cuadrante>

          {/* ── Abajo-izquierda: retornos + market cap + rango 52s ── */}
          <Cuadrante titulo="RETORNOS">
            <div className="px-3 py-1">
              <div className="grid grid-cols-2 gap-x-6">
                {RETORNOS.map((r) => (
                  <div key={r.key} className="flex items-baseline justify-between text-[11px] font-mono border-b border-[var(--t-border)] py-1">
                    <span className="text-[var(--t-text-muted)]">{r.label}</span>
                    <span className={varClass(q?.[r.key])}>{fmtPct(q?.[r.key])}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5">
                <Dato label="Market cap">{fmtGrande(f?.market_cap)}</Dato>
                <div className="text-[9px] tracking-widest text-[var(--t-text-muted)] mt-1">RANGO 52 SEMANAS</div>
                <div className="flex items-center justify-between text-[10px] font-mono text-[var(--t-text-muted)]">
                  <span>{fmtN(min52)}</span><span>{fmtN(max52)}</span>
                </div>
                <div className="relative h-1.5 bg-[var(--t-surface-2)]">
                  {pos52 !== null && (
                    <div className="absolute top-[-3px] w-[3px] h-3 bg-[var(--t-accent)]" style={{ left: `${pos52 * 100}%` }} />
                  )}
                </div>
              </div>
            </div>
          </Cuadrante>

          {/* ── Abajo-derecha: evolución histórica graficada ── */}
          <Cuadrante titulo="EVOLUCIÓN" extra={
            <div className="ml-auto flex gap-1">
              {(Object.keys(GRUPOS_5A) as GrupoSerie[]).map((g) => (
                <button key={g} onClick={() => setGrupo(g)}
                  className={`px-2 py-0.5 text-[9px] font-semibold border transition-colors ${
                    grupo === g
                      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                      : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                  }`}>
                  {GRUPOS_5A[g].label}
                </button>
              ))}
            </div>
          }>
            {serieAnual.length > 0 || serieTrim.length > 0
              ? <ChartEvolucion anual={serieAnual} trimestral={serieTrim} grupo={grupo} />
              : <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">sin serie histórica todavía — se carga con la próxima pasada diaria del feed</div>}
          </Cuadrante>
        </div>
      )}
    </div>
  );
}
