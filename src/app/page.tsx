import { apiFetch } from "@/lib/api";
import { TickerTape } from "@/components/ticker-tape";
import { Panel, Empty, shortTicker, fmtNum, fmtPrice, fmtVol } from "@/components/ui";

interface HealthResponse {
  status: string;
}

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

interface OpcionDoc {
  instrumento: string;
  tipo: string;
  strike: number;
  last: number;
  bid: number;
  offer: number;
  iv: number;
  delta: number;
  ev: number;
  spot: number;
}

export default async function Home() {
  let health: HealthResponse | null = null;
  let mep: MepResponse | null = null;
  let dolar: DolarResponse[] = [];
  let rentaFija: RentaFijaDoc[] = [];
  let opciones: OpcionDoc[] = [];

  try {
    [health, mep, dolar, rentaFija, opciones] = await Promise.all([
      apiFetch<HealthResponse>("/api/health"),
      apiFetch<MepResponse>("/api/cotizaciones/mep"),
      apiFetch<DolarResponse[]>("/api/cotizaciones/dolar"),
      apiFetch<RentaFijaDoc[]>("/api/cotizaciones/renta-fija"),
      apiFetch<OpcionDoc[]>("/api/cotizaciones/opciones"),
    ]);
  } catch {
    // API no disponible
  }

  const lastDolar = dolar.length > 0 ? dolar[dolar.length - 1] : null;

  // ── Ticker tape items ──
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
      color: "#3399ff",
    });
  }

  return (
    <div className="flex flex-col h-full">
      <TickerTape items={tickerItems} />

      <div className="flex-1 p-3 space-y-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* RENTA FIJA */}
          <Panel title="RENTA FIJA" count={rentaFija.length}>
            {rentaFija.length > 0 ? (
              <div className="max-h-72 overflow-y-auto">
                <table>
                  <thead>
                    <tr>
                      <th>INSTRUMENTO</th>
                      <th className="text-right">LAST</th>
                      <th className="text-right">INTRADAY</th>
                      <th className="text-right">1D</th>
                      <th className="text-right">VWAP</th>
                      <th className="text-right">VOL NOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rentaFija
                      .filter((r) => r.metrics?.last_price)
                      .sort(
                        (a, b) =>
                          (b.metrics?.total_nominals || 0) -
                          (a.metrics?.total_nominals || 0)
                      )
                      .map((r) => {
                        const last = r.metrics?.last_price;
                        const open = r.metrics?.open_price;
                        const close = r.metrics?.closing_price;
                        const intraday =
                          last && open && open > 0
                            ? (last / open - 1) * 100
                            : null;
                        const vs1d =
                          last && close && close > 0
                            ? (last / close - 1) * 100
                            : null;

                        return (
                          <tr key={r.instrumento}>
                            <td className="text-[#3399ff]">
                              {shortTicker(r.instrumento)}
                            </td>
                            <td className="text-right font-semibold">
                              {fmtPrice(last)}
                            </td>
                            <td
                              className={`text-right ${
                                intraday === null
                                  ? "text-[#555555]"
                                  : intraday >= 0
                                  ? "text-[#00cc66]"
                                  : "text-[#ff3333]"
                              }`}
                            >
                              {intraday !== null
                                ? `${intraday >= 0 ? "+" : ""}${intraday.toFixed(2)}%`
                                : "--"}
                            </td>
                            <td
                              className={`text-right ${
                                vs1d === null
                                  ? "text-[#555555]"
                                  : vs1d >= 0
                                  ? "text-[#00cc66]"
                                  : "text-[#ff3333]"
                              }`}
                            >
                              {vs1d !== null
                                ? `${vs1d >= 0 ? "+" : ""}${vs1d.toFixed(2)}%`
                                : "--"}
                            </td>
                            <td className="text-right text-[#808080]">
                              {fmtPrice(r.metrics?.vwap)}
                            </td>
                            <td className="text-right text-[#ffaa00]">
                              {fmtVol(r.metrics?.total_nominals)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
          </Panel>

          {/* OPCIONES GGAL */}
          <Panel
            title="OPCIONES GGAL"
            count={opciones.length}
            sub={opciones[0]?.spot ? `SPOT ${fmtNum(opciones[0].spot)}` : ""}
          >
            {opciones.length > 0 ? (
              <div className="max-h-72 overflow-y-auto">
                <table>
                  <thead>
                    <tr>
                      <th>STRIKE</th>
                      <th>TIPO</th>
                      <th className="text-right">BID</th>
                      <th className="text-right">ASK</th>
                      <th className="text-right">LAST</th>
                      <th className="text-right">IV</th>
                      <th className="text-right">DELTA</th>
                      <th className="text-right">EV</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opciones
                      .sort(
                        (a, b) =>
                          a.strike - b.strike || (a.tipo > b.tipo ? 1 : -1)
                      )
                      .map((o) => (
                        <tr key={o.instrumento}>
                          <td className="font-semibold">{fmtNum(o.strike)}</td>
                          <td
                            className={
                              o.tipo === "CALL"
                                ? "text-[#00cc66]"
                                : "text-[#ff3333]"
                            }
                          >
                            {o.tipo}
                          </td>
                          <td className="text-right">{fmtPrice(o.bid)}</td>
                          <td className="text-right">{fmtPrice(o.offer)}</td>
                          <td className="text-right font-semibold">
                            {fmtPrice(o.last)}
                          </td>
                          <td className="text-right text-[#ffaa00]">
                            {o.iv ? (o.iv * 100).toFixed(1) + "%" : "--"}
                          </td>
                          <td className="text-right text-[#808080]">
                            {o.delta?.toFixed(3) || "--"}
                          </td>
                          <td className="text-right text-[#555555]">
                            {o.ev ? fmtVol(o.ev) : "--"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
          </Panel>
        </div>

        {/* API Status */}
        <div className="text-center text-[10px] text-[#555555]">
          API{" "}
          <span className={health ? "text-[#00cc66]" : "text-[#ff3333]"}>
            {health ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>
    </div>
  );
}
