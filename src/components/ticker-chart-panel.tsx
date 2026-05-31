"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TableHelp } from "./help-tooltip";
import type { TickerReturns } from "@/lib/types-scanner";

/**
 * Panel CHART & RETORNOS — cuadrante inferior derecho del Scanner.
 *
 * 2 tabs:
 *   CHART             → TradingView Advanced Chart embebido. Locked al
 *                       ticker seleccionado (sin búsqueda de symbol).
 *   RETORNOS DIARIOS  → Histograma SVG de los retornos del último año
 *                       (~252 puntos). Marca el retorno de hoy + media.
 *
 * Re-fetcha/re-monta cuando cambia el ticker.
 */

type Tab = "chart" | "returns";

const TAB_ORDER: { key: Tab; label: string }[] = [
  { key: "chart",   label: "CHART" },
  { key: "returns", label: "RETORNOS DIARIOS" },
];

const GLOSSARY = [
  { label: "CHART",            text: "Gráfico de TradingView embebido para el ticker seleccionado. Está bloqueado a ese símbolo — no podés buscar otros desde acá (para eso, seleccioná otro ticker en la tabla)." },
  { label: "RETORNOS DIARIOS", text: "Histograma de los retornos diarios aritméticos del último año (~252 días). Cada barra muestra cuántos días el activo se movió dentro de ese rango. La línea naranja marca el retorno del último día disponible — visualiza cuán raro/normal es ese movimiento vs su historia." },
  { label: "Media",            text: "Promedio simple de los retornos diarios de la ventana — debería estar cerca de 0 en activos sanos." },
  { label: "σ",                text: "Desvío estándar de los retornos diarios. Da una idea de cuánto típicamente se mueve el activo (66% de los días cae en ±1σ, 95% en ±2σ)." },
];

