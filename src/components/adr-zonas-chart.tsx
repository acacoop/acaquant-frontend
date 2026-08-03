"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

import { usePersistedState } from "@/lib/use-persisted-state";

/**
 * Chart ZONAS del ADR — segundo gráfico de la vista TRADING (reemplazó al
 * "% VS PIVOTS", que no se usaba).
 *
 * Es el panel MÉTRICAS → ZONAS de Renta Variable pero GRAFICADO: velas diarias
 * del subyacente USD (el ADR, no el CEDEAR) con los pivots Floor Trader del
 * timeframe elegido como líneas horizontales. Default SEMANAL — el chart de
 * arriba ya cubre el intradía/diario del CEDEAR en ARS; acá se lee dónde está
 * el papel contra las zonas de la semana/mes/año previos.
 *
 * Feed: /api/trading/adr-zonas (velas + los 4 frames en un solo hit, mismos
 * niveles que /api/scanner/pivot). Los niveles son estáticos (período previo
 * cerrado); el `last` es live del ADR → repoll cada 60s.
 */

const NIVELES: { k: keyof Levels; label: string; color: string }[] = [
  { k: "r3", label: "R3", color: "#10b981" },
  { k: "r2", label: "R2", color: "#10b981" },
  { k: "r1", label: "R1", color: "#10b981" },
  { k: "pp", label: "PP", color: "#8a8a8a" },
  { k: "s1", label: "S1", color: "#ef4444" },
  { k: "s2", label: "S2", color: "#ef4444" },
  { k: "s3", label: "S3", color: "#ef4444" },
];

const FRAMES = [
  { k: "diario", label: "DIARIO" },
  { k: "semanal", label: "SEMANAL" },
  { k: "mensual", label: "MENSUAL" },
  { k: "anual", label: "ANUAL" },
] as const;

type FrameKey = (typeof FRAMES)[number]["k"];

type Levels = { pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number };

type Frame = {
  label: string;
  fecha_desde: string;
  fecha_hasta: string;
  h: number;
  l: number;
  c: number;
  levels: Levels;
};

type Zonas = {
  ticker: string;
  underlying: string;
  last?: number | null;
  last_source?: "live" | "eod";
  sin_datos?: boolean;
  velas: { t: string; o: number; h: number; l: number; c: number }[];
  frames: Partial<Record<FrameKey, Frame | null>>;
};

