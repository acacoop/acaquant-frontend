"use client";

import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  createChart,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

import type { PivotLevels } from "@/lib/types-trading";

/**
 * Chart "% VS PIVOTS" — segundo gráfico de la vista TRADING (debajo del LIVE).
 *
 * Dos ejes Y independientes: IZQUIERDA el índice (QQQ) y DERECHA la card
 * seleccionada. En vez del precio, cada serie se grafica como el % del precio
 * respecto de su propio PP → los pivots (R3..S3) quedan como líneas horizontales
 * FIJAS en % y el último precio se lee como "cuánto está por encima/debajo de
 * cada pivote", el mismo dato del modo DIF % de las cards. Sirve para leer en
 * tiempo real qué tan cerca está cada instrumento de romper un nivel y operar la
 * divergencia índice ↔ activo. Feed: /api/trading/intraday (mismo del chart LIVE).
 */

const NIVELES: { k: keyof PivotLevels; label: string; color: string }[] = [
  { k: "r3", label: "R3", color: "#10b981" },
  { k: "r2", label: "R2", color: "#10b981" },
  { k: "r1", label: "R1", color: "#10b981" },
  { k: "pp", label: "PP", color: "#8a8a8a" },
  { k: "s1", label: "S1", color: "#ef4444" },
  { k: "s2", label: "S2", color: "#ef4444" },
  { k: "s3", label: "S3", color: "#ef4444" },
];

const COLOR_A = "#5fb3d4"; // índice (QQQ) — cyan, eje IZQUIERDO
const COLOR_B = "#ff9900"; // activo seleccionado — naranja, eje DERECHO

type IntradayRow = { t: string; c: number };

