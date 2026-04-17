import { apiFetch } from "@/lib/api";

interface HealthResponse {
  status: string;
}

interface MepResponse {
  mep: number;
  timestamp: string;
}

export default async function Home() {
  let health: HealthResponse | null = null;
  let mep: MepResponse | null = null;

  try {
    health = await apiFetch<HealthResponse>("/api/health");
    mep = await apiFetch<MepResponse>("/api/cotizaciones/mep");
  } catch {
    // API no disponible
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold tracking-tight mb-8">
        Dashboard
      </h1>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {/* API Status */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400 mb-1">API Status</p>
          <p className="text-2xl font-semibold">
            {health ? (
              <span className="text-green-400">{health.status}</span>
            ) : (
              <span className="text-red-400">offline</span>
            )}
          </p>
        </div>

        {/* Dolar MEP */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm text-zinc-400 mb-1">Dolar MEP</p>
          {mep ? (
            <>
              <p className="text-2xl font-semibold">
                ${mep.mep.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                {new Date(mep.timestamp).toLocaleString("es-AR")}
              </p>
            </>
          ) : (
            <p className="text-2xl font-semibold text-zinc-600">--</p>
          )}
        </div>
      </div>
    </div>
  );
}
