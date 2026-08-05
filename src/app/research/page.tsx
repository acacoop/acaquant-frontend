import { safeFetch } from "@/lib/api";
import { ResearchView } from "@/components/research-view";
import type { ResearchData } from "@/components/research-view";

// Vista RESEARCH (nueva vista principal) — doc madre: docs/VISTA_RESEARCH.md.
// Nivel 1: research diario de 1816 (mails) a la derecha; Market Data (1816 API)
// a la izquierda como placeholder hasta la API key.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ResearchPage() {
  const data = await safeFetch<ResearchData>(
    "/api/research1816/mails?limit=30",
    { items: [], total: 0 },
  );
  return <ResearchView initial={data} />;
}
