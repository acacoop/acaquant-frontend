"use client";

import { useEffect, useMemo, useState } from "react";
import { useViewportKey } from "@/lib/use-viewport-key";
import { DualRange } from "./dual-range";
import { SensibilidadTable } from "./sensibilidad-table";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface HistRow {
  fecha: string;
  ticker: string;
  price: number | null;
}

type Curva = "tasa_fija" | "cer";

const PALETA = [
  "#ff9900",
  "#4a9eff",
  "#00cc66",
  "#ff3333",
  "#bb66ff",
  "#00cccc",
  "#ffee44",
  "#ff66aa",
  "#aaff00",
  "#ff6600",
];

function fmtFechaCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function RetornoTotalView() {
  const [tab, setTab] = useState<"historico" | "sensibilidad">("historico");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
        <span className="text-[11px] font-semibold text-[#ff9900] tracking-widest mr-3">
          RETORNO
        </span>
        <TabPill
          label="HISTÓRICO"
          active={tab === "historico"}
          onClick={() => setTab("historico")}
        />
        <TabPill
          label="RETORNO TOTAL"
          active={tab === "sensibilidad"}
          onClick={() => setTab("sensibilidad")}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "historico" && <HistoricoTab />}
        {tab === "sensibilidad" && <SensibilidadTable />}
      </div>
    </div>
  );
}

function TabPill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[11px] font-semibold tracking-wide border ${
        active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {label}
    </button>
  );
}

