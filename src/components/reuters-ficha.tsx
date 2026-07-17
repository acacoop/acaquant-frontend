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

import { usePoll } from "@/lib/use-poll";

// TRADING → REUTERS → FICHA de empresa: una pantalla, curada ("menos es más").
// Header (precio live + rango 52s + próximo balance) · chart 1 año · bloques
// VALUACIÓN / NEGOCIO (FY0 + serie 5 años) / SALUD / CONSENSO / RETORNOS.
// Datos: quote live del feed + fundamentals diarios + velas EOD de la casa.
const POLL_MS = 10_000;

interface SerieAnual {
  fecha: string;
  revenue: number | null;
  ebitda: number | null;
  net_income: number | null;
  fcf: number | null;
}

interface Ficha {
  ticker: string;
  ric: string | null;
  ratio: number | null;
  quote: Record<string, number | string | null> | null;
  fundamentals: (Record<string, number | string | null> & { serie_anual?: SerieAnual[] }) | null;
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

// Los resultados FY0 vienen en MILLONES de USD.
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

function recTexto(v: unknown): string {
  const n = num(v);
  if (n === null) return "—";
  if (n <= 1.5) return "COMPRA FUERTE";
  if (n <= 2.5) return "COMPRA";
  if (n <= 3.5) return "MANTENER";
  if (n <= 4.5) return "VENTA";
  return "VENTA FUERTE";
}

// ── chart 1 año (mismo motor y tema que el resto de la app) ──────────────────
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

// Mini-barras de la serie anual (5 años) — negativo en rojo bajo la línea.
function MiniBarras({ serie, campo }: { serie: SerieAnual[]; campo: keyof SerieAnual }) {
  const vals = serie.map((s) => num(s[campo]));
  const maxAbs = Math.max(...vals.map((v) => Math.abs(v ?? 0)), 1);
  return (
    <svg width={serie.length * 9} height={16} className="inline-block align-middle">
      {vals.map((v, i) => {
        if (v === null) return null;
        const h = Math.max(1, (Math.abs(v) / maxAbs) * 14);
        return (
          <rect key={i} x={i * 9} width={6}
            y={v >= 0 ? 15 - h : 1}
            height={h}
            className={v >= 0 ? "fill-green-500" : "fill-red-500"}
            opacity={0.35 + 0.65 * ((i + 1) / vals.length)} />
        );
      })}
    </svg>
  );
}

// ── bloques ──────────────────────────────────────────────────────────────────
function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] min-w-0">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] text-[9px] tracking-widest text-[var(--t-text-muted)]">{titulo}</div>
      <div className="p-3 flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Dato({ label, children, title }: { label: string; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px] font-mono" title={title}>
      <span className="text-[var(--t-text-muted)] whitespace-nowrap">{label}</span>
      <span className="text-[var(--t-text)] text-right whitespace-nowrap">{children}</span>
    </div>
  );
}

