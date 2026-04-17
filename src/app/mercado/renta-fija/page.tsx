import { apiFetch } from "@/lib/api";
import { Panel, Empty, shortTicker, fmtTs } from "@/components/ui";
import { BreakevenChart } from "@/components/breakeven-chart";
import { ForwardMatrix } from "@/components/forward-matrix";
import { RentaFijaTable } from "@/components/renta-fija-table";

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

interface ForwardDoc {
  curva: string;
  tasas?: Record<string, number>;
  tickers?: string[];
  matrix?: Record<string, Record<string, number>>;
  updated_at?: string;
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

interface FlujoTicker {
  ticker: string;
  curva: string;
}

export default async function RentaFijaPage() {
  let breakevens: BreakevenDoc[] = [];
  let forwards: ForwardDoc[] = [];
  let rentaFija: RentaFijaDoc[] = [];
  let flujosTF: FlujoTicker[] = [];
  let flujosCER: FlujoTicker[] = [];

  try {
    [breakevens, forwards, rentaFija, flujosTF, flujosCER] =
      await Promise.all([
        apiFetch<BreakevenDoc[]>("/api/cotizaciones/breakevens"),
        apiFetch<ForwardDoc[]>("/api/cotizaciones/forwards"),
        apiFetch<RentaFijaDoc[]>("/api/cotizaciones/renta-fija"),
        apiFetch<FlujoTicker[]>("/api/titulos/flujos?curva=tasa_fija"),
        apiFetch<FlujoTicker[]>("/api/titulos/flujos?curva=cer"),
      ]);
  } catch {
    // API no disponible
  }

  const fwTF = forwards.find((f) => f.curva === "tasa_fija");
  const fwCER = forwards.find((f) => f.curva === "cer");
  const pares = breakevens[0]?.pares || [];

  // Merge flujos for curva mapping
  const allFlujos: FlujoTicker[] = [
    ...flujosTF.map((f) => ({ ticker: f.ticker, curva: "tasa_fija" })),
    ...flujosCER.map((f) => ({ ticker: f.ticker, curva: "cer" })),
  ];

  return (
    <div className="flex-1 p-3 space-y-3">
      {/* Row 1: Renta Fija prices */}
      <Panel title="RENTA FIJA" count={rentaFija.length}>
        <RentaFijaTable data={rentaFija} flujos={allFlujos} />
      </Panel>

      {/* Row 2: Forwards matrices */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Panel
          title="FORWARDS — TASA FIJA"
          sub={fwTF?.updated_at ? fmtTs(fwTF.updated_at) : ""}
        >
          {fwTF?.matrix && fwTF?.tickers ? (
            <ForwardMatrix tickers={fwTF.tickers} matrix={fwTF.matrix} />
          ) : (
            <Empty />
          )}
        </Panel>

        <Panel
          title="FORWARDS — CER"
          sub={fwCER?.updated_at ? fmtTs(fwCER.updated_at) : ""}
        >
          {fwCER?.matrix && fwCER?.tickers ? (
            <ForwardMatrix tickers={fwCER.tickers} matrix={fwCER.matrix} />
          ) : (
            <Empty />
          )}
        </Panel>
      </div>

      {/* Row 3: Breakevens table + chart */}
      <Panel
        title="BREAKEVENS"
        sub={
          breakevens[0]?.updated_at
            ? fmtTs(breakevens[0].updated_at)
            : ""
        }
      >
        {pares.length > 0 ? (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th>LECAP</th>
                    <th>CER</th>
                    <th className="text-right">DIAS</th>
                    <th className="text-right">BE MENSUAL</th>
                  </tr>
                </thead>
                <tbody>
                  {pares.map((p) => {
                    const be = p.breakeven_mensual * 100;
                    return (
                      <tr key={p.n}>
                        <td className="text-[#3399ff]">
                          {shortTicker(p.lecap)}
                        </td>
                        <td className="text-[#808080]">
                          {shortTicker(p.cer)}
                        </td>
                        <td className="text-right">{p.dias}</td>
                        <td
                          className={`text-right font-bold ${
                            be > 3 ? "text-[#ff3333]" : "text-[#00cc66]"
                          }`}
                        >
                          {be.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Chart */}
            <div className="border-t border-[#1a1a1a] pt-3">
              <BreakevenChart pares={pares} />
            </div>
          </div>
        ) : (
          <Empty />
        )}
      </Panel>
    </div>
  );
}
