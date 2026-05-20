"use client";

import { Panel, fmtHoraAR } from "./ui";
import { usePoll } from "@/lib/use-poll";

const POLL_MS = 5_000;

interface LongLecapRow {
  ticker: string | null;
  futuro_ticker: string | null;
  px_tf: number | null;
  px_futuro: number | null;
  vto_fecha: string | null;
  futuro_vto_fecha: string | null;
  cobro: number | null;
  plazo_normal: number;
  descalce: number | null;
  t0: number | null;
  tn: number | null;
  te: number | null;
  tna: number | null;
}

interface ShortDlkRow {
  ticker: string | null;
  futuro_ticker: string | null;
  px_dlk: number | null;
  px_futuro: number | null;
  dlr_ajuste: number | null;
  vto_dlk: string | null;
  vto_futuro: string | null;
  plazo_normal: number;
  descalce: number | null;
  te: number | null;
  tna: number | null;
}

interface SinteticosResp {
  spot: number | null;
  spot_source: string;
  spot_ts: string | null;
  ts: string;
  long_rofex_long_lecap: LongLecapRow[];
  short_rofex_long_dlk: ShortDlkRow[];
}

// ─── Formatters ──────────────────────────────────────────────────────────────

function fmtPx(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtPctSigned(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  const pct = n * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function fmtRatio(n: number | null | undefined): string {
  // Para T+0 / T+n — números chicos (~0.09) con 4 decimales.
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return n.toFixed(4);
}

function fmtFechaIso(s: string | null | undefined): string {
  if (!s) return "—";
  const t = s.slice(0, 10);
  if (t.length !== 10) return s;
  return `${t.slice(8, 10)}/${t.slice(5, 7)}/${t.slice(2, 4)}`;
}

function pctColor(n: number | null | undefined): string {
  if (n === null || n === undefined) return "text-[#666]";
  return n >= 0 ? "text-[#00cc66]" : "text-[#ff3333]";
}

// ─── Componente principal ────────────────────────────────────────────────────

const EMPTY: SinteticosResp = {
  spot: null,
  spot_source: "none",
  spot_ts: null,
  ts: "",
  long_rofex_long_lecap: [],
  short_rofex_long_dlk: [],
};

export function DerivadosSinteticosView() {
  const { data, lastAt } = usePoll<SinteticosResp>(
    "/api/derivados-sinteticos",
    EMPTY,
    POLL_MS,
    { fetchOnMount: true },
  );

  const ultimoDisplay = lastAt > 0 ? fmtHoraAR(lastAt) : "—";

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Barra slim — SPOT + última actualización. */}
      <div className="border-b border-[#1a1a1a] bg-[#080808] px-3 flex items-center gap-2 shrink-0 min-h-[33px]">
        <span className="text-[10px] text-[#808080] uppercase tracking-wide">
          Sintéticos
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[10px] text-[#808080] tracking-wide">SPOT</span>
          <span className="text-[#ff9900] font-mono text-[11px]">
            {data.spot ? fmtPx(data.spot) : "—"}
          </span>
          <span className="text-[9px] text-[#555]">({data.spot_source})</span>
          <span className="text-[10px] text-[#555] ml-3">
            ÚLT {ultimoDisplay}
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* IZQUIERDA 55% — long-lecap arriba (70%), short-dlk abajo (30%). */}
        <div className="w-[55%] min-w-0 flex flex-col border-r border-[#1a1a1a]">
          <div className="h-[70%] min-h-0 border-b border-[#1a1a1a]">
            <LongLecapPanel rows={data.long_rofex_long_lecap} />
          </div>
          <div className="h-[30%] min-h-0">
            <ShortDlkPanel rows={data.short_rofex_long_dlk} />
          </div>
        </div>

        {/* DERECHA 45% — vacío por ahora (reservado para próximas vistas). */}
        <div className="w-[45%] min-w-0" />
      </div>
    </div>
  );
}

// ─── Tabla 1: LONG ROFEX + LONG LECAP ───────────────────────────────────────

