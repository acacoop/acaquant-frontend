"use client";

import { Panel } from "./ui";
import { usePoll } from "@/lib/use-poll";

const POLL_MS = 5_000;

interface MejorasRow {
  ticker: string | null;
  ticker_largo: string | null;
  vencimiento: string;
  dias: number;
  tna: number | null;
  tasa_diaria: number | null;
  tasa_directa: number | null;
  interes_ganado: number | null;
  valor_final: number | null;
  futuro_ticker: string | null;
  futuro_px: number | null;
  descalce: number | null;
  valor_usd: number | null;
}

type Commodity = "SOJA" | "MAIZ" | "TRIGO";

interface Bloque {
  commodity: Commodity;
  precio_ars: number | null;
  precio_updated_at: string | null;
  precio_updated_by: string | null;
  filas: MejorasRow[];
}

interface MejorasResp {
  ts: string;
  spot: number | null;
  bloques: Bloque[];
}

const EMPTY: MejorasResp = { ts: "", spot: null, bloques: [] };

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtArs(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  })}`;
}

function fmtUsd(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "N/A";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtPct(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(dec)}%`;
}

function fmtPctMini(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(3)}%`;
}

function fmtFechaCorta(s: string | null | undefined): string {
  if (!s) return "—";
  const t = s.slice(0, 10);
  if (t.length !== 10) return s;
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(2, 4)}`;
}

// ─── Componente principal ────────────────────────────────────────────────────

const COMMODITIES: { id: Commodity; short: string }[] = [
  { id: "SOJA",  short: "Soj Ros" },
  { id: "MAIZ",  short: "Mai Ros" },
  { id: "TRIGO", short: "Tri Ros" },
];

export function AgroMejorasDispo() {
  const { data } = usePoll<MejorasResp>(
    "/api/derivados-agro/mejoras-dispo",
    EMPTY,
    POLL_MS,
    { fetchOnMount: true },
  );

  // Tickers son los mismos en los 3 bloques — uso el primero como base de
  // filas y miro los otros dos por (commodity, ticker) para sacar valor_final
  // y valor_usd. Si un commodity no tiene precio en Cámara, sus celdas quedan
  // en "—" / "N/A".
  const base = data.bloques[0]?.filas ?? [];
  const byComm = new Map<Commodity, Map<string, MejorasRow>>();
  for (const b of data.bloques) {
    const m = new Map<string, MejorasRow>();
    for (const r of b.filas) {
      m.set(r.ticker ?? r.vencimiento, r);
    }
    byComm.set(b.commodity, m);
  }

  const precioByComm: Record<Commodity, number | null> = {
    SOJA:  data.bloques.find((b) => b.commodity === "SOJA")?.precio_ars  ?? null,
    MAIZ:  data.bloques.find((b) => b.commodity === "MAIZ")?.precio_ars  ?? null,
    TRIGO: data.bloques.find((b) => b.commodity === "TRIGO")?.precio_ars ?? null,
  };

  return (
    <div className="h-full min-h-0 p-2 flex flex-col">
      <div className="flex-1 min-h-0">
        <Panel title="MEJORAS PRECIO DISPONIBLE — Soja · Maíz · Trigo" expandable>
          {base.length === 0 ? (
            <p className="text-[#555] text-xs py-6 text-center">
              {data.bloques.length === 0
                ? "Sin data — backend no responde o falta cargar la Cámara"
                : "Sin LECAPs vigentes con TNA"}
            </p>
          ) : (
            <table className="w-full text-[10px] font-mono tabular-nums">
              <thead className="text-[9px] text-[#808080] uppercase tracking-wide bg-[#0a0a0a] sticky top-0 z-10">
                <tr>
                  <th rowSpan={2} className="text-left px-1 py-1 border-b border-[var(--t-border)] align-bottom">
                    Ticker
                  </th>
                  <th rowSpan={2} className="text-center px-1 py-1 border-b border-[var(--t-border)] align-bottom">
                    Vto
                  </th>
                  <th rowSpan={2} className="text-right px-1 py-1 border-b border-[var(--t-border)] align-bottom">
                    d
                  </th>
                  <th rowSpan={2} className="text-right px-1 py-1 border-b border-[var(--t-border)] align-bottom">
                    TNA
                  </th>
                  <th rowSpan={2} className="text-right px-1 py-1 border-b border-[var(--t-border)] align-bottom">
                    Diaria
                  </th>
                  <th rowSpan={2} className="text-right px-1 py-1 border-b border-[var(--t-border)] align-bottom">
                    Directa
                  </th>
                  {COMMODITIES.map((c) => {
                    const px = precioByComm[c.id];
                    const hasPx = px !== null;
                    return (
                      <th
                        key={c.id}
                        colSpan={2}
                        className={`text-center px-1 py-1 border-b border-[var(--t-border)] border-l border-l-[var(--t-border)] ${
                          hasPx ? "text-[#ff9900]" : "text-[#666]"
                        }`}
                      >
                        {c.short}
                        <span className="ml-1 text-[9px] font-normal">
                          {hasPx ? fmtArs(px) : "(sin precio)"}
                        </span>
                      </th>
                    );
                  })}
                </tr>
                <tr>
                  {COMMODITIES.map((c) => (
                    <CommodityHeader key={c.id} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {base.map((r) => {
                  const key = r.ticker ?? r.vencimiento;
                  return (
                    <tr
                      key={key}
                      className="border-b border-[#101010] hover:bg-[#0d0d0d]"
                    >
                      <td className="px-1 py-0.5 text-[#ff9900] font-semibold">
                        {r.ticker ?? "—"}
                      </td>
                      <td className="px-1 py-0.5 text-center text-[#808080]">
                        {fmtFechaCorta(r.vencimiento)}
                      </td>
                      <td className="px-1 py-0.5 text-right text-[#808080]">
                        {r.dias}
                      </td>
                      <td className="px-1 py-0.5 text-right text-[#d0d0d0]">
                        {fmtPct(r.tna)}
                      </td>
                      <td className="px-1 py-0.5 text-right text-[#a0a0a0]">
                        {fmtPctMini(r.tasa_diaria)}
                      </td>
                      <td className="px-1 py-0.5 text-right text-[#a0a0a0]">
                        {fmtPct(r.tasa_directa)}
                      </td>
                      {COMMODITIES.map((c) => {
                        const cell = byComm.get(c.id)?.get(key);
                        return (
                          <CommodityCells
                            key={c.id}
                            valorFinal={cell?.valor_final ?? null}
                            valorUsd={cell?.valor_usd ?? null}
                          />
                        );
                      })}
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

function CommodityHeader() {
  return (
    <>
      <th className="text-right px-1 py-1 border-b border-[var(--t-border)] border-l border-l-[var(--t-border)]">
        Final
      </th>
      <th className="text-right px-1 py-1 border-b border-[var(--t-border)]">
        US$
      </th>
    </>
  );
}

function CommodityCells({
  valorFinal,
  valorUsd,
}: {
  valorFinal: number | null;
  valorUsd: number | null;
}) {
  return (
    <>
      <td className="px-1 py-0.5 text-right text-[#d0d0d0] border-l border-l-[var(--t-border)]">
        {fmtArs(valorFinal)}
      </td>
      <td
        className={`px-1 py-0.5 text-right font-semibold ${
          valorUsd === null ? "text-[#555]" : "text-[#ff9900]"
        }`}
      >
        {fmtUsd(valorUsd)}
      </td>
    </>
  );
}
