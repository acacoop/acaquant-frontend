import { NewsPanel } from "@/components/news-panel";
import { WatchlistPanel } from "@/components/watchlist-panel";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        {/* Columna izquierda — split vertical 50/50: watchlist arriba, placeholder abajo */}
        <div className="min-h-0 grid grid-rows-2 gap-3">
          <div className="min-h-0">
            <WatchlistPanel />
          </div>
          <div className="min-h-0 border border-[#1a1a1a] bg-[#080808] flex items-center justify-center text-[#555555] text-xs font-mono">
            (próximamente)
          </div>
        </div>

        {/* Columna derecha — news panel + reader inline */}
        <div className="min-h-0">
          <NewsPanel />
        </div>
      </div>
    </div>
  );
}
