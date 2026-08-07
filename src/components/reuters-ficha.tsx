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
  return n > 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]";
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

// ── DE DÓNDE SALEN LAS VENTAS (ingresos por segmento, familia TR.BGS.*) ──────
// El desglose que publica la empresa, período a período, apilado. Dos avisos
// conceptuales que la UI tiene que respetar (validados 2026-08-07, ver
// docs/INTEGRACION_REUTERS.md §8):
//   · "Segmento de negocio" NO siempre es producto: Apple y Coca-Cola reportan
//     por REGIÓN, NVDA y Rocket Lab por producto. Por eso el título dice
//     "SEGMENTOS" y no "por producto".
//   · Los nombres CAMBIAN entre períodos (Reuters re-expresa) → hay segmentos
//     que aparecen y desaparecen: el apilado banca huecos y el color se fija
//     por nombre, no por posición.
interface Segmentos {
  ticker: string;
  tipo: string;
  periodo: string;
  segmentos: string[];
  puntos: { fecha: string; total: number; valores: Record<string, number> }[];
  ajustes: string[];
}

const PALETA_SEG = [
  "#3b82f6", "#ff9900", "#10b981", "#a855f7", "#06b6d4", "#eab308",
  "#ec4899", "#84cc16", "#f97316", "#8b5cf6", "#14b8a6", "#0ea5e9",
];

