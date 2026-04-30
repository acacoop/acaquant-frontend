import { apiFetch } from "@/lib/api";
import {
  TopTickerClient,
  type MepResponse,
  type RentaFijaDoc,
  type CaucionDoc,
} from "./top-ticker-client";

async function safeFetch<T>(
  path: string,
  fallback: T,
  revalidate = 0
): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate });
  } catch {
    return fallback;
  }
}

// SSR provee initialData para que la barra aparezca llena en el primer
// render. El TopTickerClient se encarga del polling cada 30s sin
// rerenderizar la página.
export async function TopTicker() {
  const [mep, rentaFija, caucion] = await Promise.all([
    safeFetch<MepResponse | null>("/api/cotizaciones/mep", null, 30),
    safeFetch<RentaFijaDoc[]>("/api/cotizaciones/renta-fija", [], 10),
    safeFetch<CaucionDoc[]>("/api/cotizaciones/caucion", [], 15),
  ]);

  return (
    <TopTickerClient
      initialMep={mep}
      initialRentaFija={rentaFija}
      initialCaucion={caucion}
    />
  );
}
