import { apiFetch } from "@/lib/api";
import { TickerTape } from "@/components/ticker-tape";
import { Panel, shortTicker, fmtNum, fmtTs } from "@/components/ui";
import { RentaFijaTable } from "@/components/renta-fija-table";
import { ForwardsPanel } from "@/components/forwards-panel";
import { CurvasChart } from "@/components/curvas-chart";
import { BreakevensBlock } from "@/components/breakevens-block";
import { AutoRefresh } from "@/components/auto-refresh";

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
  tasas?: Record<string, number>;
  matrix?: Record<string, Record<string, number>>;
  updated_at?: string;
}

interface FlujoTicker {
  ticker: string;
  curva: string;
  fecha_vencimiento?: string;
}

interface BreakevenPar {
  n: number;
  lecap: string;
  cer: string;
  fecha_vencimiento: string;
  dias: number;
  tem_lecap: number;
  paridad_cer: number;
  breakeven_mensual: number;
}

interface BreakevenDoc {
  pares?: BreakevenPar[];
  updated_at?: string;
}

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return fallback;
  }
}

export default async function Home() {
  const [mep, dolar, rentaFija, forwards, flujosTF, flujosCER, breakevens] =
    await Promise.all([
      safeFetch<MepResponse | null>("/api/cotizaciones/mep", null),
      safeFetch<DolarResponse[]>("/api/cotizaciones/dolar", []),
      safeFetch<RentaFijaDoc[]>("/api/cotizaciones/renta-fija", []),
      safeFetch<ForwardDoc[]>("/api/cotizaciones/forwards", []),
      safeFetch<FlujoTicker[]>("/api/titulos/flujos?curva=tasa_fija", []),
      safeFetch<FlujoTicker[]>("/api/titulos/flujos?curva=cer", []),
      safeFetch<BreakevenDoc[]>("/api/cotizaciones/breakevens", []),
    ]);

  const lastDolar = dolar.length > 0 ? dolar[dolar.length - 1] : null;

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
    ...flujosTF.map((f) => ({
      ticker: f.ticker,
      curva: "tasa_fija",
      fecha_vencimiento: f.fecha_vencimiento,
    })),
    ...flujosCER.map((f) => ({
      ticker: f.ticker,
      curva: "cer",
      fecha_vencimiento: f.fecha_vencimiento,
    })),
  ];

  const pares = breakevens[0]?.pares || [];
  const breakevensTs = breakevens[0]?.updated_at;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AutoRefresh intervalMs={5000} />
      <TickerTape items={tickerItems} />

      <div className="flex-1 min-h-0 p-3">
        <div className="grid h-full gap-3 grid-cols-1 grid-rows-4 lg:grid-cols-2 lg:grid-rows-2">
          <div className="min-w-0 min-h-0">
            <Panel title="RENTA FIJA" count={rentaFija.length}>
              <RentaFijaTable data={rentaFija} flujos={allFlujos} />
            </Panel>
          </div>

          <div className="min-w-0 min-h-0">
            <Panel title="FORWARDS">
              <ForwardsPanel forwards={forwards} />
            </Panel>
          </div>

          <div className="min-w-0 min-h-0">
            <Panel title="CURVAS">
              <CurvasChart forwards={forwards} flujos={allFlujos} />
            </Panel>
          </div>

          <div className="min-w-0 min-h-0">
            <Panel
              title="BREAKEVENS"
              sub={breakevensTs ? fmtTs(breakevensTs) : ""}
            >
              <BreakevensBlock pares={pares} />
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
