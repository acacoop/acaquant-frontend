import { apiFetch } from "@/lib/api";
import { ONsLiveView } from "@/components/ons-live";
import type { ONPago, ONRow } from "@/components/ons-live";

export const dynamic = "force-dynamic";

async function safeFetch<T>(path: string, fallback: T, revalidate = 30): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate });
  } catch {
    return fallback;
  }
}

export default async function ONsPage() {
  // SSR inicial — la tabla + curva pollean listar-curva?curva=on client-side;
  // el calendario es casi estático (TTL 300s) → solo SSR, sin poll.
  const [rows, calendario] = await Promise.all([
    safeFetch<ONRow[]>("/api/analitica/listar-curva?curva=on&ordenar_por=vencimiento", [], 10),
    safeFetch<ONPago[]>("/api/analitica/ons-calendario?meses=12", [], 300),
  ]);

  return <ONsLiveView initialRows={rows} calendario={calendario} />;
}
