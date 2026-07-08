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

// ─── Config por commodity ────────────────────────────────────────────────────
// Cada commodity tiene su propia tabla (una fila por LECAP) con TODAS las
// columnas — se repiten Vto/Días/TNA/tasas a propósito (pedido de la mesa) para
// que cada bloque se lea aislado. Los colores replican la planilla:
// Soja=verde, Maíz=amarillo, Trigo=rojo. Se usan tints rgba para que sigan
// legibles en tema claro y oscuro.

const COMMODITY_CFG: Record<
  Commodity,
  { label: string; noun: string; tint: string; accent: string }
> = {
  SOJA: {
    label: "Soja + Lecap",
    noun: "Soja",
    tint: "rgba(122,186,96,0.28)",
    accent: "var(--t-pos)",
  },
  MAIZ: {
    label: "Maíz + Lecap",
    noun: "Maíz",
    tint: "rgba(240,201,74,0.28)",
    accent: "#c79a2e",
  },
  TRIGO: {
    label: "Trigo + Lecap",
    noun: "Trigo",
    tint: "rgba(217,138,106,0.30)",
    accent: "var(--t-neg)",
  },
};

const ORDER: Commodity[] = ["SOJA", "MAIZ", "TRIGO"];

// Header de tablas — azul marino de la planilla, legible en ambos temas.
const HEADER_BG = "#1e2a4a";
const HEADER_TX = "#e8edf7";

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

export function AgroMejorasDispo() {
  const { data } = usePoll<MejorasResp>(
    "/api/derivados-agro/mejoras-dispo",
    EMPTY,
    POLL_MS,
    { fetchOnMount: true },
  );

  const byComm = new Map<Commodity, Bloque>();
  for (const b of data.bloques) byComm.set(b.commodity, b);

  const hasData = data.bloques.some((b) => b.filas.length > 0);

  return (
    <div className="h-full min-h-0 p-2 flex flex-row gap-2">
      {/* La tabla ocupa la mitad izquierda; la mitad derecha queda libre para
          próximos módulos. */}
      <div className="w-1/2 h-full min-h-0">
        <Panel title="DISPONIBLE ROSARIO" expandable>
          {!hasData ? (
            <p className="text-[var(--t-text-muted)] text-xs py-6 text-center">
              {data.bloques.length === 0
                ? "Sin data — backend no responde o falta cargar la Cámara"
                : "Sin LECAPs vigentes con TNA"}
            </p>
          ) : (
            <div className="flex flex-col gap-4 py-1">
              {ORDER.map((c) => {
                const bloque = byComm.get(c);
                if (!bloque) return null;
                return <CommodityTable key={c} commodity={c} bloque={bloque} />;
              })}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ─── Una tabla por commodity ─────────────────────────────────────────────────

function CommodityTable({
  commodity,
  bloque,
}: {
  commodity: Commodity;
  bloque: Bloque;
}) {
  const cfg = COMMODITY_CFG[commodity];
  const precio = bloque.precio_ars;

  if (bloque.filas.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] font-mono tabular-nums border border-[var(--t-border)]">
        <thead>
          <tr style={{ backgroundColor: HEADER_BG, color: HEADER_TX }}>
            <th className="text-left px-2 py-1.5 font-semibold tracking-wide">
              {cfg.label}
            </th>
            <th className="text-center px-2 py-1.5">Vencimiento</th>
            <th className="text-right px-2 py-1.5">Días</th>
            <th className="text-right px-2 py-1.5">TNA</th>
            <th className="text-right px-2 py-1.5">Tasa diaria</th>
            <th className="text-right px-2 py-1.5">Tasa directa</th>
            <th className="text-right px-2 py-1.5">Precio {cfg.noun}</th>
            <th className="text-right px-2 py-1.5">Interés ganado</th>
            <th className="text-right px-2 py-1.5">Valor {cfg.noun} Final</th>
            <th className="text-right px-2 py-1.5">Valor en Us$</th>
          </tr>
        </thead>
        <tbody>
          {bloque.filas.map((r) => (
            <tr
              key={r.ticker ?? r.vencimiento}
              className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]"
            >
              <td
                className="px-2 py-1 font-semibold"
                style={{ color: cfg.accent }}
              >
                {r.ticker ?? "—"}
              </td>
              <td
                className="px-2 py-1 text-center text-[var(--t-text)]"
                style={{ backgroundColor: cfg.tint }}
              >
                {fmtFechaCorta(r.vencimiento)}
              </td>
              <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">
                {r.dias}
              </td>
              <td className="px-2 py-1 text-right font-black text-[var(--t-text)]">
                {fmtPct(r.tna)}
              </td>
              <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">
                {fmtPctMini(r.tasa_diaria)}
              </td>
              <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">
                {fmtPct(r.tasa_directa)}
              </td>
              <td className="px-2 py-1 text-right font-semibold text-[var(--t-text)]">
                {fmtArs(precio)}
              </td>
              <td className="px-2 py-1 text-right font-black text-[var(--t-pos)]">
                {fmtArs(r.interes_ganado)}
              </td>
              <td
                className="px-2 py-1 text-right font-black text-[var(--t-text)]"
                style={{ backgroundColor: cfg.tint }}
              >
                {fmtArs(r.valor_final)}
              </td>
              <td
                className={`px-2 py-1 text-right font-semibold ${
                  r.valor_usd === null
                    ? "text-[var(--t-text-muted)]"
                    : "text-[var(--t-accent)]"
                }`}
              >
                {fmtUsd(r.valor_usd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
