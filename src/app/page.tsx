import { NewsPanel } from "@/components/news-panel";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        {/* Columna izquierda — placeholder (definimos contenido después) */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex items-center justify-center text-[#555555] text-xs font-mono">
          (próximamente)
        </div>

        {/* Columna derecha — news panel live */}
        <div className="min-h-0">
          <NewsPanel />
        </div>
      </div>
    </div>
  );
}
