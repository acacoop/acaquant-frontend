"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  LineStyle,
  type AutoscaleInfo,
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
 * timeframe elegido como líneas horizontales. Default SEMANAL + ventana 1M — el
 * chart de arriba cubre el intradía del CEDEAR en ARS; acá se opera contra las
 * zonas de la semana/mes previos SIN tener que mirar medio año de velas.
 *
 * Del ADR solo hay velas DIARIAS (mercado.precios_acciones): `adr_snapshot` es
 * un único quote live por papel, sin histórico → no hay serie intradía USD que
 * graficar. La ventana más corta posible es 1 mes de velas diarias.
 *
 * Feed: /api/trading/adr-zonas (velas + los 4 frames en un solo hit, mismos
 * niveles que /api/scanner/pivot). Los niveles son estáticos (período previo
 * cerrado); el `last` es live del ADR → repoll cada 60s.
 *
 * Escala Y MANIPULABLE: se arrastra el eje de precios (y doble click / ⟲
 * vuelven al encuadre automático). El autoscale incluye los niveles del frame
 * activo, así R3/S3 nunca quedan fuera de pantalla.
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

// Ventana visible en RUEDAS (~21 por mes). 0 = toda la serie que trajo el fetch.
const RANGOS = [
  { k: "1m", label: "1M", velas: 21 },
  { k: "3m", label: "3M", velas: 63 },
  { k: "6m", label: "6M", velas: 126 },
  { k: "1a", label: "1A", velas: 0 },
] as const;

type FrameKey = (typeof FRAMES)[number]["k"];
type RangoKey = (typeof RANGOS)[number]["k"];

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
  // Niveles del frame activo — los lee el autoscaleInfoProvider de la serie
  // (las price lines por sí solas NO estiran la escala).
  const levelsRef = useRef<number[]>([]);
  const [ready, setReady] = useState(0);
  const [data, setData] = useState<Zonas | null>(null);
  const [frame, setFrame] = usePersistedState<FrameKey>("trading.zonas.frame", "semanal");
  const [rango, setRango] = usePersistedState<RangoKey>("trading.zonas.rango", "1m");

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

  // Encuadra la ventana elegida (últimas N ruedas) y devuelve la escala Y al
  // automático — también es el "volver" del doble click / botón ⟲.
  const encuadrar = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.priceScale("left").applyOptions({ autoScale: true });
    const n = RANGOS.find((r) => r.k === rango)?.velas ?? 0;
    const total = data?.velas?.length ?? 0;
    if (n > 0 && total > n) {
      chart.timeScale().setVisibleLogicalRange({ from: total - n, to: total + 2 });
    } else {
      chart.timeScale().fitContent();
    }
    requestAnimationFrame(reposicionar);
  }, [rango, data, reposicionar]);

  // El listener de doble click se registra una vez con el chart → lee el
  // encuadre vigente por ref (cambia con el rango y los datos).
  const encuadrarRef = useRef(encuadrar);
  useEffect(() => {
    encuadrarRef.current = encuadrar;
  }, [encuadrar]);

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
      // El eje de PRECIOS se arrastra (pedido de la mesa: la escala fija no
      // sirve para operar). El botón ⟲ / doble click devuelven el automático.
      handleScale: { axisPressedMouseMove: { time: true, price: true } },
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
      // La escala tiene que entrar los niveles del frame, no solo las velas.
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const res = original();
        const lv = levelsRef.current;
        if (!res?.priceRange || !lv.length) return res;
        return {
          ...res,
          priceRange: {
            minValue: Math.min(res.priceRange.minValue, ...lv),
            maxValue: Math.max(res.priceRange.maxValue, ...lv),
          },
        };
      },
    });
    chartRef.current = chart;
    seriesRef.current = series;
    setReady((n) => n + 1);

    const reset = () => encuadrarRef.current();
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
        const r = await fetch(
          `/api/trading/adr-zonas?ticker=${encodeURIComponent(ticker)}&dias=400`,
          { cache: "no-store" },
        );
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

  // ── Velas al chart (el encuadre lo pone la ventana elegida) ──
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const velas = data?.velas ?? [];
    series.setData(
      velas.map((v) => ({ time: v.t as Time, open: v.o, high: v.h, low: v.l, close: v.c })),
    );
    if (velas.length) encuadrar();
  }, [data, ready, encuadrar]);

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
    const niveles: number[] = [];
    if (f?.levels) {
      for (const n of NIVELES) {
        const y = f.levels[n.k];
        if (y == null || !Number.isFinite(y)) continue;
        niveles.push(y);
        nivel(y, n.label, n.color, false);
      }
    }
    const last = data?.last;
    if (last != null && Number.isFinite(last)) nivel(last, "LAST", "#ff9900", true);
    levelsRef.current = niveles;
    chartRef.current?.priceScale("left").applyOptions({ autoScale: true });
    requestAnimationFrame(reposicionar);
  }, [data, frame, ready, reposicionar]);

  const f = data?.frames?.[frame] ?? null;
  const last = data?.last ?? null;
  const sinDatos = !!data?.sin_datos;

  return (
    <div className="h-full w-full flex flex-col min-h-0">
      {/* timeframe de los niveles | ventana visible | contexto del período previo */}
      <div className="flex items-center gap-1 px-1 py-0.5 shrink-0 border-b border-[var(--t-border)] text-[9px]">
        {FRAMES.map(({ k, label }) => (
          <button
            key={k}
            type="button"
            onClick={() => setFrame(k)}
            title={`Zonas del ${label.toLowerCase()} previo`}
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
        <span className="flex items-center gap-1 pl-1.5 ml-0.5 border-l border-[var(--t-border)]">
          {RANGOS.map(({ k, label }) => (
            <button
              key={k}
              type="button"
              onClick={() => setRango(k)}
              title="Cuántas ruedas se ven"
              className={
                "px-1.5 py-0.5 font-semibold tracking-wide border transition-colors " +
                (rango === k
                  ? "bg-[var(--t-text-dim)] text-[var(--t-panel)] border-[var(--t-text-dim)]"
                  : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]")
              }
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={encuadrar}
            title="Reencuadrar (también con doble click). El eje de precios se arrastra."
            className="px-1 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
          >
            ⟲
          </button>
        </span>
        <span className="ml-auto font-mono text-[var(--t-text-muted)] truncate">
          {f ? (
            <>
              {f.fecha_desde.slice(5, 10)}→{f.fecha_hasta.slice(5, 10)} · H {fmt(f.h)} L {fmt(f.l)} C{" "}
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
