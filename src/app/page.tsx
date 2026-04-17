import { apiFetch } from "@/lib/api";

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

export default async function Home() {
  let health: HealthResponse | null = null;
  let mep: MepResponse | null = null;
  let dolar: DolarResponse[] = [];

  try {
    [health, mep, dolar] = await Promise.all([
      apiFetch<HealthResponse>("/api/health"),
      apiFetch<MepResponse>("/api/cotizaciones/mep"),
      apiFetch<DolarResponse[]>("/api/cotizaciones/dolar"),
    ]);
  } catch {
    // API no disponible
  }

  const lastDolar = dolar.length > 0 ? dolar[dolar.length - 1] : null;
  const now = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

  return (
    <div className="p-3">
      {/* Header bar */}
      <div className="flex items-center gap-4 mb-4 pb-2 border-b border-[#2a2a2a]">
        <span className="text-[#ffaa00] text-xs font-semibold">OVERVIEW</span>
        <span className="text-[10px] text-[#555555]">{now} ART</span>
        <span className="ml-auto text-[10px]">
          API{" "}
          {health ? (
            <span className="text-[#00cc66]">CONNECTED</span>
          ) : (
            <span className="text-[#ff3333]">OFFLINE</span>
          )}
        </span>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label="DOLAR MEP"
          value={mep ? `$${mep.mep.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "--"}
          sub={mep ? formatTimestamp(mep.timestamp) : ""}
        />
        <KpiCard
          label="DOLAR OFICIAL (A3500)"
          value={lastDolar ? `$${lastDolar.valor.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "--"}
          sub={lastDolar?.fecha || ""}
        />
        <KpiCard
          label="BRECHA"
          value={mep && lastDolar ? `${(((mep.mep / lastDolar.valor) - 1) * 100).toFixed(1)}%` : "--"}
          sub="MEP / OFICIAL"
          highlight
        />
        <KpiCard
          label="STATUS"
          value={health ? "ONLINE" : "OFFLINE"}
          sub="api.acaquant.com"
          positive={!!health}
        />
      </div>

      {/* Placeholder panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Panel title="RENTA FIJA">
          <p className="text-[#555555] text-xs">Conectar /api/cotizaciones/renta-fija</p>
        </Panel>
        <Panel title="OPCIONES GGAL">
          <p className="text-[#555555] text-xs">Conectar /api/cotizaciones/opciones</p>
        </Panel>
        <Panel title="FORWARDS">
          <p className="text-[#555555] text-xs">Conectar /api/cotizaciones/forwards</p>
        </Panel>
        <Panel title="BREAKEVENS">
          <p className="text-[#555555] text-xs">Conectar /api/cotizaciones/breakevens</p>
        </Panel>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  highlight,
  positive,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="border border-[#2a2a2a] bg-[#0a0a0a] p-3">
      <div className="text-[10px] text-[#808080] font-semibold tracking-wide mb-1">
        {label}
      </div>
      <div
        className={`text-lg font-bold ${
          highlight
            ? "text-[#ffaa00]"
            : positive !== undefined
            ? positive
              ? "text-[#00cc66]"
              : "text-[#ff3333]"
            : "text-[#e0e0e0]"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#555555] mt-1">{sub}</div>}
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
    <div className="border border-[#2a2a2a] bg-[#0a0a0a]">
      <div className="px-3 py-1.5 border-b border-[#2a2a2a] bg-[#1a1a2e]">
        <span className="text-[11px] font-semibold text-[#ffaa00] tracking-wide">
          {title}
        </span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}