export function ReutersFicha({ ticker, onVolver }: { ticker: string; onVolver: () => void }) {
  const { data } = usePoll<Ficha | null>(
    `/api/trading/reuters/ficha?ticker=${encodeURIComponent(ticker)}`,
    null, POLL_MS, { fetchOnMount: true },
  );

  const q = data?.quote ?? null;
  const f = data?.fundamentals ?? null;
  const serie = (f?.serie_anual ?? []).slice().reverse(); // viejo → nuevo
  const last = num(q?.last);
  const target = num(f?.target_medio);
  const upside = last && target ? (target / last - 1) * 100 : null;
  const min52 = num(f?.min_52s);
  const max52 = num(f?.max_52s);
  const pos52 = last !== null && min52 !== null && max52 !== null && max52 > min52
    ? Math.min(1, Math.max(0, (last - min52) / (max52 - min52)))
    : null;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <button onClick={onVolver}
          className="px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors">
          ← VOLVER
        </button>
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] font-semibold text-[var(--t-text)]">{(f?.nombre as string) ?? ticker}</span>
            <span className="text-[10px] text-[var(--t-accent)] font-mono">{ticker}</span>
            {data?.ric && <span className="text-[9px] text-[var(--t-text-dim)] font-mono">{data.ric}</span>}
          </div>
          <div className="text-[9px] text-[var(--t-text-muted)] tracking-wide">
            {(f?.industria as string) ?? "—"}{f?.pais ? ` · ${f.pais}` : ""}
            {data?.ratio ? ` · ratio ${fmtN(data.ratio, 0)}:1` : ""}
          </div>
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
          <div className="text-right">
            <div className="text-[16px] font-semibold text-[var(--t-text)]">{last === null ? "—" : fmtN(last)}</div>
            <div className={`text-[10px] ${varClass(q?.var_pct)}`}>{fmtPct(q?.var_pct, 2)} hoy</div>
          </div>
        </div>
      </div>

      {!data ? (
        <div className="p-4 text-[11px] text-[var(--t-text-muted)]">Cargando {ticker}…</div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto p-3 flex flex-col gap-3">
          {/* Chart + lateral */}
          <div className="flex gap-3 min-h-[260px]">
            <div className="flex-1 border border-[var(--t-border)] min-w-0">
              {data.velas.length > 0
                ? <ChartAnual velas={data.velas} />
                : <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">sin serie de precios todavía</div>}
            </div>
            <div className="w-[300px] shrink-0 flex flex-col gap-3">
              <Bloque titulo="RANGO 52 SEMANAS">
                <div className="flex items-center justify-between text-[10px] font-mono text-[var(--t-text-muted)]">
                  <span>{fmtN(min52)}</span><span>{fmtN(max52)}</span>
                </div>
                <div className="relative h-1.5 bg-[var(--t-surface-2)]">
                  {pos52 !== null && (
                    <div className="absolute top-[-3px] w-[3px] h-3 bg-[var(--t-accent)]" style={{ left: `${pos52 * 100}%` }} />
                  )}
                </div>
              </Bloque>
              <Bloque titulo="CONSENSO DE ANALISTAS">
                <Dato label="Target medio">{fmtN(target)}</Dato>
                <Dato label="Upside al target">
                  <span className={varClass(upside)}>{fmtPct(upside)}</span>
                </Dato>
                <Dato label="Recomendación" title="Promedio de analistas (1 = compra fuerte · 5 = venta)">
                  {recTexto(f?.rec_media)} <span className="text-[var(--t-text-dim)]">({fmtN(f?.rec_media, 1)})</span>
                </Dato>
                <Dato label="Próximo balance">{fecha(f?.proximo_balance)}</Dato>
              </Bloque>
              <Bloque titulo="RETORNOS">
                <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                  {([["MTD", "ret_mtd"], ["YTD", "ret_ytd"], ["1A", "ret_1y"],
                     ["5D", "ret_5d"], ["3M", "ret_3m"], ["5A", "ret_5y"]] as const).map(([lbl, k]) => (
                    <div key={k} className="flex flex-col items-center border border-[var(--t-border)] py-1">
                      <span className="text-[8px] text-[var(--t-text-dim)] tracking-widest">{lbl}</span>
                      <span className={varClass(q?.[k])}>{fmtPct(q?.[k])}</span>
                    </div>
                  ))}
                </div>
              </Bloque>
            </div>
          </div>

          {/* Bloques fundamentales */}
          {f ? (
            <div className="grid grid-cols-3 gap-3">
              <Bloque titulo="VALUACIÓN">
                <Dato label="Market cap">{fmtGrande(f.market_cap)}</Dato>
                <Dato label="Enterprise value">{fmtGrande(f.ev)}</Dato>
                <Dato label="P/E">{fmtX(f.pe)}</Dato>
                <Dato label="P/E forward">{fmtX(f.fwd_pe)}</Dato>
                <Dato label="EV/EBITDA">{fmtX(f.ev_ebitda)}</Dato>
                <Dato label="EV/EBITDA fwd">{fmtX(f.fwd_ev_ebitda)}</Dato>
                <Dato label="P/valor libro">{fmtX(f.p_bv)}</Dato>
                <Dato label="Dividend yield">{pctPlano(f.div_yield)}</Dato>
              </Bloque>
              <Bloque titulo="NEGOCIO — último año fiscal">
                <Dato label="Ingresos">
                  {serie.length > 1 && <MiniBarras serie={serie} campo="revenue" />}{" "}
                  {fmtMillones(f.revenue)}
                </Dato>
                <Dato label="EBITDA">
                  {serie.length > 1 && <MiniBarras serie={serie} campo="ebitda" />}{" "}
                  {fmtMillones(f.ebitda)}
                </Dato>
                <Dato label="Resultado neto">
                  {serie.length > 1 && <MiniBarras serie={serie} campo="net_income" />}{" "}
                  {fmtMillones(f.net_income)}
                </Dato>
                <Dato label="Free cash flow">
                  {serie.length > 1 && <MiniBarras serie={serie} campo="fcf" />}{" "}
                  {fmtMillones(f.fcf)}
                </Dato>
                <Dato label="Margen bruto">{pctPlano(f.margen_bruto)}</Dato>
                <Dato label="Margen operativo">
                  <span className={varClass(f.margen_operativo)}>{pctPlano(f.margen_operativo)}</span>
                </Dato>
                <Dato label="Margen neto">
                  <span className={varClass(f.margen_neto)}>{pctPlano(f.margen_neto)}</span>
                </Dato>
              </Bloque>
              <Bloque titulo="SALUD FINANCIERA">
                <Dato label="Deuda total">{fmtGrande(f.deuda_total)}</Dato>
                <Dato label="Caja">{fmtGrande(f.caja)}</Dato>
                <Dato label="Deuda neta/EBITDA">{fmtX(f.deuda_neta_ebitda)}</Dato>
                <Dato label="Current ratio">{fmtN(f.current_ratio, 2)}</Dato>
                <Dato label="Quick ratio">{fmtN(f.quick_ratio, 2)}</Dato>
                <Dato label="Capex (año)">{fmtMillones(f.capex)}</Dato>
                <Dato label="Acciones en circ.">{fmtGrande(f.acciones)?.replace("$", "")}</Dato>
              </Bloque>
            </div>
          ) : (
            <div className="p-3 text-[10px] text-[var(--t-text-muted)] border border-[var(--t-border)]">
              Sin fundamentals todavía — se cargan solos con la primera pasada diaria del feed de la oficina.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
