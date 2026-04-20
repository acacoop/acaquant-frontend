"use client";

import { useState } from "react";
import { NewsPanel } from "@/components/news-panel";
import { TradingViewChart } from "@/components/tradingview-chart";
import { WatchlistPanel } from "@/components/watchlist-panel";

export default function Home() {
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

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
            {selectedTicker ? (
              <div className="h-full flex flex-col min-h-0 border border-[#1a1a1a] bg-[#080808] overflow-hidden">
                <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0 flex items-center">
                  <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
                    Chart
                  </span>
                  <span className="ml-2 text-[10px] text-[#d0d0d0] font-mono">
                    {selectedTicker}
                  </span>
                  <span className="ml-auto text-[9px] text-[#555555]">TradingView</span>
                </div>
                <div className="flex-1 min-h-0">
                  <TradingViewChart symbol={selectedTicker} />
                </div>
              </div>
            ) : (
              <div className="h-full border border-[#1a1a1a] bg-[#080808] flex items-center justify-center text-[#555555] text-xs font-mono text-center px-6">
                Clickeá un ticker del watchlist arriba para ver el chart acá.
              </div>
            )}
          </div>
        </div>

        {/* Columna derecha: news */}
        <div className="min-h-0">
          <NewsPanel />
        </div>
      </div>
    </div>
  );
}
