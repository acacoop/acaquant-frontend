import { apiFetch } from "@/lib/api";
import { TickerTape } from "@/components/ticker-tape";
import { Panel, shortTicker, fmtNum } from "@/components/ui";
import { RentaFijaTable } from "@/components/renta-fija-table";
import { ForwardsPanel } from "@/components/forwards-panel";

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
    vwap?: number;
    total_nominals?: number;
    high_price?: number;
    low_price?: number;
    closing_price?: number;
    open_price?: number;
  };
}

interface ForwardDoc {
  curva: string;
  tickers?: string[];
  matrix?: Record<string, Record<string, number>>;
  updated_at?: string;
}

interface FlujoTicker {
  ticker: string;
  curva: string;
}

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

export default async function Home() {
  const [mep, dolar, rentaFija, forwards, flujosTF, flujosCER] =
    await Promise.all([
      safeFetch<MepResponse | null>("/api/cotizaciones/mep", null),
      safeFetch<DolarResponse[]>("/api/cotizaciones/dolar", []),
      safeFetch<RentaFijaDoc[]>("/api/cotizaciones/renta-fija", []),
      safeFetch<ForwardDoc[]>("/api/cotizaciones/forwards", []),
      safeFetch<FlujoTicker[]>("/api/titulos/flujos?curva=tasa_fija", []),
      safeFetch<FlujoTicker[]>("/api/titulos/flujos?curva=cer", []),
    ]);

  const lastDolar = dolar.length > 0 ? dolar[dolar.length - 1] : null;

  // Ticker tape items
  const tickerItems: { label: string; value: string; color: string }[] = [];

  if (mep) {
    tickerItems.push({
      label: "DOLAR MEP",
      value: `$${fmtNum(mep.mep)}`,
      color: "#00cc66",
    });
  }
  if (lastDolar) {
    tickerItems.push({
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
    tickerItems.push({
      label: shortTicker(r.instrumento),
      value: `$${fmtNum(r.metrics!.last_price!)}`,
      color: "#ff9900",
    });
  }

  const allFlujos: FlujoTicker[] = [
    ...flujosTF.map((f) => ({ ticker: f.ticker, curva: "tasa_fija" })),
    ...flujosCER.map((f) => ({ ticker: f.ticker, curva: "cer" })),
  ];

  return (
    <div className="flex flex-col h-full">
      <TickerTape items={tickerItems} />

      <div className="flex-1 p-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* LEFT: Renta Fija con filtro de curva */}
          <div className="min-w-0">
            <Panel title="RENTA FIJA" count={rentaFija.length}>
              <RentaFijaTable data={rentaFija} flujos={allFlujos} />
            </Panel>
          </div>

          {/* RIGHT: Forwards con selector de curva, scrollable */}
          <div className="min-w-0">
            <Panel title="FORWARDS">
              <ForwardsPanel forwards={forwards} />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
