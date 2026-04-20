import { apiFetch } from "@/lib/api";
import { PortfolioView } from "@/components/portfolio-view";

export const dynamic = "force-dynamic";

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate: 60 });
  } catch {
    return fallback;
  }
}

export default async function PortfoliosPage() {
  const [mepDoc, dolarSerie] = await Promise.all([
    safeFetch<{ mep: number } | null>("/api/cotizaciones/mep", null),
    safeFetch<{ fecha: string; valor: number }[]>("/api/cotizaciones/dolar", []),
  ]);

  const mep = mepDoc?.mep ?? 0;
  const a3500 = dolarSerie.length > 0 ? dolarSerie[dolarSerie.length - 1].valor : 0;

  return <PortfolioView mep={mep} a3500={a3500} />;
}