function ChartSegmentos({ ticker }: { ticker: string }) {
  const [tipo, setTipo] = usePersistedState<"negocio" | "geografico">(
    "reuters.seg.tipo", "negocio");
  const [per, setPer] = usePersistedState<"anual" | "trimestral">(
    "reuters.seg.per", "anual");
  const [modo, setModo] = usePersistedState<"usd" | "share">("reuters.seg.modo", "usd");

  const { data, lastAt } = usePoll<Segmentos | null>(
    `/api/research1816/reuters/segmentos?ticker=${encodeURIComponent(ticker)}`
    + `&tipo=${tipo}&periodo=${per}`, null, 60_000, { fetchOnMount: true });

  const boxRef = useRef<HTMLDivElement | null>(null);
  const [dim, setDim] = useState({ w: 640, h: 240 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setDim({ w: Math.max(el.clientWidth, 240), h: Math.max(el.clientHeight, 140) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const puntos = data?.puntos ?? [];
  const nombres = data?.segmentos ?? [];
  const ajustes = new Set(data?.ajustes ?? []);
  const color = (s: string) => PALETA_SEG[Math.max(nombres.indexOf(s), 0) % PALETA_SEG.length];

  // En modo SHARE cada barra vale 100% (share sobre el total del período; con
  // eliminaciones negativas el total sigue siendo el consolidado real).
  const valorDe = (p: typeof puntos[number], s: string): number => {
    const v = p.valores[s];
    if (typeof v !== "number" || !isFinite(v)) return 0;
    if (modo === "usd") return v;
    return p.total ? (v / p.total) * 100 : 0;
  };

  // Alto de cada barra: los positivos se apilan hacia arriba desde cero y los
  // negativos (eliminaciones) hacia abajo — apilarlos juntos daría una barra
  // más corta que la realidad de cada pata.
  const totalPos = Math.max(0, ...puntos.map((p) =>
    nombres.reduce((s, n) => s + Math.max(valorDe(p, n), 0), 0)));
  const totalNeg = Math.max(0, ...puntos.map((p) =>
    nombres.reduce((s, n) => s + Math.max(-valorDe(p, n), 0), 0)));

  const W = dim.w;
  const H = dim.h - 18;
  const M = 52;
  const margenTop = 12;
  const margenBot = totalNeg > 0 ? 16 : 8;
  const escala = Math.max(H - margenTop - margenBot, 20) / ((totalPos + totalNeg) || 1);
  const cero = margenTop + totalPos * escala;
  const slot = (W - M) / Math.max(puntos.length, 1);
  const fmtV = (v: number) => (modo === "share" ? `${fmtN(v, 1)}%` : fmtMillones(v));
  const etiqueta = (fecha: string) =>
    per === "anual" ? fecha.slice(0, 4) : `${fecha.slice(5, 7)}/${fecha.slice(2, 4)}`;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-1.5 px-2 pt-1.5 shrink-0">
        {([["negocio", "NEGOCIO"], ["geografico", "REGIÓN"]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setTipo(k)}
            title={k === "negocio"
              ? "Segmentos tal como los reporta la empresa (ojo: Apple y Coca-Cola los reportan por región)"
              : "Ventas por país/región"}
            className={`px-1.5 py-0.5 text-[8px] font-semibold border transition-colors ${
              tipo === k
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
            }`}>{lbl}</button>
        ))}
        <span className="w-px h-3 bg-[var(--t-border-2)] mx-0.5" />
        {([["usd", "USD"], ["share", "% DEL TOTAL"]] as const).map(([k, lbl]) => (
          <button key={k} onClick={() => setModo(k)}
            className={`px-1.5 py-0.5 text-[8px] font-semibold border transition-colors ${
              modo === k
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
            }`}>{lbl}</button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {([["anual", "ANUAL"], ["trimestral", "TRIMESTRAL"]] as const).map(([k, lbl]) => (
            <button key={k} onClick={() => setPer(k)}
              className={`px-1.5 py-0.5 text-[8px] font-semibold border transition-colors ${
                per === k
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
              }`}>{lbl}</button>
          ))}
        </div>
      </div>
      {puntos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4 text-center text-[10px] text-[var(--t-text-dim)]">
          {lastAt === 0
            ? "cargando…"
            : `sin desglose ${tipo === "negocio" ? "por segmento" : "por región"} para ${ticker}`
              + " — se carga con la próxima pasada diaria del feed (no todas las empresas lo publican)"}
        </div>
      ) : (
        <>
          <div ref={boxRef} className="flex-1 min-h-0 px-2 overflow-hidden">
            <svg width={W} height={dim.h}>
              <line x1={M} x2={W} y1={cero} y2={cero} stroke="var(--t-border-2)" strokeWidth={1} />
              {puntos.map((p, i) => {
                const x = M + i * slot + slot * 0.18;
                const ancho = slot * 0.64;
                let arriba = cero;
                let abajo = cero;
                return (
                  <g key={p.fecha}>
                    {nombres.map((s) => {
                      const v = valorDe(p, s);
                      if (!v) return null;
                      const h = Math.abs(v) * escala;
                      let y: number;
                      if (v > 0) { arriba -= h; y = arriba; } else { y = abajo; abajo += h; }
                      return (
                        <rect key={s} x={x} width={Math.max(ancho, 2)} y={y} height={Math.max(h, 0.8)}
                          fill={color(s)} opacity={ajustes.has(s) ? 0.45 : 0.9}>
                          <title>{`${etiqueta(p.fecha)} · ${s}${ajustes.has(s) ? " (ajuste, no es negocio)" : ""}: ${fmtV(v)}`}</title>
                        </rect>
                      );
                    })}
                    <text x={M + i * slot + slot / 2} y={dim.h - 4} textAnchor="middle"
                      className="fill-[var(--t-text-muted)] font-medium" fontSize={10}
                      fontFamily="JetBrains Mono, monospace">
                      {etiqueta(p.fecha)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1 border-t border-[var(--t-border)] shrink-0">
            {nombres.map((s) => (
              <span key={s} className="flex items-center gap-1 text-[8px] text-[var(--t-text-dim)]"
                title={ajustes.has(s)
                  ? "Eliminaciones / corporate: no es un negocio, es el ajuste que hace cerrar la suma contra los ingresos totales"
                  : s}>
                <span className="w-2 h-2 inline-block"
                  style={{ background: color(s), opacity: ajustes.has(s) ? 0.45 : 0.9 }} />
                {s}{ajustes.has(s) ? " *" : ""}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChartEvolucion({ anual, trimestral, grupo }: {
  anual: SerieAnual[]; trimestral: SerieAnual[]; grupo: GrupoSerie;
}) {
  const [apagadas, setApagadas] = useState<Set<string>>(new Set());
  const [per, setPer] = useState<"anual" | "trim">("anual");
  const serie = per === "anual" ? anual : trimestral;
  const def = GRUPOS_5A[grupo];
  const activas = def.series.filter((s) => !apagadas.has(s.key));

  // El SVG se dibuja al TAMAÑO REAL del cuadrante (medido) — sin viewBox
  // escalado: las barras llenan el espacio y los textos salen nítidos.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [dim, setDim] = useState({ w: 640, h: 240 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setDim({ w: Math.max(el.clientWidth, 240), h: Math.max(el.clientHeight, 140) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Escala ADAPTATIVA con tope "redondo" (1/2/2.5/5 × 10^k): el eje queda en
  // números que se leen (0 / 25 / 50%), no en el máximo crudo de los datos.
  const redondear = (v: number): number => {
    if (v <= 0) return 0;
    const p = 10 ** Math.floor(Math.log10(v));
    const m = v / p;
    const nm = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
    return nm * p;
  };
  const vals = serie.flatMap((a) => activas.map((s) => num(a[s.key]))).filter((v): v is number => v !== null);
  const topPos = redondear(Math.max(0, ...vals.filter((v) => v > 0)));
  const topNeg = redondear(Math.max(0, ...vals.filter((v) => v < 0).map((v) => -v)));
  const W = dim.w;
  const H = dim.h - 18;                            // franja inferior: fechas
  const M = 48;                                    // margen izquierdo (eje Y)
  // Cabecera arriba (y abajo si hay negativos) para que las etiquetas
  // verticales de las barras más altas no se recorten.
  const margenTop = 40;
  const margenBot = topNeg > 0 ? 40 : 12;
  const escala = Math.max(H - margenTop - margenBot, 20) / ((topPos + topNeg) || 1);
  const cero = margenTop + topPos * escala;
  const slot = (W - M) / Math.max(serie.length, 1);

  // Ticks del eje Y: 0, mitad y tope redondos de cada lado
  const ticks = [...new Set([topPos, topPos / 2, 0, -topNeg / 2, -topNeg])];

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
        <div ref={boxRef} className="flex-1 min-h-0 px-2 pb-1 overflow-hidden">
          <svg width={W} height={dim.h}>
            {/* eje Y: gridlines + valores */}
            {ticks.map((t) => {
              const y = cero - t * escala;
              return (
                <g key={t}>
                  <line x1={M} x2={W} y1={y} y2={y} stroke="var(--t-border-2)"
                    strokeWidth={t === 0 ? 1 : 0.5} strokeDasharray={t === 0 ? undefined : "3,4"} />
                  <text x={M - 6} y={y + 3} textAnchor="end"
                    className="fill-[var(--t-text-muted)] font-medium" fontSize={9.5}
                    fontFamily="JetBrains Mono, monospace">
                    {def.corto(t)}
                  </text>
                </g>
              );
            })}
            {serie.map((a, i) => {
              const x0 = M + i * slot + slot * 0.1;
              const ancho = (slot * 0.8) / Math.max(activas.length, 1);
              return (
                <g key={a.fecha}>
                  {activas.map((s, j) => {
                    const v = num(a[s.key]);
                    if (v === null) return null;
                    const h = Math.max(1.5, Math.abs(v) * escala);
                    const y = v >= 0 ? cero - h : cero;
                    const cx = x0 + j * ancho + (ancho - 3) / 2 + 3.5;
                    const yLbl = v >= 0 ? y - 4 : y + h + 4;
                    return (
                      <g key={s.key}>
                        <rect x={x0 + j * ancho} width={Math.max(ancho - 3, 2)} y={y} height={h}
                          fill={s.color} opacity={0.9} rx={1}>
                          <title>{`${etiqueta(a.fecha)} · ${s.label}: ${def.fmt(v)}`}</title>
                        </rect>
                        {/* valor en TODAS las barras (vertical para que entre) */}
                        <text x={cx} y={yLbl}
                          transform={`rotate(-90 ${cx} ${yLbl})`}
                          textAnchor={v >= 0 ? "start" : "end"}
                          className="fill-[var(--t-text)] font-medium"
                          fontSize={8.5} fontFamily="JetBrains Mono, monospace">
                          {def.corto(v)}
                        </text>
                      </g>
                    );
                  })}
                  <text x={M + i * slot + slot / 2} y={dim.h - 4} textAnchor="middle"
                    className="fill-[var(--t-text-muted)] font-medium" fontSize={10}
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
    <div className="flex items-baseline justify-between gap-3 text-[11px] font-mono border-b border-[var(--t-border)] py-[5px] last:border-0" title={title}>
      <span className="text-[var(--t-text-muted)] font-medium whitespace-nowrap">
        {label}
        {title && <span className="ml-0.5 text-[7px] align-super opacity-50">?</span>}
      </span>
      <span className="text-[var(--t-text)] font-semibold text-right whitespace-nowrap">{children}</span>
    </div>
  );
}

type CuadranteId = "precio" | "metricas" | "retornos" | "evolucion";

function Cuadrante({ id, titulo, children, extra, maxi, setMaxi }: {
  id: CuadranteId;
  titulo: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
  maxi: CuadranteId | null;
  setMaxi: (m: CuadranteId | null) => void;
}) {
  const esMax = maxi === id;
  if (maxi && !esMax) return null;   // otro cuadrante está maximizado
  return (
    <div className={`bg-[var(--t-panel)] min-w-0 min-h-0 flex flex-col ${esMax ? "col-span-2 row-span-2" : ""}`}>
      <div className="flex items-center px-3 py-1.5 border-b-2 border-[var(--t-border-2)] bg-[var(--t-surface)] shrink-0">
        <span className="text-[9px] tracking-widest font-bold text-[var(--t-accent)]">{titulo}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {extra}
          <button
            onClick={() => setMaxi(esMax ? null : id)}
            title={esMax ? "Restaurar los 4 paneles" : "Maximizar este panel"}
            className="px-1.5 py-0.5 text-[10px] leading-none border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] transition-colors"
          >
            {esMax ? "🗗" : "⛶"}
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

type TabMetricas = "negocio" | "salud" | "valuacion";

export function ReutersFicha({ ticker, onVolver }: { ticker: string; onVolver: () => void }) {
  const { data } = usePoll<Ficha | null>(
    `/api/research1816/reuters/ficha?ticker=${encodeURIComponent(ticker)}`,
    null, POLL_MS, { fetchOnMount: true },
  );
  const [tab, setTab] = usePersistedState<TabMetricas>("reuters.ficha.tab", "negocio");
  // Grupo graficado abajo-derecha: sigue al tab de métricas (valuación no tiene
  // serie con historia real → mantiene el último grupo), pero se puede elegir.
  const [grupo, setGrupo] = useState<GrupoSerie>("resultados");
  // El cuadrante de abajo-derecha muestra la evolución de resultados O el
  // desglose por segmento (son la misma pregunta desde dos ángulos: cómo
  // evolucionó vs. de dónde sale).
  const [verSegmentos, setVerSegmentos] = usePersistedState("reuters.ficha.segmentos", false);
  useEffect(() => {
    if (tab === "negocio") setGrupo("resultados");
    else if (tab === "salud") setGrupo("salud");
  }, [tab]);
  // Cuadrante maximizado (⛶ en cada panel) — null = los 4 visibles.
  const [maxi, setMaxi] = useState<CuadranteId | null>(null);

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
        <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-[2px] bg-[var(--t-border-2)] border-t-2 border-[var(--t-border-2)]">
          {/* ── Arriba-izquierda: precio 1 año ── */}
          <Cuadrante id="precio" titulo="PRECIO — 1 AÑO" maxi={maxi} setMaxi={setMaxi}>
            {data.velas.length > 0
              ? <ChartAnual velas={data.velas} />
              : <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">sin serie de precios todavía</div>}
          </Cuadrante>

          {/* ── Arriba-derecha: métricas en tabs ── */}
          <Cuadrante id="metricas" titulo="MÉTRICAS" maxi={maxi} setMaxi={setMaxi} extra={
            <div className="flex gap-1">
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
              <div className="px-3 py-1.5 grid grid-cols-2 gap-x-8 content-start">
                {tab === "negocio" && (
                  <>
                    <Dato label="Ingresos (últ. año fiscal)" title="Ventas totales del último año fiscal, en USD.">{fmtMillones(f.revenue)}</Dato>
                    <Dato label="Utilidad bruta" title="Ingresos menos el costo directo de lo vendido.">{fmtMillones(f.gross_profit)}</Dato>
                    <Dato label="EBITDA" title="Resultado antes de intereses, impuestos, depreciación y amortización ≈ la caja que genera el negocio operando.">{fmtMillones(f.ebitda)}</Dato>
                    <Dato label="Resultado operativo" title="EBIT: ganancia de operar el negocio, antes de intereses e impuestos.">{fmtMillones(f.ebit)}</Dato>
                    <Dato label="Resultado neto" title="Ganancia final del año, después de todo (costos, intereses, impuestos).">{fmtMillones(f.net_income)}</Dato>
                    <Dato label="Free cash flow" title="Caja que queda tras operar E invertir (capex): la plata realmente disponible para deuda, dividendos o recompras.">{fmtMillones(f.fcf)}</Dato>
                    <Dato label="Capex" title="Inversión del año en activos fijos (plantas, equipos). Negativo = salida de caja.">{fmtMillones(f.capex)}</Dato>
                    <Dato label="Margen bruto" title="De cada $100 vendidos, cuántos quedan tras el costo directo de producir.">{pctPlano(f.margen_bruto)}</Dato>
                    <Dato label="Margen operativo" title="De cada $100 vendidos, cuántos quedan tras TODOS los costos de operar. Negativo = el negocio pierde plata operando."><span className={varClass(f.margen_operativo)}>{pctPlano(f.margen_operativo)}</span></Dato>
                    <Dato label="Margen neto" title="De cada $100 vendidos, cuántos llegan como ganancia final al accionista."><span className={varClass(f.margen_neto)}>{pctPlano(f.margen_neto)}</span></Dato>
                  </>
                )}
                {tab === "salud" && (
                  <>
                    <Dato label="Deuda total" title="Deuda financiera total (corto + largo plazo), en USD.">{fmtGrande(f.deuda_total)}</Dato>
                    <Dato label="Caja y equivalentes" title="Efectivo y colocaciones de disponibilidad inmediata.">{fmtGrande(f.caja)}</Dato>
                    <Dato label="Deuda neta / EBITDA" title="(Deuda − caja) ÷ EBITDA: años de EBITDA para pagar la deuda neta. <1 holgado · >3 muy apalancada · vacío si el EBITDA es negativo.">{fmtX(f.deuda_neta_ebitda)}</Dato>
                    <Dato label="Current ratio" title="Activos corrientes ÷ pasivos corrientes: si cubre lo que vence en el año. >1 cubre.">{fmtN(f.current_ratio, 2)}</Dato>
                    <Dato label="Quick ratio" title="Como el current ratio pero sin inventarios: solo lo más líquido.">{fmtN(f.quick_ratio, 2)}</Dato>
                    <Dato label="Acciones en circulación" title="Cantidad total de acciones emitidas. Market cap = precio × esta cantidad.">{fmtGrande(f.acciones).replace("$", "")}</Dato>
                  </>
                )}
                {tab === "valuacion" && (
                  <>
                    <Dato label="Market cap" title="Capitalización bursátil: precio × acciones en circulación — lo que vale el equity en bolsa.">{fmtGrande(f.market_cap)}</Dato>
                    <Dato label="Enterprise value" title="Market cap + deuda − caja: lo que costaría comprar la empresa ENTERA, haciéndose cargo de su deuda y quedándose su caja.">{fmtGrande(f.ev)}</Dato>
                    <Dato label="P/E" title="Precio ÷ ganancia por acción (últimos 12 meses): años de ganancias actuales que pagás. Alto = cara o con expectativa de crecimiento. Vacío = pierde plata.">{fmtX(f.pe)}</Dato>
                    <Dato label="P/E forward" title="P/E con la ganancia ESTIMADA por el consenso para el próximo año.">{fmtX(f.fwd_pe)}</Dato>
                    <Dato label="EV/EBITDA" title="Valor de la empresa entera ÷ EBITDA: compara empresas con distinta deuda. Menos = más barata.">{fmtX(f.ev_ebitda)}</Dato>
                    <Dato label="EV/EBITDA forward" title="EV/EBITDA con el EBITDA estimado del próximo año.">{fmtX(f.fwd_ev_ebitda)}</Dato>
                    <Dato label="EV/EBIT" title="Valor de la empresa entera ÷ resultado operativo (incluye el desgaste de los activos, a diferencia del EBITDA).">{fmtX(f.ev_ebit)}</Dato>
                    <Dato label="Precio / valor libro" title="Precio ÷ patrimonio contable por acción. Debajo de 1 cotiza por menos que su patrimonio.">{fmtX(f.p_bv)}</Dato>
                    <Dato label="Dividend yield" title="Dividendos del año ÷ precio: la renta anual por dividendos comprando hoy.">{pctPlano(f.div_yield)}</Dato>
                  </>
                )}
              </div>
            )}
          </Cuadrante>

          {/* ── Abajo-izquierda: retornos + market cap + rango 52s ── */}
          <Cuadrante id="retornos" titulo="RETORNOS" maxi={maxi} setMaxi={setMaxi}>
            <div className="px-3 py-1">
              <div className="grid grid-cols-2 gap-x-6">
                {RETORNOS.map((r) => (
                  <div key={r.key} className="flex items-baseline justify-between text-[11px] font-mono border-b border-[var(--t-border)] py-1">
                    <span className="text-[var(--t-text-muted)] font-medium">{r.label}</span>
                    <span className={`font-semibold ${varClass(q?.[r.key])}`}>{fmtPct(q?.[r.key])}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex flex-col gap-1.5">
                <Dato label="Market cap" title="Capitalización bursátil: precio × acciones en circulación.">{fmtGrande(f?.market_cap)}</Dato>
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
          <Cuadrante id="evolucion" titulo={verSegmentos ? "SEGMENTOS" : "EVOLUCIÓN"}
            maxi={maxi} setMaxi={setMaxi} extra={
            <div className="flex gap-1">
              {(Object.keys(GRUPOS_5A) as GrupoSerie[]).map((g) => (
                <button key={g} onClick={() => { setGrupo(g); setVerSegmentos(false); }}
                  className={`px-2 py-0.5 text-[9px] font-semibold border transition-colors ${
                    grupo === g && !verSegmentos
                      ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                      : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                  }`}>
                  {GRUPOS_5A[g].label}
                </button>
              ))}
              {/* De dónde salen las ventas (desglose por segmento / región) */}
              <button onClick={() => setVerSegmentos(true)}
                title="De dónde salen las ventas: desglose por segmento de negocio o por región, período a período"
                className={`px-2 py-0.5 text-[9px] font-semibold border transition-colors ${
                  verSegmentos
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                    : "text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
                }`}>
                SEGMENTOS
              </button>
            </div>
          }>
            {verSegmentos
              ? <ChartSegmentos ticker={ticker} />
              : serieAnual.length > 0 || serieTrim.length > 0
                ? <ChartEvolucion anual={serieAnual} trimestral={serieTrim} grupo={grupo} />
                : <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">sin serie histórica todavía — se carga con la próxima pasada diaria del feed</div>}
          </Cuadrante>
        </div>
      )}
    </div>
  );
}
