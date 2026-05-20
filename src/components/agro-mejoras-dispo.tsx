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

interface Bloque {
  commodity: "SOJA" | "MAIZ" | "TRIGO";
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

function fmtFechaIso(s: string | null | undefined): string {
  if (!s) return "—";
  const t = s.slice(0, 10);
  if (t.length !== 10) return s;
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(0, 4)}`;
}

export function AgroMejorasDispo() {
  const { data } = usePoll<MejorasResp>(
    "/api/derivados-agro/mejoras-dispo",
    EMPTY,
    POLL_MS,
    { fetchOnMount: true },
  );

  return (
    <div className="h-full min-h-0 p-3 flex flex-col gap-3 overflow-auto">
      {data.bloques.length === 0 ? (
        <div className="text-[#555] text-xs py-6 text-center">
          Sin data — backend no responde o falta cargar la Cámara
        </div>
      ) : (
        data.bloques.map((b) => <BloqueTabla key={b.commodity} bloque={b} />)
      )}
    </div>
  );
}

function BloqueTabla({ bloque }: { bloque: Bloque }) {
  const precioAr = bloque.precio_ars;
  const commLabel =
    bloque.commodity === "SOJA"
      ? "Soja"
      : bloque.commodity === "MAIZ"
        ? "Maíz"
        : "Trigo";

  return (
    <Panel
      title={`${commLabel.toUpperCase()} + LECAP`}
      expandable
      sub={
        precioAr !== null
          ? `${commLabel} Rosario: ${fmtArs(precioAr)}`
          : "Sin precio Cámara — cargá en Datos"
      }
    >
      {bloque.filas.length === 0 ? (
        <p className="text-[#555] text-xs py-3 text-center">
          Sin LECAPs vigentes con TNA
        </p>
      ) : (
        <table className="w-full text-[11px] font-mono tabular-nums">
          <thead className="text-[10px] text-[#808080] uppercase tracking-wide bg-[#0a0a0a] sticky top-0 z-10">
            <tr>
              <th className="text-left px-1.5 py-1 border-b border-[#1a1a1a]">
                Ticker
              </th>
              <th className="text-center px-1.5 py-1 border-b border-[#1a1a1a]">
                Vto
              </th>
              <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                Días
              </th>
              <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                TNA
              </th>
              <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                Tasa diaria
              </th>
              <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                Tasa directa
              </th>
              <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                {commLabel} Rosario
              </th>
              <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                Interés
              </th>
              <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                Valor final
              </th>
              <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                Valor en US$
              </th>
            </tr>
          </thead>
          <tbody>
            {bloque.filas.map((r) => (
              <tr
                key={r.ticker ?? r.vencimiento}
                className="border-b border-[#101010] hover:bg-[#0d0d0d]"
              >
                <td className="px-1.5 py-0.5 text-[#ff9900] font-semibold">
                  {r.ticker ?? "—"}
                </td>
                <td className="px-1.5 py-0.5 text-center text-[#808080]">
                  {fmtFechaIso(r.vencimiento)}
                </td>
                <td className="px-1.5 py-0.5 text-right text-[#808080]">
                  {r.dias}
                </td>
                <td className="px-1.5 py-0.5 text-right text-[#d0d0d0]">
                  {fmtPct(r.tna)}
                </td>
                <td className="px-1.5 py-0.5 text-right text-[#a0a0a0]">
                  {fmtPctMini(r.tasa_diaria)}
                </td>
                <td className="px-1.5 py-0.5 text-right text-[#a0a0a0]">
                  {fmtPct(r.tasa_directa)}
                </td>
                <td className="px-1.5 py-0.5 text-right text-[#a0a0a0]">
                  {fmtArs(precioAr)}
                </td>
                <td className="px-1.5 py-0.5 text-right text-[#4ade80]">
                  {fmtArs(r.interes_ganado)}
                </td>
                <td className="px-1.5 py-0.5 text-right text-[#d0d0d0] font-semibold">
                  {fmtArs(r.valor_final)}
                </td>
                <td className="px-1.5 py-0.5 text-right text-[#ff9900] font-semibold">
                  {fmtUsd(r.valor_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
