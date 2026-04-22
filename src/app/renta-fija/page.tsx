import { apiFetch } from "@/lib/api";
import type {
  BreakevenDoc,
  BreakevenHistDoc,
  FlujoTicker,
  ForwardDoc,
  ForwardHistDoc,
  RentaFijaDoc,
} from "@/lib/types";
import { RentaFijaLiveView } from "@/components/renta-fija-live";

export const dynamic = "force-dynamic";

async function safeFetch<T>(
  path: string,
  fallback: T,
  revalidate = 30
): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate });
  } catch {
    return fallback;
  }
}

export default async function Home() {
  // SSR inicial — carga rápida con datos del último snapshot. El polling
  // client-side en RentaFijaLiveView mantiene los 3 datasets live (renta
  // fija, forwards, breakevens) sin depender de AutoRefresh global.
  const [
    rentaFija,
    forwards,
    flujos,
    breakevens,
    breakevensHist,
    forwardsHist,
  ] = await Promise.all([
    safeFetch<RentaFijaDoc[]>("/api/cotizaciones/renta-fija", [], 10),
    safeFetch<ForwardDoc[]>("/api/cotizaciones/forwards", [], 30),
    safeFetch<FlujoTicker[]>("/api/titulos/flujos", [], 600),
    safeFetch<BreakevenDoc[]>("/api/cotizaciones/breakevens", [], 30),
    safeFetch<BreakevenHistDoc[]>("/api/cotizaciones/historico/breakevens", [], 300),
    safeFetch<ForwardHistDoc[]>("/api/cotizaciones/historico/forwards", [], 300),
  ]);

  const allFlujos: FlujoTicker[] = flujos.map((f) => ({
    ticker: f.ticker,
    curva: f.curva,
    fecha_vencimiento: f.fecha_vencimiento,
  }));

  return (
    <RentaFijaLiveView
      initialRentaFija={rentaFija}
      initialForwards={forwards}
      initialBreakevens={breakevens}
      flujos={allFlujos}
      breakevensHist={breakevensHist}
      forwardsHist={forwardsHist}
    />
  );
}
