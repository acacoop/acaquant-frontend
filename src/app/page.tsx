import { apiFetch } from "@/lib/api";
import { Panel, fmtTs } from "@/components/ui";
import { RentaFijaTable } from "@/components/renta-fija-table";
import { ForwardsPanel } from "@/components/forwards-panel";
import { CurvasChart } from "@/components/curvas-chart";
import { BreakevensBlock } from "@/components/breakevens-block";

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

interface BreakevenHistDoc {
  fecha: string;
  pares: BreakevenPar[];
}

interface ForwardHistDoc {
  curva: string;
  fecha: string;
  matrix: Record<string, Record<string, number>>;
}

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

  const pares = breakevens[0]?.pares || [];
  const breakevensTs = breakevens[0]?.updated_at;

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Panel title="RENTA FIJA" count={rentaFija.length}>
            <RentaFijaTable
              data={rentaFija}
              flujos={allFlujos}
              forwards={forwards}
            />
          </Panel>

          <Panel title="CURVAS" fill>
            <CurvasChart forwards={forwards} flujos={allFlujos} />
          </Panel>
        </div>

        <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Panel title="FORWARDS">
            <ForwardsPanel forwards={forwards} historico={forwardsHist} />
          </Panel>

          <Panel
            title="BREAKEVENS"
            sub={breakevensTs ? fmtTs(breakevensTs) : ""}
            fill
          >
            <BreakevensBlock pares={pares} historico={breakevensHist} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
