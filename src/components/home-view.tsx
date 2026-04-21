"use client";

import { useEffect, useState } from "react";
import { NewsPanel } from "@/components/news-panel";
import { TradingViewChart } from "@/components/tradingview-chart";
import { WatchlistPanel } from "@/components/watchlist-panel";

const DEFAULT_TICKER = "MERVAL";   // BCBA:IMV en TradingView (mapSymbol)

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

  const chartHeader = (
    <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0 flex items-center">
      <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
        Chart
      </span>
      <span className="ml-2 text-[10px] text-[#d0d0d0] font-mono">
        {selectedTicker}
      </span>
      <span className="ml-auto flex items-center gap-2">
        <span className="text-[9px] text-[#555555]">TradingView</span>
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
            <div className="h-full flex flex-col min-h-0 border border-[#1a1a1a] bg-[#080808] overflow-hidden">
              {chartHeader}
              <div className="flex-1 min-h-0">
                {!maximized && <TradingViewChart symbol={selectedTicker} />}
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
            className="bg-[#080808] border border-[#ff9900] w-[96vw] h-[92vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {chartHeader}
            <div className="flex-1 min-h-0">
              <TradingViewChart symbol={selectedTicker} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
