"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useViewportKey } from "@/lib/use-viewport-key";

interface SeriePunto {
  fecha: string;
  precio_c: number;
  precio_d: number;
  canje: number;
}

interface CanjeResp {
  par: string;
  ticker_c: string;
  ticker_d: string;
  serie: SeriePunto[];
  meta: {
    fechas_solo_c: number;
    fechas_solo_d: number;
    primer_dia: string | null;
    ultimo_dia: string | null;
  };
  error?: string;
}

export const PARES = ["AL30"] as const;
export type Par = (typeof PARES)[number];

const POLL_MS = 300_000; // 5 min

function fmtFechaCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}

function fmtPct(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return `${(v * 100).toFixed(d)}%`;
}

// Canje compacto para la home. CONTROLADO: el par lo maneja el padre
// (RetornoCanjeBox) en el header unificado compartido con el toggle
// Retorno/Carry/Canje → sin caja ni header propios. Acá solo va una tira fina de
// métricas + el gráfico.
export function CanjeTab({ par }: { par: Par }) {
  const [data, setData] = useState<CanjeResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vpKey = useViewportKey();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/analitica/canje?par=${encodeURIComponent(par)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: CanjeResp = await res.json();
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
    return () => { cancelled = true; clearInterval(id); };
  }, [par]);

  const serie = data?.serie || [];
  const chartData = useMemo(
    () => serie.map((p) => ({ fecha: p.fecha, canjePct: +(p.canje * 100).toFixed(3) })),
    [serie],
  );

  const kpis = useMemo(() => {
    if (!serie.length) return null;
    const ult = serie[serie.length - 1];
    const primero = serie[0];
    const valores = serie.map((p) => p.canje);
    return {
      actual: ult.canje,
      delta: ult.canje - primero.canje,
      min: Math.min(...valores),
      max: Math.max(...valores),
      precio_c: ult.precio_c,
      precio_d: ult.precio_d,
    };
  }, [serie]);

  return (
    <div className="h-full min-h-0 min-w-0 flex flex-col">
      {/* Tira fina de métricas (sin header propio — el par lo controla el padre) */}
      {kpis && (
        <div className="px-3 py-1 shrink-0 flex items-center gap-3 flex-wrap text-[10px] font-mono border-b border-[var(--t-border)]">
          <span><span className="text-[var(--t-text-muted)]">Canje </span><span className="text-[var(--t-accent)] font-semibold">{fmtPct(kpis.actual)}</span></span>
          <span><span className="text-[var(--t-text-muted)]">Δ </span><span className={kpis.delta >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}>{`${kpis.delta >= 0 ? "+" : ""}${(kpis.delta * 100).toFixed(2)} pp`}</span></span>
          <span className="text-[var(--t-text-dim)]"><span className="text-[var(--t-text-muted)]">mín/máx </span>{fmtPct(kpis.min)} / {fmtPct(kpis.max)}</span>
          <span className="text-[var(--t-text-dim)] ml-auto">{par} C/D {kpis.precio_c.toFixed(2)} / {kpis.precio_d.toFixed(2)}</span>
        </div>
      )}

      {error && (
        <div className="px-3 py-1.5 text-[10px] text-[var(--t-neg)] font-mono shrink-0">{error}</div>
      )}

      {/* Gráfico (ocupa todo el resto) */}
      <div className="flex-1 min-h-0 min-w-0 p-2">
        {chartData.length < 2 ? (
          <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
            {loading ? "Cargando…" : "Sin datos suficientes."}
          </p>
        ) : (
          <ResponsiveContainer key={vpKey} width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 20, left: 4 }}>
              <CartesianGrid stroke="var(--t-border)" vertical={false} />
              <XAxis
                dataKey="fecha"
                tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                axisLine={{ stroke: "var(--t-border-2)" }}
                tickLine={false}
                angle={-35}
                textAnchor="end"
                height={34}
                tickFormatter={fmtFechaCorta}
                interval={Math.max(0, Math.floor(chartData.length / 10))}
              />
              <YAxis
                tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                axisLine={{ stroke: "var(--t-border-2)" }}
                tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                width={50}
                tickCount={8}
              />
              <ReferenceLine y={0} stroke="var(--t-text-dim)" strokeDasharray="4 4" />
              <Tooltip
                contentStyle={{
                  background: "var(--t-surface)",
                  border: "1px solid var(--t-border-2)",
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                labelStyle={{ color: "var(--t-accent)" }}
                labelFormatter={(v) => fmtFechaCorta(String(v))}
                formatter={(v) => [`${Number(v).toFixed(2)}%`, "Canje"]}
              />
              <Line type="monotone" dataKey="canjePct" stroke="var(--t-accent)" strokeWidth={1.6} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