const fmt = (v: number) => v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AdrZonasChart({ ticker }: { ticker: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  const labelItemsRef = useRef<{ el: HTMLSpanElement; price: number }[]>([]);
  const [ready, setReady] = useState(0);
  const [data, setData] = useState<Zonas | null>(null);
  const [frame, setFrame] = usePersistedState<FrameKey>("trading.zonas.frame", "semanal");

  // Etiquetas de nivel ancladas a la altura de su línea (el title nativo de las
  // price lines no se dibuja) — mismo patrón que el chart LIVE.
  const reposicionar = useCallback(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const { el, price } of labelItemsRef.current) {
      const y = series.priceToCoordinate(price);
      if (y == null || y < 0) {
        el.style.display = "none";
      } else {
        el.style.display = "block";
        el.style.top = `${y}px`;
      }
    }
  }, []);

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
      leftPriceScale: {
        visible: true,
        borderColor: border,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      rightPriceScale: { visible: false },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
      timeScale: { borderColor: border, timeVisible: false, rightOffset: 3 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: border, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#ff9900" },
        horzLine: { color: border, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#ff9900" },
      },
      localization: {
        priceFormatter: (v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      priceScaleId: "left",
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
      priceLineVisible: false,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    setReady((n) => n + 1);

    const reset = () => {
      chart.priceScale("left").applyOptions({ autoScale: true });
      chart.timeScale().fitContent();
      requestAnimationFrame(reposicionar);
    };
    el.addEventListener("dblclick", reset);
    const onRange = () => reposicionar();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    const ro = new ResizeObserver(() => reposicionar());
    ro.observe(el);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      ro.disconnect();
      el.removeEventListener("dblclick", reset);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
      labelItemsRef.current = [];
    };
  }, [isLight, reposicionar]);

  // ── Datos: velas EOD + frames (repoll 60s por el `last` live del ADR) ──
  useEffect(() => {
    if (!ticker) return;
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`/api/trading/adr-zonas?ticker=${encodeURIComponent(ticker)}`, {
          cache: "no-store",
        });
        if (!r.ok || !alive) return;
        setData((await r.json()) as Zonas);
      } catch {
        /* transitorio */
      }
    };
    setData(null);
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ticker]);

  // ── Velas al chart ──
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const velas = data?.velas ?? [];
    series.setData(
      velas.map((v) => ({ time: v.t as Time, open: v.o, high: v.h, low: v.l, close: v.c })),
    );
    if (velas.length) {
      chart.priceScale("left").applyOptions({ autoScale: true });
      chart.timeScale().fitContent();
    }
    requestAnimationFrame(reposicionar);
  }, [data, ready, reposicionar]);

  // ── Niveles del frame elegido + last live, como líneas horizontales ──
  useEffect(() => {
    const series = seriesRef.current;
    const layer = labelLayerRef.current;
    if (!series || !layer) return;
    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = [];
    layer.replaceChildren();
    labelItemsRef.current = [];

    const nivel = (price: number, label: string, color: string, solida: boolean) => {
      linesRef.current.push(
        series.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: solida ? LineStyle.Solid : LineStyle.Dashed,
          axisLabelVisible: false,
          title: "",
        }),
      );
      const el = document.createElement("span");
      el.textContent = label;
      Object.assign(el.style, {
        position: "absolute",
        right: "2px",
        top: "0px",
        transform: "translateY(-100%)",
        fontSize: "8px",
        lineHeight: "1",
        fontFamily: "JetBrains Mono, monospace",
        fontWeight: "600",
        color,
        display: "none",
        pointerEvents: "none",
      } as CSSStyleDeclaration);
      layer.appendChild(el);
      labelItemsRef.current.push({ el, price });
    };

    const f = data?.frames?.[frame];
    if (f?.levels) {
      for (const n of NIVELES) {
        const y = f.levels[n.k];
        if (y == null || !Number.isFinite(y)) continue;
        nivel(y, n.label, n.color, false);
      }
    }
    const last = data?.last;
    if (last != null && Number.isFinite(last)) nivel(last, "LAST", "#ff9900", true);
    requestAnimationFrame(reposicionar);
  }, [data, frame, ready, reposicionar]);

  const f = data?.frames?.[frame] ?? null;
  const last = data?.last ?? null;
  const sinDatos = !!data?.sin_datos;

  return (
    <div className="h-full w-full flex flex-col min-h-0">
      {/* selector de timeframe + contexto del período previo */}
      <div className="flex items-center gap-1 px-1 py-0.5 shrink-0 border-b border-[var(--t-border)] text-[9px]">
        {FRAMES.map(({ k, label }) => (
          <button
            key={k}
            type="button"
            onClick={() => setFrame(k)}
            className={
              "px-1.5 py-0.5 font-semibold tracking-wide border transition-colors " +
              (frame === k
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]")
            }
          >
            {label}
          </button>
        ))}
        <span className="ml-auto font-mono text-[var(--t-text-muted)] truncate">
          {f ? (
            <>
              {f.fecha_desde.slice(0, 10)} → {f.fecha_hasta.slice(0, 10)} · H {fmt(f.h)} L {fmt(f.l)} C{" "}
              {fmt(f.c)}
            </>
          ) : (
            "—"
          )}
          {last != null && (
            <span className="ml-2 text-[var(--t-accent)]">
              last {fmt(last)}
              {data?.last_source === "live" ? " LIVE" : ""}
            </span>
          )}
        </span>
      </div>

      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} className="h-full w-full" />
        <div ref={labelLayerRef} className="absolute inset-0 z-[5] overflow-hidden pointer-events-none" />
        {sinDatos && (
          <p className="absolute inset-0 flex items-center justify-center text-[var(--t-text-muted)] text-xs px-3 text-center">
            Sin serie USD para {ticker}. Las zonas se calculan sobre el ADR/subyacente —
            un bono o un CEDEAR sin underlying no tiene este chart.
          </p>
        )}
      </div>
    </div>
  );
}