function HistoricoTab() {
  const [curva, setCurva] = useState<Curva>("tasa_fija");
  const [byCurva, setByCurva] = useState<Record<string, HistRow[]>>({});
  const vpKey = useViewportKey();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (byCurva[curva]) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/historico-curva?curva=${encodeURIComponent(curva)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: HistRow[] = await res.json();
        if (cancelled) return;
        setByCurva((prev) => ({ ...prev, [curva]: j }));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [curva, byCurva]);

  const rows = useMemo<HistRow[]>(() => byCurva[curva] || [], [byCurva, curva]);

  const fechas = useMemo(
    () => Array.from(new Set(rows.map((r) => r.fecha))).sort(),
    [rows]
  );

  const tickers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.ticker))).sort(),
    [rows]
  );

  const [rangoIdx, setRangoIdx] = useState<[number, number] | null>(null);

  const effectiveRango: [number, number] =
    fechas.length > 0
      ? rangoIdx == null
        ? [0, fechas.length - 1]
        : [
            Math.min(Math.max(0, rangoIdx[0]), fechas.length - 1),
            Math.min(Math.max(rangoIdx[0], rangoIdx[1]), fechas.length - 1),
          ]
      : [0, 0];

  const fechaDesde = fechas[effectiveRango[0]];
  const fechaHasta = fechas[effectiveRango[1]];

  const { chartData, tabla } = useMemo(() => {
    if (!rows.length || !fechaDesde || !fechaHasta) {
      return { chartData: [] as Array<Record<string, string | number>>, tabla: [] as Array<{ ticker: string; retorno: number; base: number; final: number }> };
    }
    const precioPorFecha: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (r.price == null) continue;
      if (r.fecha < fechaDesde || r.fecha > fechaHasta) continue;
      if (!precioPorFecha[r.fecha]) precioPorFecha[r.fecha] = {};
      precioPorFecha[r.fecha][r.ticker] = r.price;
    }
    const fechasRango = Object.keys(precioPorFecha).sort();
    if (!fechasRango.length) return { chartData: [], tabla: [] };

    const basePrecios: Record<string, number> = {};
    for (const f of fechasRango) {
      for (const [tk, p] of Object.entries(precioPorFecha[f])) {
        if (!(tk in basePrecios)) basePrecios[tk] = p;
      }
    }

    const chartData = fechasRango.map((f) => {
      const row: Record<string, string | number> = { fecha: f };
      for (const [tk, p] of Object.entries(precioPorFecha[f])) {
        const base = basePrecios[tk];
        if (base && base > 0) {
          row[tk] = +((p / base - 1) * 100).toFixed(3);
        }
      }
      return row;
    });

    const ultimos = precioPorFecha[fechasRango[fechasRango.length - 1]] || {};
    const tabla = tickers
      .map((tk) => {
        const base = basePrecios[tk];
        const final = ultimos[tk];
        if (base == null || final == null) return null;
        return {
          ticker: tk,
          base,
          final,
          retorno: +((final / base - 1) * 100).toFixed(2),
        };
      })
      .filter((x): x is { ticker: string; retorno: number; base: number; final: number } => x !== null)
      .sort((a, b) => b.retorno - a.retorno);

    return { chartData, tabla };
  }, [rows, fechaDesde, fechaHasta, tickers]);

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3">
      <div className="border border-[#1a1a1a] bg-[#080808] p-3 shrink-0 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <FilterBtn active={curva === "tasa_fija"} onClick={() => { setCurva("tasa_fija"); setRangoIdx(null); }}>
            TASA FIJA
          </FilterBtn>
          <FilterBtn active={curva === "cer"} onClick={() => { setCurva("cer"); setRangoIdx(null); }}>
            CER
          </FilterBtn>
        </div>

        {loading ? (
          <span className="text-[10px] text-[#555]">cargando…</span>
        ) : error ? (
          <span className="text-[10px] text-[#ff3333]">error: {error}</span>
        ) : fechas.length < 2 ? (
          <span className="text-[10px] text-[#555]">sin datos</span>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <span className="text-[10px] text-[#ff9900] font-mono min-w-[36px]">
              {fmtFechaCorta(fechaDesde || "")}
            </span>
            <DualRange
              min={0}
              max={fechas.length - 1}
              lo={effectiveRango[0]}
              hi={effectiveRango[1]}
              setLo={(v) => setRangoIdx([v, Math.max(v, effectiveRango[1])])}
              setHi={(v) => setRangoIdx([Math.min(v, effectiveRango[0]), v])}
            />
            <span className="text-[10px] text-[#ff9900] font-mono min-w-[36px] text-right">
              {fmtFechaCorta(fechaHasta || "")}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        <div className="border border-[#1a1a1a] bg-[#080808] p-2 min-h-0">
          {chartData.length < 2 ? (
            <p className="text-[#555] text-xs py-4 text-center">Sin datos suficientes.</p>
          ) : (
            <ResponsiveContainer key={vpKey} width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 20, bottom: 28, left: 4 }}>
                <CartesianGrid stroke="#1a1a1a" vertical={false} />
                <XAxis
                  dataKey="fecha"
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  angle={-35}
                  textAnchor="end"
                  height={40}
                  tickFormatter={fmtFechaCorta}
                  interval={Math.max(0, Math.floor(chartData.length / 12))}
                />
                <YAxis
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                  width={55}
                />
                <ReferenceLine y={0} stroke="#555" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{
                    background: "#0e0e0e",
                    border: "1px solid #2a2a2a",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  labelStyle={{ color: "#ff9900" }}
                  labelFormatter={(v) => fmtFechaCorta(String(v))}
                  formatter={(v, name) => [`${Number(v).toFixed(2)}%`, String(name)]}
                />
                <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 10 }} />
                {tickers.map((tk, i) => (
                  <Line
                    key={tk}
                    type="monotone"
                    dataKey={tk}
                    stroke={PALETA[i % PALETA.length]}
                    strokeWidth={1.6}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="border border-[#1a1a1a] bg-[#080808] p-2 overflow-y-auto min-h-0">
          <div className="text-[10px] text-[#555] tracking-wide mb-1">
            {fechaDesde && fechaHasta ? `${fmtFechaCorta(fechaDesde)} → ${fmtFechaCorta(fechaHasta)}` : ""}
          </div>
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[#080808] z-10">
              <tr className="text-[#707070]">
                <th className="!px-1 text-left">TICKER</th>
                <th className="!px-1 text-right">BASE</th>
                <th className="!px-1 text-right">FINAL</th>
                <th className="!px-1 text-right">RETORNO</th>
              </tr>
            </thead>
            <tbody>
              {tabla.map((r, i) => (
                <tr key={r.ticker} className={i % 2 === 0 ? "bg-[#0a0a0a]" : ""}>
                  <td className="!px-1 text-[#ff9900]">{r.ticker}</td>
                  <td className="!px-1 text-right text-[#808080]">{r.base.toFixed(2)}</td>
                  <td className="!px-1 text-right text-[#d0d0d0]">{r.final.toFixed(2)}</td>
                  <td
                    className={`!px-1 text-right font-semibold ${
                      r.retorno >= 0 ? "text-[#00cc66]" : "text-[#ff3333]"
                    }`}
                  >
                    {r.retorno >= 0 ? "+" : ""}
                    {r.retorno.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterBtn({
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
          : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