function LongLecapPanel({ rows }: { rows: LongLecapRow[] }) {
  return (
    <div className="h-full min-h-0 p-3 flex flex-col">
      <div className="flex-1 min-h-0">
        <Panel title="SINTÉTICO · LONG ROFEX − LONG LECAP" expandable>
          {rows.length === 0 ? (
            <p className="text-[#555555] text-xs py-4 text-center">
              SIN MATCHES — esperando precios del motor
            </p>
          ) : (
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="text-[10px] text-[#808080] uppercase tracking-wide bg-[#0a0a0a] sticky top-0 z-10">
                <tr>
                  <th className="text-left px-1.5 py-1 border-b border-[#1a1a1a]">
                    Ticker
                  </th>
                  <th className="text-left px-1.5 py-1 border-b border-[#1a1a1a]">
                    Futuro
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    Px TF
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    Px Fut
                  </th>
                  <th className="text-center px-1.5 py-1 border-b border-[#1a1a1a]">
                    Vto
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    Cobro
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    Plazo
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    Desc.
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    T+0
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    T+n
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    TE
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    TNA
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.ticker ?? ""}
                    className="border-b border-[#101010] hover:bg-[#0d0d0d]"
                  >
                    <td className="px-1.5 py-0.5 text-[#ff9900] font-semibold">
                      {r.ticker ?? "—"}
                    </td>
                    <td className="px-1.5 py-0.5 text-[#d0d0d0]">
                      {r.futuro_ticker ?? "—"}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#d0d0d0]">
                      {fmtPx(r.px_tf)}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#d0d0d0]">
                      {fmtPx(r.px_futuro, 1)}
                    </td>
                    <td className="px-1.5 py-0.5 text-center text-[#808080]">
                      {fmtFechaIso(r.vto_fecha)}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#a0a0a0]">
                      {fmtPx(r.cobro, 3)}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#808080]">
                      {r.plazo_normal}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#666]">
                      {r.descalce ?? 0}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#a0a0a0]">
                      {fmtRatio(r.t0)}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#a0a0a0]">
                      {fmtRatio(r.tn)}
                    </td>
                    <td className={`px-1.5 py-0.5 text-right ${pctColor(r.te)}`}>
                      {fmtPctSigned(r.te)}
                    </td>
                    <td
                      className={`px-1.5 py-0.5 text-right font-semibold ${pctColor(r.tna)}`}
                    >
                      {fmtPctSigned(r.tna)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ─── Tabla 2: SHORT ROFEX + LONG DLK ────────────────────────────────────────

function ShortDlkPanel({ rows }: { rows: ShortDlkRow[] }) {
  return (
    <div className="h-full min-h-0 p-3 flex flex-col">
      <div className="flex-1 min-h-0">
        <Panel title="SINTÉTICO · SHORT ROFEX − LONG DLK" expandable>
          {rows.length === 0 ? (
            <p className="text-[#555555] text-xs py-4 text-center">
              SIN MATCHES — esperando precios del motor
            </p>
          ) : (
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="text-[10px] text-[#808080] uppercase tracking-wide bg-[#0a0a0a] sticky top-0 z-10">
                <tr>
                  <th className="text-left px-1.5 py-1 border-b border-[#1a1a1a]">
                    Ticker
                  </th>
                  <th className="text-left px-1.5 py-1 border-b border-[#1a1a1a]">
                    Futuro
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    Px DLK
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    Px Fut
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    DLR Aj.
                  </th>
                  <th className="text-center px-1.5 py-1 border-b border-[#1a1a1a]">
                    Vto DLK
                  </th>
                  <th className="text-center px-1.5 py-1 border-b border-[#1a1a1a]">
                    Vto Fut
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    Plazo
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    Desc.
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    TE
                  </th>
                  <th className="text-right px-1.5 py-1 border-b border-[#1a1a1a]">
                    TNA
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.ticker ?? ""}
                    className="border-b border-[#101010] hover:bg-[#0d0d0d]"
                  >
                    <td className="px-1.5 py-0.5 text-[#ff9900] font-semibold">
                      {r.ticker ?? "—"}
                    </td>
                    <td className="px-1.5 py-0.5 text-[#d0d0d0]">
                      {r.futuro_ticker ?? "—"}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#d0d0d0]">
                      {fmtPx(r.px_dlk, 3)}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#d0d0d0]">
                      {fmtPx(r.px_futuro, 1)}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#a0a0a0]">
                      {fmtPx(r.dlr_ajuste)}
                    </td>
                    <td className="px-1.5 py-0.5 text-center text-[#808080]">
                      {fmtFechaIso(r.vto_dlk)}
                    </td>
                    <td className="px-1.5 py-0.5 text-center text-[#808080]">
                      {fmtFechaIso(r.vto_futuro)}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#808080]">
                      {r.plazo_normal}
                    </td>
                    <td className="px-1.5 py-0.5 text-right text-[#666]">
                      {r.descalce ?? 0}
                    </td>
                    <td className={`px-1.5 py-0.5 text-right ${pctColor(r.te)}`}>
                      {fmtPctSigned(r.te)}
                    </td>
                    <td
                      className={`px-1.5 py-0.5 text-right font-semibold ${pctColor(r.tna)}`}
                    >
                      {fmtPctSigned(r.tna)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}
