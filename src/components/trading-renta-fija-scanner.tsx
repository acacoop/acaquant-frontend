"use client";

import { usePoll } from "@/lib/use-poll";

/**
 * Tab RENTA FIJA del RADAR de TRADING: bonos en PESOS suscriptos (tasa fija +
 * CER) con su last, TNA y volumen del día, ordenados por volumen desc. Sin % (no
 * es un radar de variación — es el listado de lo que operamos). Click en una
 * fila → onSelect (carga el bono en la card/chart/libro/tape, igual que los
 * movers de acciones). Feed: /api/trading/renta-fija (poll 4s).
 */
type BonoRadar = {
  ticker_corto: string;
  last: number | null;
  tna: number | null;
  volumen: number | null;
};

const POLL_MS = 4_000;

function fmtLast(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function fmtTna(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

// Volumen nominal: abreviado (K/M) para que entre en la columna.
function fmtVol(n: number | null): string {
  if (n == null || n === 0) return "—";
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return Math.round(n).toLocaleString("es-AR");
}

export function TradingRentaFijaScanner({
  onSelect,
  selectedTicker,
}: {
  onSelect?: (ticker: string) => void;
  selectedTicker?: string | null;
}) {
  const { data: rows } = usePoll<BonoRadar[]>(
    "/api/trading/renta-fija",
    [],
    POLL_MS,
    { fetchOnMount: true },
  );

  const bonos = rows ?? [];
  const maxVol = bonos.reduce((m, r) => Math.max(m, r.volumen ?? 0), 0);

  if (bonos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-muted)] text-center px-3">
        sin bonos en pesos suscriptos con dato todavía
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-1.5 py-1 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[9px] text-[var(--t-text-muted)]">bonos en pesos (tasa fija + CER) — click para cargar</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <table className="w-full text-[10px] tabular-nums">
          <thead className="sticky top-0 bg-[var(--t-panel)] text-[7px] uppercase tracking-wide text-[var(--t-text-muted)]">
            <tr>
              <th className="!px-1.5 py-1 text-left">Bono</th>
              <th className="!px-1 py-1 text-right">Last</th>
              <th className="!px-1 py-1 text-right">TNA</th>
              <th className="!px-1.5 py-1 text-right">Vol</th>
            </tr>
          </thead>
          <tbody>
            {bonos.map((r) => {
              const sel = selectedTicker != null && r.ticker_corto === selectedTicker;
              const w = maxVol > 0 ? ((r.volumen ?? 0) / maxVol) * 100 : 0;
              return (
                <tr
                  key={r.ticker_corto}
                  onMouseDown={() => onSelect?.(r.ticker_corto)}
                  className={
                    "border-b border-[var(--t-border)] cursor-pointer hover:bg-[var(--t-border)] " +
                    (sel ? "bg-[var(--t-border)]" : "")
                  }
                >
                  <td className="!px-1.5 py-[2px] text-left font-mono font-semibold text-[var(--t-text)]">
                    {r.ticker_corto}
                  </td>
                  <td className="!px-1 py-[2px] text-right font-mono text-[var(--t-text)]">{fmtLast(r.last)}</td>
                  <td className="!px-1 py-[2px] text-right text-[var(--t-text-dim)]">{fmtTna(r.tna)}</td>
                  {/* barra proporcional al más operado + volumen nominal */}
                  <td className="!px-1.5 py-[2px] text-right relative">
                    <div
                      className="absolute inset-y-[2px] right-1 bg-[var(--t-accent)]/15 pointer-events-none"
                      style={{ width: `${w}%` }}
                    />
                    <span className="relative font-mono text-[var(--t-text)]">{fmtVol(r.volumen)}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
