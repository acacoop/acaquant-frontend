"use client";

import { useMemo, useState } from "react";
import { Panel } from "./ui";
import { usePoll } from "@/lib/use-poll";

const POLL_MS = 5_000;

type Commodity = "TRIGO" | "MAIZ" | "SOJA";

interface LegSnapshot {
  ticker: string;
  bid: number | null;
  offer: number | null;
  last: number | null;
  vol: number | null;
  updated_at: string | null;
}
interface StrikeRow {
  strike: number;
  call: LegSnapshot | null;
  put: LegSnapshot | null;
}
interface VencimientoBlock {
  vencimiento: string;
  futuro_ticker: string | null;
  futuro_last: number | null;
  dias_a_vto: number | null;
  strikes: StrikeRow[];
}
interface PanelResp {
  commodity: Commodity;
  ts: string;
  data_fresh?: boolean;
  vencimientos: VencimientoBlock[];
}

function fmtPx(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtFecha(yyyymmdd: string | null | undefined): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd ?? "—";
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(0, 4)}`;
}

function vtoLabel(b: VencimientoBlock): string {
  if (b.futuro_ticker) {
    const parts = b.futuro_ticker.split("/");
    if (parts.length === 2) return parts[1];
  }
  return fmtFecha(b.vencimiento);
}

export function AgroOpcionesChain({
  commodity,
  onOpenSimulador,
}: {
  commodity: Commodity;
  onOpenSimulador: () => void;
}) {
  // initial estable por commodity — usePoll resetea data cuando cambia la
  // identidad de `initial` (lo aprovechamos para limpiar al cambiar de grano).
  const empty = useMemo<PanelResp>(
    () => ({ commodity, ts: "", vencimientos: [] }),
    [commodity],
  );
  const { data } = usePoll<PanelResp>(
    `/api/derivados-agro/opciones/${commodity}`,
    empty,
    POLL_MS,
    { fetchOnMount: true },
  );

  // El vencimiento elegido por el usuario; si deja de existir (cambió el
  // commodity / venció), cae al primero — sin setState en efecto.
  const [vtoSel, setVtoSel] = useState<string | null>(null);
  const vto = useMemo(() => {
    if (vtoSel && data.vencimientos.some((v) => v.vencimiento === vtoSel)) {
      return vtoSel;
    }
    return data.vencimientos[0]?.vencimiento ?? null;
  }, [vtoSel, data.vencimientos]);

  const block = data.vencimientos.find((v) => v.vencimiento === vto) ?? null;
  const futuro = block?.futuro_last ?? null;

  return (
    <div className="h-full min-h-0 p-3 flex flex-col">
      <div className="flex-1 min-h-0">
        <Panel
          title={`OPCIONES — ${commodity}`}
          actions={
            <div className="flex items-center gap-2">
              <select
                value={vto ?? ""}
                onChange={(e) => setVtoSel(e.target.value || null)}
                disabled={data.vencimientos.length === 0}
                className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-1.5 py-0.5 font-mono focus:border-[#ff9900] outline-none"
              >
                {data.vencimientos.length === 0 && (
                  <option value="">sin vtos</option>
                )}
                {data.vencimientos.map((v) => (
                  <option key={v.vencimiento} value={v.vencimiento}>
                    {vtoLabel(v)} — {fmtFecha(v.vencimiento)}
                  </option>
                ))}
              </select>
              {block?.dias_a_vto != null && (
                <span className="text-[9px] text-[var(--t-text-muted)]">
                  {block.dias_a_vto}d
                </span>
              )}
              <span className="text-[9px] text-[var(--t-text-dim)] uppercase">fut</span>
              <span className="text-[#ff9900] font-mono text-[10px]">
                {fmtPx(futuro)}
              </span>
              <button
                onClick={onOpenSimulador}
                className="px-2 py-0.5 text-[10px] font-semibold tracking-wide border border-[#3b82f6]/60 text-[#3b82f6] hover:bg-[#3b82f6]/10 transition-colors"
                title="Abrir simulador de estrategias de cobertura"
              >
                ⊕ Simulador Estrategias Cobertura
              </button>
            </div>
          }
        >
          <ChainTable block={block} futuro={futuro} />
        </Panel>
      </div>
    </div>
  );
}

function ChainTable({
  block,
  futuro,
}: {
  block: VencimientoBlock | null;
  futuro: number | null;
}) {
  if (!block || block.strikes.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[var(--t-text-muted)] text-[11px]">
        Sin opciones cargadas para este vencimiento
      </div>
    );
  }
  const dists = block.strikes.map((x) =>
    futuro != null ? Math.abs(x.strike - futuro) : Infinity,
  );
  const minDist = Math.min(...dists);

  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="text-[9px] text-[var(--t-text-dim)] uppercase tracking-wide bg-[#0a0a0a] sticky top-0 z-10">
        <tr>
          <th
            colSpan={3}
            className="text-center px-2 py-1 border-b border-[var(--t-border)] text-[#4ade80]"
          >
            CALL
          </th>
          <th className="text-center px-2 py-1 border-b border-[var(--t-border)]">
            STRIKE
          </th>
          <th
            colSpan={3}
            className="text-center px-2 py-1 border-b border-[var(--t-border)] text-[#f87171]"
          >
            PUT
          </th>
        </tr>
        <tr>
          <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">Bid</th>
          <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">Ofer</th>
          <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">Últ</th>
          <th className="text-center px-2 py-1 border-b border-[var(--t-border)]">—</th>
          <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">Bid</th>
          <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">Ofer</th>
          <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">Últ</th>
        </tr>
      </thead>
      <tbody>
        {block.strikes.map((s, i) => {
          const isAtm = futuro != null && dists[i] === minDist;
          return (
            <tr
              key={s.strike}
              className={`border-b border-[#101010] ${
                isAtm ? "bg-[#ff9900]/10" : "hover:bg-[#0d0d0d]"
              }`}
            >
              <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
                {fmtPx(s.call?.bid)}
              </td>
              <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
                {fmtPx(s.call?.offer)}
              </td>
              <td className="px-2 py-0.5 text-right text-[var(--t-text)] font-semibold">
                {fmtPx(s.call?.last)}
              </td>
              <td
                className={`px-2 py-0.5 text-center font-semibold ${
                  isAtm ? "text-[#ff9900]" : "text-[var(--t-text)]"
                }`}
              >
                {fmtPx(s.strike, 0)}
              </td>
              <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
                {fmtPx(s.put?.bid)}
              </td>
              <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
                {fmtPx(s.put?.offer)}
              </td>
              <td className="px-2 py-0.5 text-right text-[var(--t-text)] font-semibold">
                {fmtPx(s.put?.last)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