export function TickerChartPanel({ ticker }: { ticker: string | null }) {
  const [tab, setTab] = useState<Tab>("chart");
  const [returns, setReturns] = useState<TickerReturns | null>(null);

  // Fetch retornos solo cuando el tab activo es 'returns' (lazy).
  useEffect(() => {
    if (!ticker || tab !== "returns") return;
    let alive = true;
    fetch(`/api/scanner/returns/${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive) setReturns(j as TickerReturns | null);
      })
      .catch(() => {
        if (alive) setReturns(null);
      });
    return () => {
      alive = false;
    };
  }, [ticker, tab]);

  if (!ticker) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
        Seleccioná un ticker en la tabla
      </p>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-1 shrink-0">
        {TAB_ORDER.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
              tab === key
                ? "bg-[#ff9900] text-black border-[#ff9900]"
                : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[#ff9900] hover:border-[#ff9900]"
            }`}
          >
            {label}
          </button>
        ))}
        <TableHelp entries={GLOSSARY} />
        <span className="ml-auto text-[10px] text-[var(--t-text-dim)]">{ticker}</span>
      </div>

      {/* Contenido */}
      <div className="flex-1 min-h-0">
        {tab === "chart" ? (
          <TradingViewChart ticker={ticker} />
        ) : (
          <ReturnsHistogram data={returns} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TradingView Advanced Chart embebido
// ─────────────────────────────────────────────────────────────────────

function TradingViewChart({ ticker }: { ticker: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = "";

    // Estructura que pide el embed widget de TradingView.
    const widgetWrapper = document.createElement("div");
    widgetWrapper.className = "tradingview-widget-container__widget";
    widgetWrapper.style.height = "100%";
    widgetWrapper.style.width = "100%";
    container.appendChild(widgetWrapper);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize:           true,
      symbol:             ticker,           // TV resuelve la bolsa solo
      interval:           "D",
      timezone:           "America/Argentina/Buenos_Aires",
      theme:              "dark",
      style:              "1",              // 1 = velas
      locale:             "es",
      enable_publishing:  false,
      allow_symbol_change: false,           // locked al ticker
      hide_side_toolbar:  true,
      hide_top_toolbar:   false,
      hide_legend:        false,
      withdateranges:     true,
      backgroundColor:    "#080808",
      gridColor:          "#1a1a1a",
      support_host:       "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [ticker]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container h-full w-full"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Histograma SVG de retornos diarios
// ─────────────────────────────────────────────────────────────────────

function ReturnsHistogram({ data }: { data: TickerReturns | null }) {
  const bins = useMemo(() => {
    if (!data || data.returns.length === 0) return null;
    return buildHistogram(data.returns, 25);
  }, [data]);

  if (!data) {
    return <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">Cargando…</p>;
  }
  if (data.returns.length === 0) {
    return <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">Sin data histórica</p>;
  }
  if (!bins) {
    return <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">No se pudo binnear</p>;
  }

  const W = 480;
  const H = 220;
  const padding = { top: 10, right: 10, bottom: 28, left: 30 };
  const innerW = W - padding.left - padding.right;
  const innerH = H - padding.top - padding.bottom;
  const maxCount = Math.max(...bins.bins.map((b) => b.count));
  const barW = innerW / bins.bins.length;

  // Ticks "redondos" del eje X — 6 valores aprox. equiespaciados a múltiplos
  // de 1%, 2% o 5% según el rango. Mejor que solo min/max en las puntas.
  const xTicks = niceTicks(bins.min, bins.max, 6);
  const xScale = (v: number) =>
    padding.left + ((v - bins.min) / (bins.max - bins.min)) * innerW;

  // Posición del último retorno en X (escala lineal sobre el rango).
  const lastRet = data.last_return;
  const lastX =
    lastRet !== null && lastRet !== undefined
      ? padding.left +
        ((lastRet - bins.min) / (bins.max - bins.min)) * innerW
      : null;

  // Stats rápidas para el caption.
  const mean =
    data.returns.reduce((a, b) => a + b, 0) / data.returns.length;
  const variance =
    data.returns.reduce((a, b) => a + (b - mean) ** 2, 0) /
    (data.returns.length - 1 || 1);
  const std = Math.sqrt(variance);

  // Percentil del retorno de hoy (cuántos retornos históricos <= last).
  const pctRank =
    lastRet !== null && lastRet !== undefined
      ? (data.returns.filter((r) => r <= lastRet).length /
          data.returns.length) *
        100
      : null;

  return (
    <div className="h-full flex flex-row min-h-0 text-[10px] gap-3 items-stretch">
      <div className="flex-1 min-w-0 min-h-0 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full max-h-full h-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Eje X (línea base) */}
          <line
            x1={padding.left}
            x2={W - padding.right}
            y1={H - padding.bottom}
            y2={H - padding.bottom}
            stroke="#2a2a2a"
            strokeWidth={1}
          />

          {/* Barras */}
          {bins.bins.map((b, i) => {
            const h = (b.count / maxCount) * innerH;
            const x = padding.left + i * barW;
            const y = H - padding.bottom - h;
            // Color: rojo si bin es negativo, verde si positivo, gris si cruza 0.
            const color =
              b.high <= 0 ? "#ff3333" : b.low >= 0 ? "#00cc66" : "#888888";
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={Math.max(barW - 1, 1)}
                height={h}
                fill={color}
                opacity={0.65}
              />
            );
          })}

          {/* Línea cero */}
          {bins.min < 0 && bins.max > 0 && (() => {
            const zeroX =
              padding.left + ((0 - bins.min) / (bins.max - bins.min)) * innerW;
            return (
              <line
                x1={zeroX}
                x2={zeroX}
                y1={padding.top}
                y2={H - padding.bottom}
                stroke="#555555"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            );
          })()}

          {/* Línea del último retorno (naranja sólida) */}
          {lastX !== null && (
            <>
              <line
                x1={lastX}
                x2={lastX}
                y1={padding.top}
                y2={H - padding.bottom}
                stroke="#ff9900"
                strokeWidth={1.5}
              />
              <text
                x={lastX}
                y={padding.top + 8}
                fill="#ff9900"
                fontSize={9}
                textAnchor={
                  lastX > padding.left + innerW / 2 ? "end" : "start"
                }
                dx={lastX > padding.left + innerW / 2 ? -4 : 4}
              >
                HOY {(lastRet! * 100).toFixed(2)}%
              </text>
            </>
          )}

          {/* Eje X — múltiples ticks "redondos" + grid suave */}
          {xTicks.map((tv) => {
            const tx = xScale(tv);
            return (
              <g key={tv}>
                <line
                  x1={tx}
                  x2={tx}
                  y1={H - padding.bottom}
                  y2={H - padding.bottom + 3}
                  stroke="#555555"
                  strokeWidth={1}
                />
                <text
                  x={tx}
                  y={H - padding.bottom + 12}
                  fill="#888888"
                  fontSize={9}
                  textAnchor="middle"
                >
                  {(tv * 100).toFixed(tv === 0 ? 0 : Math.abs(tv) < 0.01 ? 2 : 1)}%
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Stats al costado derecho — una fila por stat, sin scroll. */}
      <div className="w-[100px] shrink-0 flex flex-col gap-1.5 text-[10px] pl-1">
        <Stat label="N" value={data.returns.length.toString()} />
        <Stat label="μ (diario)" value={`${(mean * 100).toFixed(3)}%`} />
        <Stat label="σ (diario)" value={`${(std * 100).toFixed(2)}%`} />
        {pctRank !== null && (
          <Stat
            label="HOY percentil"
            value={`${pctRank.toFixed(0)}%`}
            accent="orange"
          />
        )}
        <Stat label="MIN" value={`${(bins.min * 100).toFixed(2)}%`} accent="red" />
        <Stat label="MAX" value={`${(bins.max * 100).toFixed(2)}%`} accent="green" />
      </div>
    </div>
  );
}

// "Nice" ticks: valores redondos a múltiplos de 1%, 2% o 5% según rango.
function niceTicks(min: number, max: number, target: number): number[] {
  const range = max - min;
  if (range <= 0) return [];
  const rough = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / mag;
  let nice: number;
  if (norm < 1.5)      nice = 1;
  else if (norm < 3)   nice = 2;
  else if (norm < 7)   nice = 5;
  else                 nice = 10;
  const step = nice * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step / 2; v += step) {
    // Clamp dentro del rango visible.
    if (v >= min - step / 2 && v <= max + step / 2) ticks.push(+v.toFixed(10));
  }
  return ticks;
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "orange" | "red" | "green";
}) {
  const color =
    accent === "orange"
      ? "text-[#ff9900]"
      : accent === "red"
      ? "text-[#ff3333]"
      : accent === "green"
      ? "text-[#00cc66]"
      : "text-[var(--t-text)]";
  return (
    <div className="flex flex-col">
      <span className="text-[var(--t-text-muted)] text-[9px] uppercase tracking-wide">
        {label}
      </span>
      <span className={`tabular-nums font-semibold ${color}`}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Binner — divide los retornos en N bins equispaciados.
// ─────────────────────────────────────────────────────────────────────

function buildHistogram(values: number[], nbins: number) {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return null;
  const width = (max - min) / nbins;
  const bins = Array.from({ length: nbins }, (_, i) => ({
    low: min + i * width,
    high: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= nbins) idx = nbins - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  }
  return { bins, min, max };
}
