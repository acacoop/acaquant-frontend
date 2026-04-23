"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useViewportKey } from "@/lib/use-viewport-key";

interface TablaRow {
  ticker: string;
  base: number;
  final: number;
  fecha_base: string;
  ret_ars: number;
  var_dolar: number;
  carry_usd: number;
}

interface CarryResp {
  curva: string;
  dolar: string;
  fecha_base: string | null;
  fecha_final: string | null;
  serie: Array<Record<string, number | string>>;
  tabla: TablaRow[];
  error?: string;
}

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

const POLL_MS = 300_000; // 5 min

function fmtFechaCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function CarryTradeTab() {
  const [curva, setCurva] = useState<"tasa_fija" | "cer">("tasa_fija");
  const [dolar, setDolar] = useState<"mep" | "ccl">("mep");
  const [data, setData] = useState<CarryResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vpKey = useViewportKey();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/analitica/carry-trade?curva=${encodeURIComponent(curva)}&dolar=${dolar}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: CarryResp = await res.json();
        if (cancelled) return;
        if (j.error) throw new Error(j.error);
        setData(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [curva, dolar]);

  const serie = data?.serie || [];
  const tabla = data?.tabla || [];
  const tickers = useMemo(() => tabla.map((r) => r.ticker), [tabla]);

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
      <div className="border border-[#1a1a1a] bg-[#080808] p-3 flex items-center gap-3 shrink-0 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[#555]">Curva</span>
          <div className="flex items-center gap-1 h-[26px]">
            <FilterBtn active={curva === "tasa_fija"} onClick={() => setCurva("tasa_fija")}>
              TASA FIJA
            </FilterBtn>
            <FilterBtn active={curva === "cer"} onClick={() => setCurva("cer")}>
              CER
            </FilterBtn>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[#555]">Dólar</span>
          <div className="flex items-center gap-1 h-[26px]">
            <FilterBtn active={dolar === "mep"} onClick={() => setDolar("mep")}>
              MEP
            </FilterBtn>
            <FilterBtn active={dolar === "ccl"} onClick={() => setDolar("ccl")}>
              CCL
            </FilterBtn>
          </div>
        </div>
        <div className="ml-auto text-[10px] text-[#555] font-mono">
          {loading
            ? "actualizando…"
            : data?.fecha_base && data?.fecha_final
              ? `${fmtFechaCorta(data.fecha_base)} → ${fmtFechaCorta(data.fecha_final)}`
              : ""}
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-[11px] text-[#ff3333] bg-[#ff3333]/10 border border-[#ff3333]/30 font-mono shrink-0">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
        <div className="border border-[#1a1a1a] bg-[#080808] p-2 min-h-0">
          {serie.length < 2 ? (
            <p className="text-[#555] text-xs py-4 text-center">
              {loading ? "Cargando…" : "Sin datos suficientes."}
            </p>
          ) : (
            <ResponsiveContainer key={vpKey} width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 12, right: 20, bottom: 28, left: 4 }}>
                <CartesianGrid stroke="#1a1a1a" vertical={false} />
                <XAxis
                  dataKey="fecha"
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  angle={-35}
                  textAnchor="end"
                  height={40}
                  tickFormatter={(v) => fmtFechaCorta(String(v))}
                  interval={Math.max(0, Math.floor(serie.length / 12))}
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
                  formatter={(v, name) => {
                    if (name === "dolar") return [`${Number(v).toFixed(2)}`, dolar.toUpperCase()];
                    return [`${Number(v).toFixed(2)}%`, String(name)];
                  }}
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
            Carry vs {dolar.toUpperCase()} desde primer dato
          </div>
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[#080808] z-10">
              <tr className="text-[#707070]">
                <th className="!px-1 text-left">TICKER</th>
                <th className="!px-1 text-right">RET ARS</th>
                <th className="!px-1 text-right">VAR USD</th>
                <th className="!px-1 text-right">CARRY USD</th>
              </tr>
            </thead>
            <tbody>
              {tabla.map((r, i) => (
                <tr key={r.ticker} className={i % 2 === 0 ? "bg-[#0a0a0a]" : ""}>
                  <td className="!px-1 text-[#ff9900]">{r.ticker}</td>
                  <td className="!px-1 text-right text-[#d0d0d0]">
                    {r.ret_ars >= 0 ? "+" : ""}
                    {r.ret_ars.toFixed(1)}%
                  </td>
                  <td className="!px-1 text-right text-[#888]">
                    {r.var_dolar >= 0 ? "+" : ""}
                    {r.var_dolar.toFixed(1)}%
                  </td>
                  <td
                    className={`!px-1 text-right font-semibold ${
                      r.carry_usd >= 0 ? "text-[#00cc66]" : "text-[#ff3333]"
                    }`}
                  >
                    {r.carry_usd >= 0 ? "+" : ""}
                    {r.carry_usd.toFixed(2)}%
                  </td>
                </tr>
              ))}
              {tabla.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="text-center text-[#555] py-6">
                    Sin tickers con base válida.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-3 shrink-0 text-[10px] font-mono">
        <div className="text-[9px] uppercase tracking-widest text-[#ff9900] mb-1">
          Cálculo
        </div>
        <div className="text-[#d0d0d0]">
          Carry USD = (1 + Ret<sub>ARS</sub>) / (1 + Var<sub>{dolar.toUpperCase()}</sub>) − 1
        </div>
        <div className="text-[#888] mt-1 leading-relaxed">
          Cuánto rindió el bono en pesos descontando lo que se devaluó el peso
          contra USD ({dolar.toUpperCase()}) en el mismo período. Carry positivo
          = el bono le ganó a la devaluación. Cada ticker se normaliza al
          primer día con precio + dólar disponibles (la base puede diferir
          entre bonos nuevos y viejos).
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
      className={`px-2 h-[26px] text-[10px] font-semibold tracking-wide border ${
        active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
