"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  ReferenceLine,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { FairValueHistorico } from "@/lib/types";

interface Props {
  ticker: string;
  tickerCorto: string;
  onClose: () => void;
}

function fmtFechaCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function FairValueModal({ ticker, tickerCorto, onClose }: Props) {
  const [data, setData] = useState<FairValueHistorico | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(
          `/api/cotizaciones/fair-value/historico?ticker=${encodeURIComponent(ticker)}&dias=60`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as FairValueHistorico;
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // Esc cierra el modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stats = useMemo(() => {
    if (!data?.serie?.length) return null;
    const last = data.serie[data.serie.length - 1];
    const ventana = data.serie.slice(-30).map((r) => r.residuo_bps);
    if (ventana.length < 2) return { last, media: 0, desvio: 0 };
    const media = ventana.reduce((a, b) => a + b, 0) / ventana.length;
    const variance =
      ventana.reduce((acc, v) => acc + (v - media) ** 2, 0) / (ventana.length - 1);
    const desvio = Math.sqrt(variance);
    return { last, media, desvio };
  }, [data]);

  const chartData = useMemo(() => {
    if (!data?.serie) return [];
    return data.serie.map((r) => ({ fecha: r.fecha, residuo: +r.residuo_bps.toFixed(1) }));
  }, [data]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0a0a0a] border border-[var(--t-border-2)] w-full max-w-3xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--t-border-2)]">
          <div className="flex items-baseline gap-3">
            <span className="text-[#ff9900] font-semibold tracking-wide">{tickerCorto}</span>
            <span className="text-[10px] text-[var(--t-text-muted)]">RESIDUO 60 DÍAS</span>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--t-text-dim)] hover:text-[#ff9900] text-sm px-2"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 p-3">
          {loading ? (
            <p className="text-[var(--t-text-muted)] text-xs text-center py-8">cargando…</p>
          ) : error ? (
            <p className="text-[#c0271a] text-xs text-center py-8">error: {error}</p>
          ) : !chartData.length ? (
            <p className="text-[var(--t-text-muted)] text-xs text-center py-8">SIN HISTÓRICO</p>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                  <XAxis
                    dataKey="fecha"
                    tick={{ fill: "#808080", fontSize: 10 }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    angle={-35}
                    textAnchor="end"
                    height={40}
                    tickFormatter={fmtFechaCorta}
                    interval={Math.max(0, Math.floor(chartData.length / 10))}
                  />
                  <YAxis
                    tick={{ fill: "#808080", fontSize: 10 }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v.toFixed(0)}bps`}
                    width={55}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0e0e0e",
                      border: "1px solid #2a2a2a",
                      fontSize: 11,
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                    labelFormatter={(v) => fmtFechaCorta(String(v))}
                    formatter={(v) => [`${Number(v).toFixed(1)} bps`, "Residuo"]}
                  />
                  {stats && (
                    <>
                      <ReferenceLine y={stats.media} stroke="#888888" strokeDasharray="3 3" />
                      <ReferenceLine y={stats.media + stats.desvio} stroke="#3fbf6f" strokeDasharray="2 2" />
                      <ReferenceLine y={stats.media - stats.desvio} stroke="#3fbf6f" strokeDasharray="2 2" />
                      <ReferenceLine y={stats.media + 2 * stats.desvio} stroke="#1f8a3e" strokeDasharray="1 4" />
                      <ReferenceLine y={stats.media - 2 * stats.desvio} stroke="#1f8a3e" strokeDasharray="1 4" />
                    </>
                  )}
                  <Line
                    type="monotone"
                    dataKey="residuo"
                    stroke="#4488ff"
                    strokeWidth={1.5}
                    dot={{ r: 1.5 }}
                    isAnimationActive={false}
                  />
                  {chartData.length > 0 && (
                    <Scatter
                      data={[chartData[chartData.length - 1]]}
                      dataKey="residuo"
                      fill="#ff9900"
                      isAnimationActive={false}
                      shape="circle"
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {stats && (
            <div className="mt-2 text-[10px] text-[var(--t-text-dim)] flex gap-4 flex-wrap">
              <span>Hoy <span className="text-[#ff9900]">{stats.last.residuo_bps.toFixed(1)}bps</span></span>
              <span>Media 30d {stats.media.toFixed(1)}bps</span>
              <span>σ 30d {stats.desvio.toFixed(1)}bps</span>
              {stats.last.z_temporal !== null && stats.last.z_temporal !== undefined && (
                <span>z {stats.last.z_temporal >= 0 ? "+" : ""}{stats.last.z_temporal.toFixed(2)}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
