"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";

interface ForwardDoc {
  curva: string;
  tasas?: Record<string, number>;
  updated_at?: string;
}

interface FlujoTicker {
  ticker: string;
  curva: string;
  fecha_vencimiento?: string;
}

type Curva = "tasa_fija" | "cer";
type Metrica = "TEA" | "TEM";

function logFit(xs: number[], ys: number[]): { a: number; b: number } | null {
  if (xs.length < 2) return null;
  const logs = xs.map(Math.log);
  const n = xs.length;
  const sumLogX = logs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumLogXY = logs.reduce((acc, lx, i) => acc + lx * ys[i], 0);
  const sumLogX2 = logs.reduce((acc, lx) => acc + lx * lx, 0);
  const denom = n * sumLogX2 - sumLogX * sumLogX;
  if (Math.abs(denom) < 1e-12) return null;
  const a = (n * sumLogXY - sumLogX * sumY) / denom;
  const b = (sumY - a * sumLogX) / n;
  return { a, b };
}

export function CurvasChart({
  forwards,
  flujos,
}: {
  forwards: ForwardDoc[];
  flujos: FlujoTicker[];
}) {
  const [curva, setCurva] = useState<Curva>("tasa_fija");
  const [metrica, setMetrica] = useState<Metrica>("TEA");

  const metricaUsada: Metrica = curva === "cer" ? "TEA" : metrica;

  const { puntos, fit, yMin, yMax } = useMemo(() => {
    const fw = forwards.find((f) => f.curva === curva);
    const tasas = fw?.tasas || {};
    const vencMap: Record<string, string | undefined> = {};
    for (const f of flujos) {
      if (f.curva === curva) vencMap[f.ticker] = f.fecha_vencimiento;
    }

    const hoy = new Date();
    const puntos: { Ticker: string; Duration: number; y: number }[] = [];
    for (const [tk, tea] of Object.entries(tasas)) {
      const venc = vencMap[tk];
      if (!venc) continue;
      const dVenc = new Date(venc);
      if (isNaN(dVenc.getTime())) continue;
      const dur = (dVenc.getTime() - hoy.getTime()) / (365.25 * 86400_000);
      if (dur <= 0) continue;
      const teaPct = tea * 100;
      const temPct = (Math.pow(1 + tea, 1 / 12) - 1) * 100;
      const y = metricaUsada === "TEM" ? temPct : teaPct;
      puntos.push({ Ticker: tk, Duration: +dur.toFixed(4), y: +y.toFixed(4) });
    }
    puntos.sort((a, b) => a.Duration - b.Duration);

    let fit: { Duration: number; y: number }[] | null = null;
    if (puntos.length >= 2) {
      const xs = puntos.map((p) => p.Duration);
      const ys = puntos.map((p) => p.y);
      const fitted = logFit(xs, ys);
      if (fitted) {
        const xMin = xs[0];
        const xMax = xs[xs.length - 1];
        const steps = 100;
        fit = [];
        for (let i = 0; i <= steps; i++) {
          const x = xMin + ((xMax - xMin) * i) / steps;
          fit.push({ Duration: +x.toFixed(4), y: +(fitted.a * Math.log(x) + fitted.b).toFixed(4) });
        }
      }
    }

    const allY = [...puntos.map((p) => p.y), ...(fit?.map((p) => p.y) || [])];
    const rango = allY.length ? Math.max(...allY) - Math.min(...allY) : 0;
    const pad = rango > 0 ? rango * 0.1 : 1.0;
    const yMin = allY.length ? Math.min(...allY) - pad : 0;
    const yMax = allY.length ? Math.max(...allY) + pad : 1;

    return { puntos, fit, yMin, yMax };
  }, [forwards, flujos, curva, metricaUsada]);

  const merged = useMemo(() => {
    // Recharts ComposedChart necesita una sola data array
    const map = new Map<number, { Duration: number; scatterY?: number; fitY?: number; Ticker?: string }>();
    for (const p of puntos) {
      map.set(p.Duration, { Duration: p.Duration, scatterY: p.y, Ticker: p.Ticker });
    }
    if (fit) {
      for (const p of fit) {
        const ex = map.get(p.Duration);
        if (ex) ex.fitY = p.y;
        else map.set(p.Duration, { Duration: p.Duration, fitY: p.y });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.Duration - b.Duration);
  }, [puntos, fit]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-2 flex-wrap shrink-0">
        <FilterBtn
          active={curva === "tasa_fija"}
          onClick={() => setCurva("tasa_fija")}
        >
          TASA FIJA
        </FilterBtn>
        <FilterBtn active={curva === "cer"} onClick={() => setCurva("cer")}>
          CER
        </FilterBtn>
        {curva === "tasa_fija" && (
          <div className="ml-2 flex items-center gap-1">
            <FilterBtn active={metrica === "TEA"} onClick={() => setMetrica("TEA")}>
              TEA
            </FilterBtn>
            <FilterBtn active={metrica === "TEM"} onClick={() => setMetrica("TEM")}>
              TEM
            </FilterBtn>
          </div>
        )}
      </div>

      {puntos.length >= 2 ? (
        <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={merged} margin={{ top: 20, right: 20, bottom: 10, left: 10 }}>
            <XAxis
              dataKey="Duration"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "#808080", fontSize: 10 }}
              axisLine={{ stroke: "#2a2a2a" }}
              tickLine={false}
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{ value: "Duration (años)", position: "insideBottom", offset: -4, fill: "#555555", fontSize: 10 }}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: "#808080", fontSize: 10 }}
              axisLine={{ stroke: "#2a2a2a" }}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toFixed(curva === "cer" ? 1 : 2)}%`}
            />
            <Tooltip
              contentStyle={{
                background: "#0e0e0e",
                border: "1px solid #2a2a2a",
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
              }}
              labelStyle={{ color: "#808080" }}
              formatter={(value, name) => {
                const v = Number(value);
                if (name === "scatterY") return [`${v.toFixed(2)}%`, metricaUsada];
                if (name === "fitY") return [`${v.toFixed(2)}%`, "Fit log"];
                return [String(value), String(name)];
              }}
              labelFormatter={(v) => `Duration ${Number(v).toFixed(2)} años`}
            />
            {fit && (
              <Line
                dataKey="fitY"
                type="monotone"
                stroke="#4488ff"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            )}
            <Scatter dataKey="scatterY" fill="#00cc66" isAnimationActive={false}>
              <LabelList
                dataKey="Ticker"
                position="top"
                fill="#aaaaaa"
                style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
              />
            </Scatter>
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-[#555555] text-xs py-4 text-center">
          SIN DATOS — MERCADO CERRADO
        </p>
      )}
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
