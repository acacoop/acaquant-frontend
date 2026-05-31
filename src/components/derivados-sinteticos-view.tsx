"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
      <div className="border-b border-[#1a1a1a] bg-[var(--t-panel)] px-3 flex items-center gap-2 shrink-0 min-h-[33px]">
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

      <div className="flex-1 min-h-0 flex flex-col">
        {/* Fila 1 — Tablas lado a lado. Altura por contenido (shrink-0) con
            cap al 50% para que los charts tengan al menos la otra mitad. Si
            una tabla tiene muchas filas, scrollea internamente (panel.tsx ya
            hace overflow-y-auto). Antes la fila ocupaba 70/30 con flex-grow
            → el Long-LECAP con 7 filas quedaba con espacio vacío gigante. */}
        <div className="shrink-0 max-h-[50%] flex items-start border-b border-[#1a1a1a]">
          <div className="w-1/2 min-w-0 border-r border-[#1a1a1a]">
            <LongLecapPanel rows={data.long_rofex_long_lecap} />
          </div>
          <div className="w-1/2 min-w-0">
            <ShortDlkPanel rows={data.short_rofex_long_dlk} />
          </div>
        </div>
        {/* Fila 2 — Charts lado a lado. flex-1 → llenan el resto vertical. */}
        <div className="flex-1 min-h-0 flex">
          <div className="w-1/2 min-w-0 border-r border-[#1a1a1a]">
            <CurvaTnaChart
              titulo="Curva TNA · Long Rofex − Long Lecap"
              rows={data.long_rofex_long_lecap}
            />
          </div>
          <div className="w-1/2 min-w-0">
            <CurvaTnaChart
              titulo="Curva TNA · Short Rofex − Long DLK"
              rows={data.short_rofex_long_dlk}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Chart compartido: TNA vs plazo ──────────────────────────────────────────

interface ChartRow {
  ticker: string | null;
  plazo_normal: number;
  descalce: number | null;
  tna: number | null;
}

function CurvaTnaChart({ titulo, rows }: { titulo: string; rows: ChartRow[] }) {
  // Solo plotea filas válidas: descalce==0 y TNA finita. Las inválidas
  // ensucian la curva.
  const data = useMemo(() => {
    return rows
      .filter(
        (r) =>
          (r.descalce ?? 0) === 0 &&
          r.tna != null &&
          isFinite(r.tna),
      )
      .map((r) => ({
        ticker: r.ticker ?? "?",
        plazo: r.plazo_normal,
        tnaPct: (r.tna as number) * 100,
      }))
      .sort((a, b) => a.plazo - b.plazo);
  }, [rows]);

  // Domain del eje Y calculado del dataset: padding ~15% del rango (con piso 1%)
  // para que la línea no quede pegada al techo. Si el rango cruza 0, fuerza que
  // 0 esté visible para distinguir tasa positiva de negativa. Antes Recharts
  // autoescaleaba desde ~0 → cuando todas las TNAs viven en ~24%, el chart
  // quedaba 70% vacío con la línea contra el borde.
  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (data.length === 0) return undefined;
    const vs = data.map((d) => d.tnaPct);
    const min = Math.min(...vs);
    const max = Math.max(...vs);
    const pad = Math.max(1, (max - min) * 0.15);
    let lo = min - pad;
    let hi = max + pad;
    if (min < 0 && max > 0) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    return [lo, hi];
  }, [data]);

  return (
    <div className="h-full min-h-0 p-3 flex flex-col">
      <div className="flex-1 min-h-0">
        <Panel title={titulo.toUpperCase()}>
          {data.length === 0 ? (
            <p className="text-[#555] text-xs py-6 text-center">
              Sin datos válidos para graficar
            </p>
          ) : (
            <div className="w-full h-full min-h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data}
                  margin={{ top: 8, right: 24, bottom: 8, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="#1a1a1a" />
                  <XAxis
                    type="number"
                    dataKey="plazo"
                    domain={["dataMin", "dataMax"]}
                    stroke="#666"
                    tick={{ fontSize: 9, fill: "#888" }}
                    label={{
                      value: "Días",
                      position: "insideBottom",
                      offset: -2,
                      style: { fill: "#555", fontSize: 9 },
                    }}
                  />
                  <YAxis
                    stroke="#666"
                    tick={{ fontSize: 9, fill: "#888" }}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                    domain={yDomain ?? ["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0a0a0a",
                      border: "1px solid #2a2a2a",
                      fontSize: 11,
                    }}
                    labelStyle={{ color: "#888" }}
                    formatter={(value, _name, item) => {
                      const v = typeof value === "number" ? value : Number(value);
                      const payload = (item?.payload ?? {}) as { ticker?: string };
                      return [`${v.toFixed(2)}%`, payload.ticker ?? ""];
                    }}
                    labelFormatter={(label) => `Plazo: ${label}d`}
                  />
                  {yDomain && yDomain[0] < 0 && yDomain[1] > 0 && (
                    <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                  )}
                  <Line
                    // linear cuando hay 2-3 puntos (monotone los curvea raro);
                    // monotone con 4+ para suavizar la curva de tasas.
                    type={data.length <= 3 ? "linear" : "monotone"}
                    dataKey="tnaPct"
                    stroke="#ff9900"
                    strokeWidth={1.5}
                    dot={{ r: 3, fill: "#ff9900" }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

// ─── Tabla 1: LONG ROFEX + LONG LECAP ───────────────────────────────────────

function LongLecapPanel({ rows }: { rows: LongLecapRow[] }) {
  // Solo mostramos pares "limpios": descalce ≠ 0 → exposición ARS de unos
  // días entre el cobro del bono y el ajuste del futuro, no es estrictamente
  // un sintético cerrado y ensucia la comparación de TNAs.
  const visibles = useMemo(
    () => rows.filter((r) => (r.descalce ?? 0) === 0),
    [rows],
  );
  return (
    <div className="p-3">
      <div>
        <Panel title="SINTÉTICO · LONG ROFEX − LONG LECAP" expandable>
          {visibles.length === 0 ? (
            <p className="text-[#555555] text-xs py-4 text-center">
              {rows.length === 0
                ? "SIN MATCHES — esperando precios del motor"
                : "Sin pares con descalce = 0"}
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
                {visibles.map((r) => (
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
  const visibles = useMemo(
    () => rows.filter((r) => (r.descalce ?? 0) === 0),
    [rows],
  );
  return (
    <div className="p-3">
      <div>
        <Panel title="SINTÉTICO · SHORT ROFEX − LONG DLK" expandable>
          {visibles.length === 0 ? (
            <p className="text-[#555555] text-xs py-4 text-center">
              {rows.length === 0
                ? "SIN MATCHES — esperando precios del motor"
                : "Sin pares con descalce = 0"}
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
                {visibles.map((r) => (
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
