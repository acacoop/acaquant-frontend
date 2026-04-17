import { apiFetch } from "@/lib/api";
import { TickerTape } from "@/components/ticker-tape";

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
  let breakevens: BreakevenDoc[] = [];
  let forwards: ForwardDoc[] = [];
  let rentaFija: RentaFijaDoc[] = [];
  let opciones: OpcionDoc[] = [];

  try {
    [health, mep, dolar, breakevens, forwards, rentaFija, opciones] =
      await Promise.all([
        apiFetch<HealthResponse>("/api/health"),
        apiFetch<MepResponse>("/api/cotizaciones/mep"),
        apiFetch<DolarResponse[]>("/api/cotizaciones/dolar"),
        apiFetch<BreakevenDoc[]>("/api/cotizaciones/breakevens"),
        apiFetch<ForwardDoc[]>("/api/cotizaciones/forwards"),
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
  // Renta fija instruments with last price
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

  // ── Forward curves ──
  const fwTF = forwards.find((f) => f.curva === "tasa_fija");
  const fwCER = forwards.find((f) => f.curva === "cer");

  return (
    <div className="flex flex-col h-full">
      <TickerTape items={tickerItems} />

      <div className="flex-1 p-3 space-y-3">
        {/* Row 1: Renta Fija + Opciones */}
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
                      <th className="text-right">VWAP</th>
                      <th className="text-right">HIGH</th>
                      <th className="text-right">LOW</th>
                      <th className="text-right">CIERRE</th>
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
                      .map((r) => (
                        <tr key={r.instrumento}>
                          <td className="text-[#3399ff]">
                            {shortTicker(r.instrumento)}
                          </td>
                          <td className="text-right font-semibold">
                            {fmtPrice(r.metrics?.last_price)}
                          </td>
                          <td className="text-right text-[#808080]">
                            {fmtPrice(r.metrics?.vwap)}
                          </td>
                          <td className="text-right text-[#00cc66]">
                            {fmtPrice(r.metrics?.high_price)}
                          </td>
                          <td className="text-right text-[#ff3333]">
                            {fmtPrice(r.metrics?.low_price)}
                          </td>
                          <td className="text-right text-[#808080]">
                            {fmtPrice(r.metrics?.closing_price)}
                          </td>
                          <td className="text-right text-[#ffaa00]">
                            {fmtVol(r.metrics?.total_nominals)}
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
                      .sort((a, b) => a.strike - b.strike || (a.tipo > b.tipo ? 1 : -1))
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

        {/* Row 2: Forwards + Breakevens */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* FORWARDS */}
          <Panel title="FORWARDS — TASAS SPOT" sub={fwTF?.updated_at ? fmtTs(fwTF.updated_at) : ""}>
            <div className="grid grid-cols-2 gap-3">
              {/* Tasa Fija */}
              <div>
                <div className="text-[10px] text-[#094293] font-semibold mb-2 tracking-wide">
                  TASA FIJA
                </div>
                {fwTF?.tasas ? (
                  <table>
                    <thead>
                      <tr>
                        <th>TICKER</th>
                        <th className="text-right">TEA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(fwTF.tasas).map(([t, tea]) => (
                        <tr key={t}>
                          <td className="text-[#3399ff]">{t}</td>
                          <td className="text-right font-semibold">
                            {(tea * 100).toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty />
                )}
              </div>
              {/* CER */}
              <div>
                <div className="text-[10px] text-[#094293] font-semibold mb-2 tracking-wide">
                  CER
                </div>
                {fwCER?.tasas ? (
                  <table>
                    <thead>
                      <tr>
                        <th>TICKER</th>
                        <th className="text-right">TEA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(fwCER.tasas).map(([t, tea]) => (
                        <tr key={t}>
                          <td className="text-[#3399ff]">{t}</td>
                          <td className="text-right font-semibold">
                            {(tea * 100).toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <Empty />
                )}
              </div>
            </div>
          </Panel>

          {/* BREAKEVENS */}
          <Panel
            title="BREAKEVENS"
            sub={
              breakevens[0]?.updated_at
                ? fmtTs(breakevens[0].updated_at)
                : ""
            }
          >
            {breakevens.length > 0 && breakevens[0].pares ? (
              <div className="max-h-72 overflow-y-auto">
                <table>
                  <thead>
                    <tr>
                      <th>LECAP</th>
                      <th>CER</th>
                      <th className="text-right">DIAS</th>
                      <th className="text-right">TEM LECAP</th>
                      <th className="text-right">PARIDAD</th>
                      <th className="text-right">BE MENSUAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakevens[0].pares.map((p) => {
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
                          <td className="text-right">
                            {(p.tem_lecap * 100).toFixed(2)}%
                          </td>
                          <td className="text-right text-[#808080]">
                            {p.paridad_cer.toFixed(2)}
                          </td>
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
            ) : (
              <Empty />
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── UI Components ──

function Panel({
  title,
  children,
  count,
  sub,
}: {
  title: string;
  children: React.ReactNode;
  count?: number;
  sub?: string;
}) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808]">
      <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#094293]/15">
        <span className="text-[11px] font-semibold text-[#094293] tracking-wide uppercase">
          {title}
        </span>
        {count !== undefined && (
          <span className="ml-2 text-[10px] text-[#555555]">({count})</span>
        )}
        {sub && (
          <span className="ml-auto text-[10px] text-[#555555]">{sub}</span>
        )}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

function Empty() {
  return (
    <p className="text-[#555555] text-xs py-4 text-center">
      SIN DATOS — MERCADO CERRADO
    </p>
  );
}

// ── Formatters ──

function shortTicker(full: string): string {
  const parts = full.split(" - ");
  return parts.length >= 3 ? parts[2] : full;
}

function fmtNum(n: number): string {
  return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPrice(n?: number): string {
  if (n === undefined || n === null) return "--";
  return fmtNum(n);
}

function fmtVol(n?: number): string {
  if (n === undefined || n === null) return "--";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "K";
  return n.toLocaleString("es-AR");
}

function fmtTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}
