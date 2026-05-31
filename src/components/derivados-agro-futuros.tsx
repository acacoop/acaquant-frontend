"use client";

import { Panel, fmtVol } from "./ui";
import { usePoll } from "@/lib/use-poll";

const POLL_MS = 5_000;

type Commodity = "TRIGO" | "MAIZ" | "SOJA";
const COMMODITIES: Commodity[] = ["TRIGO", "MAIZ", "SOJA"];

// Shape mínimo que necesita esta vista. Las filas vienen de /api/derivados-agro
// (mismo endpoint que la pizarra) — open/closing los agrega el backend para
// calcular la variación intradía / vs. cierre.
interface FutRow {
  tipo: string;
  ticker?: string;
  vencimiento: string | null;
  us: number | null;
  bid?: number | null;
  offer?: number | null;
  open?: number | null;
  closing?: number | null;
  vol_efectivo?: number | null;
  dias_a_vto?: number;
}
interface Bloque {
  commodity: Commodity;
  rows: FutRow[];
}
export interface AgroFuturosData {
  bloques: Bloque[];
  data_fresh?: boolean;
}

function fmtPx(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtFechaCorta(s: string | null | undefined): string {
  if (!s) return "—";
  const t = s.replace(/-/g, "");
  if (t.length !== 8) return s;
  return `${t.slice(6, 8)}/${t.slice(4, 6)}/${t.slice(2, 4)}`;
}

function VarCell({ pct }: { pct: number | null }) {
  const color =
    pct === null
      ? "text-[var(--t-text-muted)]"
      : pct >= 0
        ? "text-[#00cc66]"
        : "text-[#ff3333]";
  return (
    <td className={`px-2 py-1 text-right ${color}`}>
      {pct !== null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
    </td>
  );
}

export function AgroFuturos({
  initial,
  commodity,
  setCommodity,
}: {
  initial: AgroFuturosData;
  commodity: Commodity;
  setCommodity: (c: Commodity) => void;
}) {
  const { data } = usePoll<AgroFuturosData>(
    "/api/derivados-agro",
    initial,
    POLL_MS,
  );

  const bloque = data.bloques.find((b) => b.commodity === commodity);
  const futuros = (bloque?.rows ?? []).filter((r) => r.tipo === "futuro");
  const stale = data.data_fresh === false;

  return (
    <div className="h-full min-h-0 p-3 flex flex-col">
      <div className="flex-1 min-h-0">
        <Panel
          title="FUTUROS"
          actions={
            <div className="flex gap-0.5">
              {COMMODITIES.map((c) => (
                <CommodityTab
                  key={c}
                  active={c === commodity}
                  onClick={() => setCommodity(c)}
                >
                  {c}
                </CommodityTab>
              ))}
            </div>
          }
        >
          {futuros.length === 0 ? (
            <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
              SIN FUTUROS — MERCADO CERRADO
            </p>
          ) : (
            <table className="w-full text-[11px] font-mono">
              <thead className="text-[10px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[#0a0a0a] sticky top-0 z-10">
                <tr>
                  <th className="text-left px-2 py-1.5 border-b border-[var(--t-border)]">
                    Ticker
                  </th>
                  <th className="text-center px-2 py-1.5 border-b border-[var(--t-border)]">
                    Vto
                  </th>
                  <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">
                    Last
                  </th>
                  <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">
                    Intra
                  </th>
                  <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">
                    1D
                  </th>
                  <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">
                    Bid
                  </th>
                  <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">
                    Offer
                  </th>
                  <th className="text-right px-2 py-1.5 border-b border-[var(--t-border)]">
                    Vol
                  </th>
                </tr>
              </thead>
              <tbody className={stale ? "opacity-50" : ""}>
                {futuros.map((r, i) => {
                  const last = r.us;
                  const intra =
                    last && r.open && r.open > 0
                      ? (last / r.open - 1) * 100
                      : null;
                  const d1 =
                    last && r.closing && r.closing > 0
                      ? (last / r.closing - 1) * 100
                      : null;
                  return (
                    <tr
                      key={r.ticker ?? i}
                      className="border-b border-[#101010] hover:bg-[#0d0d0d]"
                    >
                      <td className="px-2 py-1 text-[#ff9900]">
                        {r.ticker ?? "—"}
                      </td>
                      <td className="px-2 py-1 text-center text-[var(--t-text-dim)]">
                        {fmtFechaCorta(r.vencimiento)}
                      </td>
                      <td className="px-2 py-1 text-right text-[var(--t-text)] font-semibold">
                        {fmtPx(last)}
                      </td>
                      <VarCell pct={intra} />
                      <VarCell pct={d1} />
                      <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">
                        {fmtPx(r.bid)}
                      </td>
                      <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">
                        {fmtPx(r.offer)}
                      </td>
                      <td className="px-2 py-1 text-right text-[#ffaa00]">
                        {r.vol_efectivo ? fmtVol(r.vol_efectivo) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}

function CommodityTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
