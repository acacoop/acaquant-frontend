"use client";

import { useEffect, useState } from "react";
import { FuturosDlrCurveChart } from "@/components/futuros-dlr-curve-chart";
import { NewsPanel } from "@/components/news-panel";
import { TradingViewChart } from "@/components/tradingview-chart";
import { WatchlistPanel } from "@/components/watchlist-panel";

const DEFAULT_TICKER = "MERVAL";   // BCBA:IMV en TradingView (mapSymbol)

// Cualquier ticker DLR (outright, ej "DLR/MAY26") muestra la curva entera —
// TradingView no tiene los outrights de ROFEX y la serie temporal de un
// futuro en particular vale poco; lo que importa es la curva del momento.
function esTickerDlr(t: string): boolean {
  return t.startsWith("DLR/") || t === "FUTUROS ROFEX";
}

// ARGY no tiene chart propio — cuando el user filtra por ARGY o clickea una
// fila MEP/CCL/Oficial, el chart se queda en el default (MERVAL).
function esTickerArgy(t: string): boolean {
  return (
    t === "ARGY" ||
    t === "DOLAR MEP" ||
    t === "DOLAR CCL" ||
    t === "DOLAR OFICIAL"
  );
}

export function HomeView() {
  const [selectedTicker, setSelectedTicker] = useState<string>(DEFAULT_TICKER);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);

  const isDlr = esTickerDlr(selectedTicker);
  const isArgy = !isDlr && esTickerArgy(selectedTicker);
  const chartContent = isDlr ? (
    <FuturosDlrCurveChart selectedTicker={selectedTicker} />
  ) : (
    <TradingViewChart symbol={isArgy ? DEFAULT_TICKER : selectedTicker} />
  );

  const chartHeader = (
    <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[#ff9900]/10 shrink-0 flex items-center">
      <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
        Chart
      </span>
      <span className="ml-2 text-[10px] text-[#d0d0d0] font-mono">
        {isArgy ? DEFAULT_TICKER : selectedTicker}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className="text-[9px] text-[#555555]">
          {isDlr ? "Curva DLR" : "TradingView"}
        </span>
        <button
          onClick={() => setMaximized((m) => !m)}
          aria-label={maximized ? "Minimizar" : "Maximizar"}
          title={maximized ? "Minimizar (Esc)" : "Maximizar"}
          className="text-[#555555] hover:text-[#ff9900] transition-colors text-[14px] leading-none px-1"
        >
          {maximized ? "⊡" : "⛶"}
        </button>
      </span>
    </div>
  );

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        {/* Columna izquierda: watchlist 40% arriba · chart 60% abajo */}
        <div className="min-h-0 grid grid-rows-[2fr_3fr] gap-3">
          <div className="min-h-0">
            <WatchlistPanel
              onSelect={setSelectedTicker}
              selected={selectedTicker}
            />
          </div>
          <div className="min-h-0">
            <div className="h-full flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
              {chartHeader}
              <div className="flex-1 min-h-0">
                {!maximized && chartContent}
              </div>
            </div>
          </div>
        </div>

        {/* Columna derecha: news */}
        <div className="min-h-0">
          <NewsPanel />
        </div>
      </div>

      {/* Overlay fullscreen del chart */}
      {maximized && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setMaximized(false)}
        >
          <div
            className="bg-[var(--t-panel)] border border-[#ff9900] w-[96vw] h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {chartHeader}
            <div className="flex-1 min-h-0">
              {chartContent}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
