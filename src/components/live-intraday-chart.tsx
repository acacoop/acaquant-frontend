"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  createChart,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";

import { VWAP_COLOR, type PivotLevels } from "@/lib/types-trading";

// Niveles a dibujar como líneas horizontales (R verde, S rojo, PP gris).
const NIVELES: { k: keyof PivotLevels; label: string; color: string }[] = [
  { k: "r3", label: "R3", color: "#10b981" },
  { k: "r2", label: "R2", color: "#10b981" },
  { k: "r1", label: "R1", color: "#10b981" },
  { k: "pp", label: "PP", color: "#8a8a8a" },
  { k: "s1", label: "S1", color: "#ef4444" },
  { k: "s2", label: "S2", color: "#ef4444" },
  { k: "s3", label: "S3", color: "#ef4444" },
];

/**
 * Chart LIVE intradía — NUESTRO feed por minuto, vía /api/trading/intraday (el
 * backend resuelve la fuente por ticker: CEDEAR → cedears_time_sales; bono →
 * mercado.timesales). Solo la rueda de hoy; se arma desde el primer trade.
 * Autocontenido: recibe `ticker` y se refetcha/repolea solo (3s).
 *
 * MANIPULABLE (pedido de la mesa 2026-07-14, motor lightweight-charts — el
 * mismo de RETORNO TOTAL): arrastrás para moverte entre horarios, rueda del
 * mouse / pinch para zoom en el eje X, y la ESCALA Y SE RE-AJUSTA SOLA a lo
 * visible — un trade sucio en la apertura ya no aplasta la rueda entera:
 * zoomeás pasada la apertura y el resto se lee bien. Doble click o el botón
 * "⟲ todo" vuelven a la rueda completa. Mientras no toques el chart, sigue
 * solo al último dato del poll.
 *
 * VWAP: línea horizontal en el valor REAL del snapshot (prop `vwap`, el mismo
 * que la card) — se mueve en cada poll. Sólida, para no confundir con los
 * niveles (punteados). Pivots/VWAP no estiran la escala (líneas de precio).
 */
