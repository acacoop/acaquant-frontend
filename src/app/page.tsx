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

interface BreakevenDoc {
  pares?: { lecap: string; breakeven_mensual: number }[];
}

interface ForwardDoc {
  curva: string;
  tasas?: Record<string, number>;
}

export default async function Home() {
  let health: HealthResponse | null = null;
  let mep: MepResponse | null = null;
  let dolar: DolarResponse[] = [];
  let breakevens: BreakevenDoc[] = [];
  let forwards: ForwardDoc[] = [];

  try {
    [health, mep, dolar, breakevens, forwards] = await Promise.all([
      apiFetch<HealthResponse>("/api/health"),
      apiFetch<MepResponse>("/api/cotizaciones/mep"),
      apiFetch<DolarResponse[]>("/api/cotizaciones/dolar"),
      apiFetch<BreakevenDoc[]>("/api/cotizaciones/breakevens"),
      apiFetch<ForwardDoc[]>("/api/cotizaciones/forwards"),
    ]);
  } catch {
    // API no disponible
  }

  const lastDolar = dolar.length > 0 ? dolar[dolar.length - 1] : null;

  // Build ticker items
  const tickerItems: { label: string; value: string; color: string }[] = [];

  if (mep) {
    tickerItems.push({
      label: "MEP",
      value: `$${mep.mep.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
      color: "#00cc66",
    });
  }

  if (lastDolar) {
    tickerItems.push({
      label: "A3500",
      value: `$${lastDolar.valor.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
      color: "#d0d0d0",
    });
  }

  if (mep && lastDolar) {
    const brecha = ((mep.mep / lastDolar.valor - 1) * 100).toFixed(1);
    tickerItems.push({
      label: "BRECHA",
      value: `${brecha}%`,
      color: "#ffaa00",
    });
  }

  // Breakevens
  if (breakevens.length > 0 && breakevens[0].pares) {
    for (const par of breakevens[0].pares.slice(0, 5)) {
      const beMensual = (par.breakeven_mensual * 100).toFixed(2);
      tickerItems.push({
        label: `BE ${par.lecap?.split(" - ")[2] || ""}`,
        value: `${beMensual}%`,
        color: parseFloat(beMensual) > 3 ? "#ff3333" : "#00cc66",
      });
    }
  }

  // Forwards (tasa fija, primeros 5 tickers)
  const fwTF = forwards.find((f) => f.curva === "tasa_fija");
  if (fwTF?.tasas) {
    const entries = Object.entries(fwTF.tasas).slice(0, 5);
    for (const [ticker, tea] of entries) {
      tickerItems.push({
        label: `TEA ${ticker}`,
        value: `${(tea * 100).toFixed(2)}%`,
        color: "#3399ff",
      });
    }
  }

  tickerItems.push({
    label: "API",
    value: health ? "ONLINE" : "OFFLINE",
    color: health ? "#00cc66" : "#ff3333",
  });

  return (
    <div className="flex flex-col h-full">
      {/* Ticker tape */}
      <TickerTape items={tickerItems} />

      {/* Panels */}
      <div className="flex-1 p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Panel title="RENTA FIJA">
            <p className="text-[#555555] text-xs">
              Conectar /api/cotizaciones/renta-fija
            </p>
          </Panel>
          <Panel title="OPCIONES GGAL">
            <p className="text-[#555555] text-xs">
              Conectar /api/cotizaciones/opciones
            </p>
          </Panel>
          <Panel title="FORWARDS">
            <p className="text-[#555555] text-xs">
              Conectar /api/cotizaciones/forwards
            </p>
          </Panel>
          <Panel title="BREAKEVENS">
            <p className="text-[#555555] text-xs">
              Conectar /api/cotizaciones/breakevens
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808]">
      <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#094293]/15">
        <span className="text-[11px] font-semibold text-[#094293] tracking-wide uppercase">
          {title}
        </span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