async function fetchIntraday(ticker: string): Promise<IntradayRow[]> {
  if (!ticker) return [];
  try {
    const r = await fetch(`/api/trading/intraday?ticker=${encodeURIComponent(ticker)}`, {
      cache: "no-store",
    });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

// PP efectivo: el pivote central (referencia del %). Sin pivots todavía, cae al
// primer close de la rueda → la serie arranca en 0 % igual.
function refPP(piv: PivotLevels | null | undefined, fallback: number): number {
  return piv && Number.isFinite(piv.pp) && piv.pp > 0 ? piv.pp : fallback;
}

function toPctData(rows: IntradayRow[], ref: number): { time: Time; value: number }[] {
  const out: { time: Time; value: number }[] = [];
  if (ref <= 0) return out;
  let prev = 0;
  for (const d of rows) {
    if (!d?.t || !Number.isFinite(d.c)) continue;
    const secs = Math.floor(Date.parse(d.t.endsWith("Z") ? d.t : d.t + "Z") / 1000);
    if (!Number.isFinite(secs) || secs <= prev) continue; // asc + sin dupes
    prev = secs;
    out.push({ time: secs as Time, value: (d.c / ref - 1) * 100 });
  }
  return out;
}

export function PivotPctChart({
  tickerA,
  pivotsA,
  tickerB,
  pivotsB,
}: {
  tickerA: string;
  pivotsA?: PivotLevels | null;
  tickerB: string;
  pivotsB?: PivotLevels | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const serieARef = useRef<ISeriesApi<"Line"> | null>(null);
  const serieBRef = useRef<ISeriesApi<"Line"> | null>(null);
  const linesARef = useRef<IPriceLine[]>([]);
  const linesBRef = useRef<IPriceLine[]>([]);
  // PP efectivo de cada serie → para dibujar los pivots con la misma normalización.
  const refARef = useRef(0);
  const refBRef = useRef(0);
  const [ready, setReady] = useState(0);
  const [hasData, setHasData] = useState(false);

  // Tema (claro/oscuro): misma señal que el resto de la app (clase "light" en <html>).
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setIsLight(el.classList.contains("light"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // ── Chart (una vez por tema) ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const txt = isLight ? "#16203a" : "#8a8a8a";
    const grid = isLight ? "#eef2f7" : "#141414";
    const border = isLight ? "#aab6c9" : "#2a2a2a";
    const bg = isLight ? "#ffffff" : "#080808";

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: txt,
        fontSize: 10,
        fontFamily: "JetBrains Mono, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: grid, style: LineStyle.Dotted },
        horzLines: { color: grid, style: LineStyle.Dotted },
      },
      // Dos ejes: IZQUIERDA índice (QQQ), DERECHA activo. Cada uno auto-escala
      // sobre lo visible (mismo criterio que el chart LIVE).
      leftPriceScale: {
        visible: true,
        borderColor: border,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      rightPriceScale: {
        visible: true,
        borderColor: border,
        scaleMargins: { top: 0.12, bottom: 0.12 },
      },
      timeScale: {
        borderColor: border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: border, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#ff9900" },
        horzLine: { color: border, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#ff9900" },
      },
      localization: {
        priceFormatter: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`,
      },
    });

    const serieA = chart.addSeries(LineSeries, {
      priceScaleId: "left",
      color: COLOR_A,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 3,
    });
    const serieB = chart.addSeries(LineSeries, {
      priceScaleId: "right",
      color: COLOR_B,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 3,
    });
    chartRef.current = chart;
    serieARef.current = serieA;
    serieBRef.current = serieB;
    setReady((n) => n + 1);

    const reset = () => {
      chart.priceScale("left").applyOptions({ autoScale: true });
      chart.priceScale("right").applyOptions({ autoScale: true });
      chart.timeScale().fitContent();
    };
    el.addEventListener("dblclick", reset);

    return () => {
      el.removeEventListener("dblclick", reset);
      chart.remove();
      chartRef.current = null;
      serieARef.current = null;
      serieBRef.current = null;
      linesARef.current = [];
      linesBRef.current = [];
    };
  }, [isLight]);

  // ── Datos (poll 3s) — ambas series ──
  useEffect(() => {
    const sA = serieARef.current;
    const sB = serieBRef.current;
    const chart = chartRef.current;
    if (!sA || !sB || !chart) return;
    let alive = true;
    let primera = true;

    const cargar = async () => {
      const [rowsA, rowsB] = await Promise.all([fetchIntraday(tickerA), fetchIntraday(tickerB)]);
      if (!alive) return;
      const refA = refPP(pivotsA, rowsA.find((d) => Number.isFinite(d.c))?.c ?? 0);
      const refB = refPP(pivotsB, rowsB.find((d) => Number.isFinite(d.c))?.c ?? 0);
      refARef.current = refA;
      refBRef.current = refB;
      const dataA = toPctData(rowsA, refA);
      const dataB = toPctData(rowsB, refB);
      sA.setData(dataA);
      sB.setData(dataB);
      const any = dataA.length > 0 || dataB.length > 0;
      setHasData(any);
      if (any && primera) {
        chart.timeScale().fitContent();
        primera = false;
      }
    };
    void cargar();
    const id = setInterval(cargar, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tickerA, tickerB, pivotsA, pivotsB, ready]);

  // ── Pivots como líneas horizontales en % (A → eje izq, B → eje der) ──
  useEffect(() => {
    const sA = serieARef.current;
    const sB = serieBRef.current;
    if (!sA || !sB) return;
    for (const l of linesARef.current) sA.removePriceLine(l);
    for (const l of linesBRef.current) sB.removePriceLine(l);
    linesARef.current = [];
    linesBRef.current = [];

    const dibujar = (
      serie: ISeriesApi<"Line">,
      piv: PivotLevels | null | undefined,
      ref: number,
      store: IPriceLine[],
    ) => {
      if (!piv || ref <= 0) return;
      for (const n of NIVELES) {
        const raw = piv[n.k];
        if (raw == null || !Number.isFinite(raw)) continue;
        const y = (raw / ref - 1) * 100;
        store.push(
          serie.createPriceLine({
            price: y,
            color: n.color,
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: n.label,
          }),
        );
      }
    };
    dibujar(sA, pivotsA, refARef.current, linesARef.current);
    dibujar(sB, pivotsB, refBRef.current, linesBRef.current);
  }, [pivotsA, pivotsB, ready, hasData]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {/* leyenda: qué serie es cada eje */}
      <div className="absolute top-1 left-1 z-10 flex items-center gap-3 px-1.5 py-0.5 bg-[var(--t-panel)]/80 text-[9px] font-mono pointer-events-none">
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-0.5" style={{ backgroundColor: COLOR_A }} />
          <span style={{ color: COLOR_A }}>{tickerA || "—"}</span>
          <span className="text-[var(--t-text-muted)]">izq</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-0.5" style={{ backgroundColor: COLOR_B }} />
          <span style={{ color: COLOR_B }}>{tickerB || "—"}</span>
          <span className="text-[var(--t-text-muted)]">der</span>
        </span>
      </div>
      {hasData && (
        <button
          onClick={() => {
            chartRef.current?.priceScale("left").applyOptions({ autoScale: true });
            chartRef.current?.priceScale("right").applyOptions({ autoScale: true });
            chartRef.current?.timeScale().fitContent();
          }}
          title="Ver la rueda completa (también con doble click)"
          className="absolute top-1 right-1 z-10 px-1.5 py-0.5 text-[9px] font-semibold border border-[var(--t-border-2)] bg-[var(--t-panel)]/80 text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
        >
          ⟲ todo
        </button>
      )}
      {!hasData && (
        <p className="absolute inset-0 flex items-center justify-center text-[var(--t-text-muted)] text-xs px-3 text-center">
          Sin operaciones en la rueda todavía — el chart se arma con el feed
          intradía desde el primer trade.
        </p>
      )}
    </div>
  );
}