export function LiveIntradayChart({
  ticker,
  pivots,
  vwap,
}: {
  ticker: string;
  pivots?: PivotLevels | null;
  vwap?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  // Etiquetas de los niveles ("R1", "VWAP"…): spans propios anclados a la
  // altura de cada línea (el title nativo de las price lines no se dibuja) —
  // se reposicionan en cada pan/zoom/poll vía priceToCoordinate.
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  const labelItemsRef = useRef<{ el: HTMLSpanElement; price: number }[]>([]);
  // true apenas el user arrastra/zoomea → el poll deja de re-encuadrar.
  const interactedRef = useRef(false);
  const [ready, setReady] = useState(0);
  const [hasData, setHasData] = useState(false);

  // Recalcula el top de cada etiqueta según la escala visible. Solo toca refs
  // (identidad estable) — se llama en pan/zoom, poll, resize y cambio de líneas.
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
      // Eje Y a la IZQUIERDA (como venía). autoScale (default) = la escala se
      // recalcula sobre lo VISIBLE — el fix del pico sucio de apertura.
      leftPriceScale: {
        visible: true,
        borderColor: border,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      // El eje de PRECIOS no se arrastra: hacerlo apagaba autoScale para
      // siempre y al cambiar de card la serie nueva quedaba fuera de la escala
      // vieja → chart "congelado" en la card anterior (bug 2026-07-15). La
      // escala Y se ajusta SOLA a lo visible; manipulable es solo el eje X.
      handleScale: {
        axisPressedMouseMove: { time: true, price: false },
      },
      rightPriceScale: { visible: false },
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
        priceFormatter: (v: number) =>
          v.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
      },
    });
    const series = chart.addSeries(AreaSeries, {
      priceScaleId: "left",
      lineColor: "#ff9900",
      lineWidth: 2,
      topColor: "rgba(255, 153, 0, 0.30)",
      bottomColor: "rgba(255, 153, 0, 0.02)",
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    setReady((n) => n + 1);

    // Cualquier gesto del user (drag / rueda / touch) frena el auto-encuadre.
    const marcar = () => { interactedRef.current = true; };
    el.addEventListener("pointerdown", marcar);
    el.addEventListener("wheel", marcar, { passive: true });
    // Doble click = volver a la rueda completa y retomar el seguimiento.
    const reset = () => {
      interactedRef.current = false;
      chart.priceScale("left").applyOptions({ autoScale: true });
      chart.timeScale().fitContent();
      requestAnimationFrame(reposicionar);
    };
    el.addEventListener("dblclick", reset);

    // Las etiquetas siguen a la escala: pan/zoom (la escala Y se re-ajusta a lo
    // visible) y cambios de tamaño reposicionan.
    const onRange = () => reposicionar();
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    const ro = new ResizeObserver(() => reposicionar());
    ro.observe(el);

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      ro.disconnect();
      el.removeEventListener("pointerdown", marcar);
      el.removeEventListener("wheel", marcar);
      el.removeEventListener("dblclick", reset);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      linesRef.current = [];
      labelItemsRef.current = [];
    };
  }, [isLight, reposicionar]);

  // ── Datos (poll 3s) ──
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    let alive = true;
    let primera = true;
    interactedRef.current = false;
    // Cambio de ticker (card nueva): la escala Y vuelve a ajustarse sola,
    // por si algún gesto sobre el eje la dejó fija en los precios anteriores.
    chart.priceScale("left").applyOptions({ autoScale: true });

    const fetchSerie = async () => {
      try {
        const r = await fetch(
          `/api/trading/intraday?ticker=${encodeURIComponent(ticker)}`,
          { cache: "no-store" },
        );
        if (!r.ok || !alive) return;
        const j = await r.json();
        const rows: { t: string; c: number }[] = Array.isArray(j) ? j : [];
        // ts naive ART → epoch como si fuera UTC: el chart (que muestra UTC)
        // rendea la MISMA hora de pared ART en cualquier browser.
        const data: { time: Time; value: number }[] = [];
        let prev = 0;
        for (const d of rows) {
          if (!d?.t || !Number.isFinite(d.c)) continue;
          const secs = Math.floor(Date.parse(d.t.endsWith("Z") ? d.t : d.t + "Z") / 1000);
          if (!Number.isFinite(secs) || secs <= prev) continue; // asc + sin dupes
          prev = secs;
          data.push({ time: secs as Time, value: d.c });
        }
        if (!alive) return;
        series.setData(data);
        setHasData(data.length > 0);
        // Mientras el user no tocó el chart, se sigue viendo la rueda entera
        // (con datos nuevos incluidos). Si arrastró/zoomeó, su ventana MANDA.
        if (data.length > 0 && (primera || !interactedRef.current)) {
          chart.timeScale().fitContent();
          primera = false;
        }
        requestAnimationFrame(reposicionar);  // la escala pudo moverse con el dato nuevo
      } catch {
        /* transitorio */
      }
    };
    fetchSerie();
    const id = setInterval(fetchSerie, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ticker, ready, reposicionar]);

  // ── Pivots + VWAP como líneas de precio (no estiran la escala) + etiquetas ──
  useEffect(() => {
    const series = seriesRef.current;
    const layer = labelLayerRef.current;
    if (!series || !layer) return;
    for (const l of linesRef.current) series.removePriceLine(l);
    linesRef.current = [];
    layer.replaceChildren();
    labelItemsRef.current = [];

    const nivel = (price: number, label: string, color: string, solida: boolean) => {
      linesRef.current.push(series.createPriceLine({
        price,
        color,
        lineWidth: 1,
        lineStyle: solida ? LineStyle.Solid : LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      }));
      // Etiqueta propia sobre el borde derecho, anclada a la altura de la línea.
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

    if (vwap != null && Number.isFinite(vwap)) nivel(vwap, "VWAP", VWAP_COLOR, true);
    if (pivots) {
      for (const n of NIVELES) {
        const y = pivots[n.k];
        if (y == null || !Number.isFinite(y)) continue;
        nivel(y, n.label, n.color, false);
      }
    }
    requestAnimationFrame(reposicionar);
  }, [pivots, vwap, ready, reposicionar]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {/* Etiquetas de niveles (R/S/PP/VWAP) — capa propia sobre el canvas,
          transparente al mouse; reposicionar() las mueve con la escala. */}
      <div ref={labelLayerRef} className="absolute inset-0 z-[5] overflow-hidden pointer-events-none" />
      {/* Volver a la rueda completa (= doble click) */}
      {hasData && (
        <button
          onClick={() => {
            interactedRef.current = false;
            chartRef.current?.priceScale("left").applyOptions({ autoScale: true });
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
          Sin operaciones en la rueda de hoy todavía. El chart LIVE se arma con
          nuestro feed intradía desde el primer trade.
        </p>
      )}
    </div>
  );
}
