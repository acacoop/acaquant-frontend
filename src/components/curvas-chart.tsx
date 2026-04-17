"use client";

import { useEffect, useMemo, useState } from "react";
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

interface HistRow {
  fecha: string;
  ticker: string;
  price: number | null;
  TEA: number | null;
  TEM: number | null;
  duration: number | null;
  paridad: number | null;
}

type Curva = "tasa_fija" | "cer";
type Metrica = "TEA" | "TEM";
type Modo = "live" | "hist";

function fmtFechaCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}

function niceScale(min: number, max: number, maxTicks = 6): { min: number; max: number; ticks: number[] } {
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) return { min: min - 1, max: max + 1, ticks: [min - 1, min, min + 1] };
  const range = max - min;
  const roughStep = range / Math.max(1, maxTicks - 1);
  const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / pow10;
  const niceStep = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  const step = niceStep * pow10;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step / 2; t += step) ticks.push(+t.toFixed(10));
  return { min: niceMin, max: niceMax, ticks };
}

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
  const [modo, setModo] = useState<Modo>("live");

  const [histByCurva, setHistByCurva] = useState<Record<string, HistRow[]>>({});
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);

  useEffect(() => {
    if (modo !== "hist") return;
    if (histByCurva[curva]) return;
    let cancelled = false;
    (async () => {
      try {
        setHistLoading(true);
        setHistError(null);
        const res = await fetch(
          `/api/historico-curva?curva=${encodeURIComponent(curva)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: HistRow[] = await res.json();
        if (cancelled) return;
        setHistByCurva((prev) => ({ ...prev, [curva]: j }));
      } catch (e) {
        if (!cancelled) {
          setHistError(e instanceof Error ? e.message : "error");
        }
      } finally {
        if (!cancelled) setHistLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modo, curva, histByCurva]);

  const fechasHist = useMemo(() => {
    const rows = histByCurva[curva] || [];
    return Array.from(new Set(rows.map((r) => r.fecha))).sort();
  }, [histByCurva, curva]);

  const [fechaIdx, setFechaIdx] = useState<number | null>(null);

  const effectiveIdx =
    fechasHist.length > 0
      ? fechaIdx == null
        ? fechasHist.length - 1
        : Math.min(Math.max(0, fechaIdx), fechasHist.length - 1)
      : 0;
  const fechaSel = fechasHist[effectiveIdx];

  const metricaUsada: Metrica = curva === "cer" ? "TEA" : metrica;

  const { puntos, fit, yMin, yMax, yTicks, xMin, xMax, xTicks } = useMemo(() => {
    const puntos: { Ticker: string; Duration: number; y: number }[] = [];

    if (modo === "live") {
      const fw = forwards.find((f) => f.curva === curva);
      const tasas = fw?.tasas || {};
      const vencMap: Record<string, string | undefined> = {};
      for (const f of flujos) {
        if (f.curva === curva) vencMap[f.ticker] = f.fecha_vencimiento;
      }
      const hoy = new Date();
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
    } else if (fechaSel) {
      const rows = (histByCurva[curva] || []).filter((r) => r.fecha === fechaSel);
      for (const r of rows) {
        if (r.duration == null || r.duration <= 0) continue;
        const tea = r.TEA;
        if (tea == null) continue;
        const teaPct = tea * 100;
        const temPct = r.TEM != null ? r.TEM * 100 : (Math.pow(1 + tea, 1 / 12) - 1) * 100;
        const y = metricaUsada === "TEM" ? temPct : teaPct;
        puntos.push({ Ticker: r.ticker, Duration: +r.duration.toFixed(4), y: +y.toFixed(4) });
      }
    }
    puntos.sort((a, b) => a.Duration - b.Duration);

    let fit: { Duration: number; y: number }[] | null = null;
    if (puntos.length >= 2) {
      const xs = puntos.map((p) => p.Duration);
      const ys = puntos.map((p) => p.y);
      const fitted = logFit(xs, ys);
      if (fitted) {
        const xA = xs[0];
        const xB = xs[xs.length - 1];
        const steps = 100;
        fit = [];
        for (let i = 0; i <= steps; i++) {
          const x = xA + ((xB - xA) * i) / steps;
          fit.push({ Duration: +x.toFixed(4), y: +(fitted.a * Math.log(x) + fitted.b).toFixed(4) });
        }
      }
    }

    const allY = [...puntos.map((p) => p.y), ...(fit?.map((p) => p.y) || [])];
    const allX = puntos.map((p) => p.Duration);
    const yScale = allY.length
      ? niceScale(Math.min(...allY), Math.max(...allY), 6)
      : { min: 0, max: 1, ticks: [0, 1] };
    const xScale = allX.length
      ? niceScale(Math.min(...allX), Math.max(...allX), 7)
      : { min: 0, max: 1, ticks: [0, 1] };

    return {
      puntos,
      fit,
      yMin: yScale.min,
      yMax: yScale.max,
      yTicks: yScale.ticks,
      xMin: xScale.min,
      xMax: xScale.max,
      xTicks: xScale.ticks,
    };
  }, [forwards, flujos, curva, metricaUsada, modo, histByCurva, fechaSel]);

  const merged = useMemo(() => {
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

  const hayHist = fechasHist.length > 0;

  return (
    <div className="h-full flex flex-col min-h-0">
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
          <div className="ml-1 flex items-center gap-1">
            <FilterBtn active={metrica === "TEA"} onClick={() => setMetrica("TEA")}>
              TEA
            </FilterBtn>
            <FilterBtn active={metrica === "TEM"} onClick={() => setMetrica("TEM")}>
              TEM
            </FilterBtn>
          </div>
        )}
        <span className="w-px h-3 bg-[#2a2a2a] mx-1" />
        <FilterBtn active={modo === "live"} onClick={() => setModo("live")}>
          LIVE
        </FilterBtn>
        <FilterBtn active={modo === "hist"} onClick={() => setModo("hist")}>
          HISTÓRICO
        </FilterBtn>
      </div>

      {modo === "hist" && (
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <span className="text-[10px] text-[#555555] tracking-wide">FECHA</span>
          {histLoading && !hayHist ? (
            <span className="text-[10px] text-[#555555]">cargando…</span>
          ) : histError ? (
            <span className="text-[10px] text-[#ff3333]">error: {histError}</span>
          ) : !hayHist ? (
            <span className="text-[10px] text-[#555555]">sin histórico</span>
          ) : (
            <>
              <input
                type="range"
                min={0}
                max={fechasHist.length - 1}
                value={effectiveIdx}
                onChange={(e) => setFechaIdx(Number(e.target.value))}
                className="flex-1 accent-[#ff9900]"
              />
              <span className="text-[10px] text-[#ff9900] font-mono min-w-[60px] text-right">
                {fechaSel ? fmtFechaCorta(fechaSel) : "--"}
              </span>
            </>
          )}
        </div>
      )}

      {puntos.length >= 2 ? (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={merged} margin={{ top: 20, right: 20, bottom: 10, left: 10 }}>
            <XAxis
              dataKey="Duration"
              type="number"
              domain={[xMin, xMax]}
              ticks={xTicks}
              tick={{ fill: "#808080", fontSize: 10 }}
              axisLine={{ stroke: "#2a2a2a" }}
              tickLine={false}
              tickFormatter={(v: number) => v.toFixed(1)}
              label={{ value: "Duration (años)", position: "insideBottom", offset: -4, fill: "#555555", fontSize: 10 }}
            />
            <YAxis
              domain={[yMin, yMax]}
              ticks={yTicks}
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
          {modo === "hist" && histLoading ? "Cargando…" : "SIN DATOS — MERCADO CERRADO"}
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
