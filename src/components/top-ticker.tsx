import { apiFetch } from "@/lib/api";
import { TickerTape } from "./ticker-tape";
import { shortTicker, fmtNum } from "./ui";

interface MepResponse {
  mep: number;
  timestamp: string;
}

interface DolarResponse {
  fecha: string;
  valor: number;
}

interface RentaFijaDoc {
  instrumento: string;
  metrics?: {
    last_price?: number;
    total_nominals?: number;
  };
}

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

export async function TopTicker() {
  const [mep, dolar, rentaFija] = await Promise.all([
    safeFetch<MepResponse | null>("/api/cotizaciones/mep", null),
    safeFetch<DolarResponse[]>("/api/cotizaciones/dolar", []),
    safeFetch<RentaFijaDoc[]>("/api/cotizaciones/renta-fija", []),
  ]);

  const lastDolar = dolar.length > 0 ? dolar[dolar.length - 1] : null;
  const items: { label: string; value: string; color: string }[] = [];

  if (mep) {
    items.push({
      label: "DOLAR MEP",
      value: `$${fmtNum(mep.mep)}`,
      color: "#00cc66",
    });
  }
  if (lastDolar) {
    items.push({
      label: "DOLAR OFICIAL",
      value: `$${fmtNum(lastDolar.valor)}`,
      color: "#d0d0d0",
    });
  }
  for (const r of rentaFija
    .filter((r) => r.metrics?.last_price)
    .sort(
      (a, b) =>
        (b.metrics?.total_nominals || 0) - (a.metrics?.total_nominals || 0)
    )) {
    items.push({
      label: shortTicker(r.instrumento),
      value: `$${fmtNum(r.metrics!.last_price!)}`,
      color: "#ff9900",
    });
  }

  return <TickerTape items={items} />;
}
