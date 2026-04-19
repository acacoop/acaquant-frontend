"use client";

import { useEffect, useMemo, useState } from "react";
import { useViewportKey } from "@/lib/use-viewport-key";
import { DualRange } from "./dual-range";
import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  Cell,
} from "recharts";

const MESES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

const COLOR_AUM = "#4a9eff";
const COLOR_POS = "#ff9900";
const COLOR_NEG = "#ff3333";

interface Serie {
  contraparte: string;
  moneda: string;
  unidades: string[];
  aum: { mes: string; total: number }[];
  flujo: { mes: string; bruto: number }[];
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function mesLabel(key: string): string {
  const [y, m] = key.split("-");
  const i = parseInt(m) - 1;
  if (isNaN(i) || i < 0 || i > 11) return key;
  return `${MESES[i]} ${y.slice(-2)}`;
}

export function FlujoVsAumView() {
  const [fondos, setFondos] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [serie, setSerie] = useState<Serie | null>(null);
  const [loadingFondos, setLoadingFondos] = useState(true);
  const [loadingSerie, setLoadingSerie] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangoState, setRangoState] = useState<{ sel: string; idx: [number, number] } | null>(null);
  const vpKey = useViewportKey();

  // 1) Lista de fondos
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingFondos(true);
        const res = await fetch("/api/flujo-vs-aum");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (cancelled) return;
        const list = Array.isArray(j.fondos) ? j.fondos : [];
        setFondos(list);
        if (list.length && !sel) setSel(list[0]);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoadingFondos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Serie del fondo seleccionado
  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingSerie(true);
        const qs = new URLSearchParams({ contraparte: sel }).toString();
        const res = await fetch(`/api/flujo-vs-aum?${qs}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (cancelled) return;
        setSerie(j as Serie);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoadingSerie(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sel]);

  // 3) Dataset combinado por mes (forward-fill de AuM)
  const chartData = useMemo(() => {
    if (!serie) return [] as { mes: string; label: string; flujo: number; aum: number | null }[];
    const meses = new Set<string>();
    const aumMap = new Map<string, number>();
    const flujoMap = new Map<string, number>();
    for (const d of serie.aum) {
      meses.add(d.mes);
      aumMap.set(d.mes, d.total);
    }
    for (const d of serie.flujo) {
      meses.add(d.mes);
      flujoMap.set(d.mes, d.bruto);
    }
    const sorted = Array.from(meses).sort();
    let lastAum: number | null = null;
    return sorted.map((m) => {
      if (aumMap.has(m)) lastAum = aumMap.get(m)!;
      return {
        mes: m,
        label: mesLabel(m),
        flujo: flujoMap.get(m) ?? 0,
        aum: lastAum,
      };
    });
  }, [serie]);

  const rangoIdx = rangoState?.sel === sel ? rangoState.idx : null;

  const efectivoRango: [number, number] =
    chartData.length > 0
      ? rangoIdx == null
        ? [0, chartData.length - 1]
        : [
            Math.min(Math.max(0, rangoIdx[0]), chartData.length - 1),
            Math.min(Math.max(rangoIdx[0], rangoIdx[1]), chartData.length - 1),
          ]
      : [0, 0];

  const chartDataFiltered = chartData.slice(
    efectivoRango[0],
    efectivoRango[1] + 1
  );

  if (loadingFondos) {
    return (
      <div className="h-full flex items-center justify-center text-[#555555] text-sm">
        Cargando fondos…
      </div>
    );
  }
  if (error && fondos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#ff3333] text-sm">
        Error: {error}
      </div>
    );
  }
  if (fondos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#555555] text-sm">
        No hay fondos con FCI asociados.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
      <div className="border border-[#1a1a1a] bg-[#080808] p-3 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] tracking-wide text-[#555555] uppercase">
            Fondo
          </span>
          <select
            value={sel ?? ""}
            onChange={(e) => setSel(e.target.value)}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none min-w-[240px]"
          >
            {fondos.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          {serie && (
            <span className="ml-auto text-[10px] text-[#888888]">
              {serie.unidades.length} FCI asociados · moneda {serie.moneda}
            </span>
          )}
        </div>
      </div>

      {chartData.length >= 2 && (
        <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-1.5 shrink-0 flex items-center gap-2">
          <span className="text-[10px] text-[#ff9900] font-mono min-w-[40px]">
            {chartData[efectivoRango[0]]?.label}
          </span>
          <DualRange
            min={0}
            max={chartData.length - 1}
            lo={efectivoRango[0]}
            hi={efectivoRango[1]}
            setLo={(v) => sel && setRangoState({ sel, idx: [v, Math.max(v, efectivoRango[1])] })}
            setHi={(v) => sel && setRangoState({ sel, idx: [Math.min(v, efectivoRango[0]), v] })}
          />
          <span className="text-[10px] text-[#ff9900] font-mono min-w-[40px] text-right">
            {chartData[efectivoRango[1]]?.label}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 border border-[#1a1a1a] bg-[#080808] p-2 overflow-hidden flex flex-col">
        {loadingSerie ? (
          <div className="flex-1 flex items-center justify-center text-[#555555] text-sm">
            Cargando…
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-[#555555] text-sm">
            Sin datos para este fondo.
          </div>
        ) : (
          <div className="flex-1 min-h-0">
            <ResponsiveContainer key={vpKey} width="100%" height="100%">
              <ComposedChart
                data={chartDataFiltered}
                margin={{ top: 12, right: 12, left: 0, bottom: 28 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  interval={Math.max(0, Math.floor(chartData.length / 12))}
                  angle={-35}
                  textAnchor="end"
                  height={40}
                />
                <YAxis
                  yAxisId="flujo"
                  orientation="left"
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtCompact(v)}
                  width={55}
                  domain={[
                    (dataMin: number) => Math.min(dataMin, 0),
                    (dataMax: number) => Math.max(dataMax, 0) * 1.05 || 1,
                  ]}
                />
                <YAxis
                  yAxisId="aum"
                  orientation="right"
                  tick={{ fill: COLOR_AUM, fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtCompact(v)}
                  width={60}
                  domain={[0, (dataMax: number) => dataMax * 1.05 || 1]}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0e0e0e",
                    border: "1px solid #2a2a2a",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  labelStyle={{ color: "#ff9900" }}
                  formatter={(v, name) => [fmtCompact(Number(v)), name]}
                />
                <Legend
                  verticalAlign="top"
                  height={20}
                  wrapperStyle={{ fontSize: 10, color: "#808080" }}
                />
                <Bar
                  yAxisId="flujo"
                  dataKey="flujo"
                  name="Flujo"
                  fill={COLOR_POS}
                  isAnimationActive={false}
                >
                  {chartDataFiltered.map((d, i) => (
                    <Cell
                      key={i}
                      fill={(d.flujo ?? 0) >= 0 ? COLOR_POS : COLOR_NEG}
                    />
                  ))}
                </Bar>
                <Line
                  yAxisId="aum"
                  type="monotone"
                  dataKey="aum"
                  name="AuM"
                  stroke={COLOR_AUM}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
