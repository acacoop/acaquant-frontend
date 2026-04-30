import { apiFetch } from "@/lib/api";
import { TickerTape } from "./ticker-tape";
import { shortTicker, fmtNum } from "./ui";

interface MepResponse {
  mep: number;
  ccl?: number | null;
  canje?: number | null;
  oficial?: number | null;   // MAE UST$T mayorista (DolarOficialLive)
  timestamp: string;
}

interface RentaFijaDoc {
  instrumento: string;
  metrics?: {
    last_price?: number;
    total_nominals?: number;
  };
}

interface CaucionDoc {
  moneda: "ARS" | "USD";
  plazo_dias: number;
  tna_last: number | null;
  tna_closing: number | null;
}

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

function fmtTna(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(2)}%`;
}

export async function TopTicker() {
  const [mep, rentaFija, caucion] = await Promise.all([
    safeFetch<MepResponse | null>("/api/cotizaciones/mep", null, 30),
    safeFetch<RentaFijaDoc[]>("/api/cotizaciones/renta-fija", [], 10),
    safeFetch<CaucionDoc[]>("/api/cotizaciones/caucion", [], 15),
  ]);

  const items: { label: string; value: string; color: string }[] = [];

  if (mep) {
    items.push({
      label: "DOLAR MEP",
      value: `$${fmtNum(mep.mep)}`,
      color: "#00cc66",
    });
    if (mep.ccl) {
      items.push({
        label: "DOLAR CCL",
        value: `$${fmtNum(mep.ccl)}`,
        color: "#00cc66",
      });
    }
    if (mep.canje !== null && mep.canje !== undefined) {
      items.push({
        label: "CANJE",
        value: `${mep.canje.toFixed(2)}%`,
        color: mep.canje >= 0 ? "#00cc66" : "#ff3333",
      });
    }
    if (mep.oficial !== null && mep.oficial !== undefined) {
      items.push({
        label: "DOLAR OFICIAL",
        value: `$${fmtNum(mep.oficial)}`,
        color: "#d0d0d0",
      });
    }
  }

  // Caución: TNA del plazo más corto (típicamente 1D, viernes 3D).
  const cauARS = caucion.find((c) => c.moneda === "ARS");
  const cauUSD = caucion.find((c) => c.moneda === "USD");
  if (cauARS) {
    const tna = cauARS.tna_last ?? cauARS.tna_closing;
    items.push({
      label: `CAUCION ARS ${cauARS.plazo_dias}D`,
      value: fmtTna(tna),
      color: "#ffcc00",
    });
  }
  if (cauUSD) {
    const tna = cauUSD.tna_last ?? cauUSD.tna_closing;
    items.push({
      label: `CAUCION USD ${cauUSD.plazo_dias}D`,
      value: fmtTna(tna),
      color: "#ffcc00",
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
