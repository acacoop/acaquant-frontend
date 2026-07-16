"use client";

import { useMemo } from "react";

import { usePoll } from "@/lib/use-poll";

// TRADING → REUTERS: tablero live de los subyacentes US suscriptos (feed de la
// PC de oficina). Tabla a la izquierda (60%); el panel derecho queda reservado
// para lo próximo que se diseñe. La columna CCL está modelada pero PENDIENTE:
// se va a calcular en vivo como precio_cedear_ars × ratio / precio_adr_usd.
const POLL_MS = 5_000;

interface ReutersRow {
  ticker: string;
  ric: string | null;
  last: number | null;
  bid: number | null;
  ask: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  volumen: number | null;
  var_pct: number | null;
  var_neta: number | null;
  ratio: number | null;
  ccl: number | null;
  updated_at: string | null;
}

function fmt(n: number | null, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtVol(n: number | null): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function hora(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString("es-AR", { hour12: false });
}

function varClass(v: number | null): string {
  if (v === null || v === undefined || !isFinite(v) || v === 0) return "text-[var(--t-text-dim)]";
  return v > 0 ? "text-green-400" : "text-red-400";
}

export function ReutersView() {
  const { data: rows, lastAt } = usePoll<ReutersRow[]>(
    "/api/trading/reuters", [], POLL_MS, { fetchOnMount: true },
  );
  const filas = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  return (
    <div className="h-full flex min-h-0">
      {/* Tabla de suscriptos — 60% del ancho */}
      <div className="w-[60%] h-full flex flex-col min-h-0 border-r border-[var(--t-border)]">
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
          <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">REUTERS</span>
          <span className="text-[10px] text-[var(--t-text-muted)]">
            {filas.length} activo{filas.length === 1 ? "" : "s"} suscripto{filas.length === 1 ? "" : "s"}
          </span>
          {lastAt > 0 && (
            <span className="ml-auto text-[9px] text-[var(--t-text-dim)]">live · 5s</span>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {filas.length === 0 ? (
            <div className="p-4 text-[11px] text-[var(--t-text-muted)]">
              Sin activos suscriptos todavía — prendé el feed en la PC de la oficina
              y cargá los códigos en Manager → Títulos → Renta Variable.
            </div>
          ) : (
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)]">
                <tr className="text-left text-[var(--t-text-dim)] tracking-widest text-[9px]">
                  <th className="px-3 py-2">ACTIVO</th>
                  <th className="px-2 py-2 text-right">ÚLTIMO</th>
                  <th className="px-2 py-2 text-right">BID</th>
                  <th className="px-2 py-2 text-right">ASK</th>
                  <th className="px-2 py-2 text-right">APERTURA</th>
                  <th className="px-2 py-2 text-right">MÁX</th>
                  <th className="px-2 py-2 text-right">MÍN</th>
                  <th className="px-2 py-2 text-right">CIERRE ANT.</th>
                  <th className="px-2 py-2 text-right">VOLUMEN</th>
                  <th className="px-2 py-2 text-right">VAR %</th>
                  <th className="px-2 py-2 text-right">VAR NETA</th>
                  <th className="px-2 py-2 text-right" title="Ratio de conversión del CEDEAR (CEDEARs por acción)">RATIO</th>
                  <th className="px-2 py-2 text-right" title="CCL implícito del activo — próximamente">CCL</th>
                  <th className="px-3 py-2 text-right">HORA</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((r) => (
                  <tr key={r.ticker} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className="text-[var(--t-accent)] font-semibold">{r.ticker}</span>
                      {r.ric && <span className="ml-1.5 text-[9px] text-[var(--t-text-dim)]">{r.ric}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text)] font-semibold">{fmt(r.last)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{fmt(r.bid)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{fmt(r.ask)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{fmt(r.open)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{fmt(r.high)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{fmt(r.low)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{fmt(r.prev_close)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">{fmtVol(r.volumen)}</td>
                    <td className={`px-2 py-1.5 text-right ${varClass(r.var_pct)}`}>
                      {r.var_pct === null ? "—" : `${r.var_pct > 0 ? "+" : ""}${fmt(r.var_pct)}%`}
                    </td>
                    <td className={`px-2 py-1.5 text-right ${varClass(r.var_neta)}`}>
                      {r.var_neta === null ? "—" : `${r.var_neta > 0 ? "+" : ""}${fmt(r.var_neta)}`}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">
                      {r.ratio === null ? "—" : `${fmt(r.ratio, 0)}:1`}
                    </td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text-dim)]">—</td>
                    <td className="px-3 py-1.5 text-right text-[var(--t-text-dim)] whitespace-nowrap">{hora(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Panel derecho (40%) — reservado, se diseña después */}
      <div className="flex-1 h-full flex items-center justify-center">
        <span className="text-[10px] text-[var(--t-text-dim)] tracking-widest">PRÓXIMAMENTE</span>
      </div>
    </div>
  );
}
