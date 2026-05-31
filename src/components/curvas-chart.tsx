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
import { useViewportKey } from "@/lib/use-viewport-key";
import { FairValueView } from "./fair-value-view";
import type { FairValueDoc } from "@/lib/types";

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
  tipo?: string | null;
  price: number | null;
  TEA: number | null;
  TEM: number | null;
  duration: number | null;
  paridad: number | null;
}

interface CurvaSnapshotRow {
  ticker_corto: string | null;
  tipo?: string | null;
  tea: number | null;
  tem: number | null;
  duration: number | null;
}

interface Punto {
  Ticker: string;
  Duration: number;
  y: number;
}

type Curva = "tasa_fija" | "cer" | "soberanos" | "dolar_linked";
type Metrica = "TEA" | "TEM" | "TNA";
type Modo = "live" | "hist" | "fair";

// Para soberanos, dividimos los puntos en familias (globales / bonares).
// Para las otras curvas, todo cae en "default" y se renderiza igual que antes.
const COLORES: Record<string, { scatter: string; fit: string; label: string }> = {
  globales: { scatter: "#00cc66", fit: "#4488ff", label: "GLOBALES" },
  bonares:  { scatter: "#ff9900", fit: "#ffaa66", label: "BONARES" },
  default:  { scatter: "#00cc66", fit: "#4488ff", label: "" },
};

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
  fairValueInicial,
}: {
  forwards: ForwardDoc[];
  flujos: FlujoTicker[];
  fairValueInicial?: Record<string, FairValueDoc>;
}) {
  const [curva, setCurva] = useState<Curva>("tasa_fija");
  const [metrica, setMetrica] = useState<Metrica>("TEA");
  const [modo, setModo] = useState<Modo>("live");
  const vpKey = useViewportKey();

  const [histByCurva, setHistByCurva] = useState<Record<string, HistRow[]>>({});
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);

  // Snapshot LIVE de duration real (Macaulay) — necesario para soberanos
  // amortizables, donde TTM ≠ duration.
  const [snapshotByCurva, setSnapshotByCurva] = useState<Record<string, CurvaSnapshotRow[]>>({});

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

  useEffect(() => {
    if (modo !== "live" || curva !== "soberanos") return;
    if (snapshotByCurva[curva]) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/analitica/listar-curva?curva=${encodeURIComponent(curva)}`
        );
        if (!res.ok) return;
        const j: CurvaSnapshotRow[] = await res.json();
        if (cancelled) return;
        setSnapshotByCurva((prev) => ({ ...prev, [curva]: j }));
      } catch {
        // si falla, el chart muestra "SIN DATOS" — no rompe la UI
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modo, curva, snapshotByCurva]);

  // Sort defensivo ASC (más viejo → más reciente). El default de .sort() para
  // strings ISO ya da ASC, pero hacemos el compare explícito para evitar
  // sorpresas si alguna fecha viene con otro formato.
  const fechasHist = useMemo(() => {
    const rows = histByCurva[curva] || [];
    return Array.from(new Set(rows.map((r) => r.fecha))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [histByCurva, curva]);

  const [fechaIdx, setFechaIdx] = useState<number | null>(null);

  // Modo efectivo: si el usuario tiene "fair" seleccionado pero cambió a una
  // curva sin soporte (soberanos / dolar_linked), renderizamos como "live"
  // sin tocar el state. Cuando vuelva a tasa_fija/cer reaparece el modo fair.
  const modoEfectivo: Modo =
    modo === "fair" && curva !== "tasa_fija" && curva !== "cer" ? "live" : modo;

  // Reset del slider cuando cambia curva o modo, para que el default
  // (último = más reciente) se aplique sin arrastrar el valor anterior.
  useEffect(() => {
    setFechaIdx(null);
  }, [curva, modo]);

  const effectiveIdx =
    fechasHist.length > 0
      ? fechaIdx == null
        ? fechasHist.length - 1
        : Math.min(Math.max(0, fechaIdx), fechasHist.length - 1)
      : 0;
  const fechaSel = fechasHist[effectiveIdx];

  // CER y soberanos siempre se grafican en TEA (TEM mensualizado no tiene
  // sentido en USD ni para CER real).
  const metricaUsada: Metrica =
    curva === "cer" || curva === "soberanos" ? "TEA" : metrica;

  const { puntosPorTipo, fitPorTipo, yMin, yMax, yTicks, xMin, xMax, xTicks, tipos } = useMemo(() => {
    const puntosPorTipo: Record<string, Punto[]> = {};
    const pushPunto = (tipo: string | null | undefined, p: Punto) => {
      const t = (tipo || "default").toLowerCase();
      (puntosPorTipo[t] ??= []).push(p);
    };

    if (modo === "live") {
      // Soberanos: usamos snapshot con duration Macaulay real + tipo.
      const usaSnapshot = curva === "soberanos";
      const snap = usaSnapshot ? snapshotByCurva[curva] : undefined;

      if (usaSnapshot && snap) {
        for (const r of snap) {
          const tk = r.ticker_corto;
          const dur = r.duration;
          const tea = r.tea;
          if (!tk || dur == null || dur <= 0 || tea == null) continue;
          const teaPct = tea * 100;
          const temPct = r.tem != null ? r.tem * 100 : (Math.pow(1 + tea, 1 / 12) - 1) * 100;
          // TNA (capitalización mensual nominal) = TEM × 12.
          const tnaPct = temPct * 12;
          const y =
            metricaUsada === "TEM" ? temPct
            : metricaUsada === "TNA" ? tnaPct
            : teaPct;
          pushPunto(r.tipo, {
            Ticker: tk,
            Duration: +dur.toFixed(4),
            y: +y.toFixed(4),
          });
        }
      } else {
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
          const tnaPct = temPct * 12;
          const y =
            metricaUsada === "TEM" ? temPct
            : metricaUsada === "TNA" ? tnaPct
            : teaPct;
          pushPunto(null, {
            Ticker: tk,
            Duration: +dur.toFixed(4),
            y: +y.toFixed(4),
          });
        }
      }
    } else if (fechaSel) {
      const rows = (histByCurva[curva] || []).filter((r) => r.fecha === fechaSel);
      for (const r of rows) {
        if (r.duration == null || r.duration <= 0) continue;
        const tea = r.TEA;
        if (tea == null) continue;
        const teaPct = tea * 100;
        const temPct = r.TEM != null ? r.TEM * 100 : (Math.pow(1 + tea, 1 / 12) - 1) * 100;
        const tnaPct = temPct * 12;
        const y =
          metricaUsada === "TEM" ? temPct
          : metricaUsada === "TNA" ? tnaPct
          : teaPct;
        pushPunto(r.tipo, {
          Ticker: r.ticker,
          Duration: +r.duration.toFixed(4),
          y: +y.toFixed(4),
        });
      }
    }

    // Sort por duration y calcular fit log para cada tipo.
    const fitPorTipo: Record<string, { Duration: number; y: number }[] | null> = {};
    const allY: number[] = [];
    const allX: number[] = [];

    for (const t of Object.keys(puntosPorTipo)) {
      puntosPorTipo[t].sort((a, b) => a.Duration - b.Duration);
      const xs = puntosPorTipo[t].map((p) => p.Duration);
      const ys = puntosPorTipo[t].map((p) => p.y);
      allX.push(...xs);
      allY.push(...ys);

      let fitArr: { Duration: number; y: number }[] | null = null;
      if (xs.length >= 2) {
        const fitted = logFit(xs, ys);
        if (fitted) {
          const xA = xs[0];
          const xB = xs[xs.length - 1];
          const steps = 100;
          fitArr = [];
          for (let i = 0; i <= steps; i++) {
            const x = xA + ((xB - xA) * i) / steps;
            fitArr.push({
              Duration: +x.toFixed(4),
              y: +(fitted.a * Math.log(x) + fitted.b).toFixed(4),
            });
          }
          allY.push(...fitArr.map((p) => p.y));
        }
      }
      fitPorTipo[t] = fitArr;
    }

    const yScale = allY.length
      ? niceScale(Math.min(...allY), Math.max(...allY), 6)
      : { min: 0, max: 1, ticks: [0, 1] };
    const xScale = allX.length
      ? niceScale(Math.min(...allX), Math.max(...allX), 7)
      : { min: 0, max: 1, ticks: [0, 1] };

    const tipos = Object.keys(puntosPorTipo).sort();

    return {
      puntosPorTipo,
      fitPorTipo,
      tipos,
      yMin: yScale.min,
      yMax: yScale.max,
      yTicks: yScale.ticks,
      xMin: xScale.min,
      xMax: xScale.max,
      xTicks: xScale.ticks,
    };
  }, [forwards, flujos, curva, metricaUsada, modo, histByCurva, fechaSel, snapshotByCurva]);

  // Construir el dataset combinado: cada punto tiene un campo dinámico
  // por tipo (scatterY_<tipo> y fitY_<tipo>) para que recharts pueda
  // renderizar series independientes con sus propios colores.
  const merged = useMemo(() => {
    const map = new Map<number, Record<string, number | string>>();
    const ensure = (dur: number) => {
      let row = map.get(dur);
      if (!row) {
        row = { Duration: dur };
        map.set(dur, row);
      }
      return row;
    };
    for (const tipo of tipos) {
      for (const p of puntosPorTipo[tipo] || []) {
        const row = ensure(p.Duration);
        row[`scatterY_${tipo}`] = p.y;
        row[`Ticker_${tipo}`] = p.Ticker;
      }
      const fit = fitPorTipo[tipo];
      if (fit) {
        for (const p of fit) {
          const row = ensure(p.Duration);
          row[`fitY_${tipo}`] = p.y;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.Duration as number) - (b.Duration as number),
    );
  }, [puntosPorTipo, fitPorTipo, tipos]);

  const totalPuntos = tipos.reduce(
    (n, t) => n + (puntosPorTipo[t]?.length || 0),
    0,
  );
  const hayHist = fechasHist.length > 0;
  const mostrarLegend = curva === "soberanos" && tipos.length > 1;

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
        <FilterBtn active={curva === "soberanos"} onClick={() => setCurva("soberanos")}>
          HARD DOLAR
        </FilterBtn>
        <FilterBtn active={curva === "dolar_linked"} onClick={() => setCurva("dolar_linked")}>
          DOLAR LINKED
        </FilterBtn>
        {curva === "tasa_fija" && (
          <div className="ml-1 flex items-center gap-1">
            <FilterBtn active={metrica === "TEA"} onClick={() => setMetrica("TEA")}>
              TEA
            </FilterBtn>
            <FilterBtn active={metrica === "TEM"} onClick={() => setMetrica("TEM")}>
              TEM
            </FilterBtn>
            <FilterBtn active={metrica === "TNA"} onClick={() => setMetrica("TNA")}>
              TNA
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
        {(curva === "tasa_fija" || curva === "cer") && (
          <FilterBtn active={modo === "fair"} onClick={() => setModo("fair")}>
            FAIR VALUE
          </FilterBtn>
        )}

        {mostrarLegend && (
          <div className="ml-auto flex items-center gap-3 text-[10px]">
            {tipos.map((t) => {
              const c = COLORES[t] || COLORES.default;
              return (
                <div key={t} className="flex items-center gap-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: c.scatter }}
                  />
                  <span className="text-[var(--t-text-dim)] tracking-wide">
                    {c.label || t.toUpperCase()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modo === "hist" && (
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <span className="text-[10px] text-[var(--t-text-muted)] tracking-wide">FECHA</span>
          {histLoading && !hayHist ? (
            <span className="text-[10px] text-[var(--t-text-muted)]">cargando…</span>
          ) : histError ? (
            <span className="text-[10px] text-[#ff3333]">error: {histError}</span>
          ) : !hayHist ? (
            <span className="text-[10px] text-[var(--t-text-muted)]">sin histórico</span>
          ) : (
            <>
              <input
                type="range"
                min={0}
                max={fechasHist.length - 1}
                value={effectiveIdx}
                onChange={(e) => setFechaIdx(Number(e.target.value))}
                className="flex-1 range-slider"
              />
              <span className="text-[10px] text-[var(--t-accent)] font-mono min-w-[60px] text-right">
                {fechaSel ? fmtFechaCorta(fechaSel) : "--"}
              </span>
            </>
          )}
        </div>
      )}

      {modoEfectivo === "fair" && (curva === "tasa_fija" || curva === "cer") ? (
        <div className="flex-1 min-h-0">
          <FairValueView key={curva} curva={curva} initialDoc={fairValueInicial?.[curva]} />
        </div>
      ) : totalPuntos >= 2 ? (
        <div className="flex-1 min-h-0">
          <ResponsiveContainer key={vpKey} width="100%" height="100%">
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
                  const key = String(name);
                  if (key.startsWith("scatterY_")) {
                    const tipo = key.slice("scatterY_".length);
                    const label = COLORES[tipo]?.label || metricaUsada;
                    return [`${v.toFixed(2)}%`, label || metricaUsada];
                  }
                  if (key.startsWith("fitY_")) return [`${v.toFixed(2)}%`, "Fit log"];
                  return [String(value), key];
                }}
                labelFormatter={(v) => `Duration ${Number(v).toFixed(2)} años`}
              />
              {tipos.map((t) => {
                const c = COLORES[t] || COLORES.default;
                if (!fitPorTipo[t]) return null;
                return (
                  <Line
                    key={`fit-${t}`}
                    dataKey={`fitY_${t}`}
                    type="monotone"
                    stroke={c.fit}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}
              {tipos.map((t) => {
                const c = COLORES[t] || COLORES.default;
                return (
                  <Scatter
                    key={`pts-${t}`}
                    dataKey={`scatterY_${t}`}
                    fill={c.scatter}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey={`Ticker_${t}`}
                      position="top"
                      fill="#aaaaaa"
                      style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                    />
                  </Scatter>
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
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
          ? "bg-[var(--t-accent)] text-black border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
