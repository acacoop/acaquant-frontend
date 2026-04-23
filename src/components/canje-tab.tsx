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

const PARES = ["AL30", "GD30"] as const;
type Par = (typeof PARES)[number];

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

export function CanjeTab() {
  const [par, setPar] = useState<Par>("AL30");
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
        const res = await fetch(`/api/analitica/canje?par=${encodeURIComponent(par)}`, {
          cache: "no-store",
        });
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
    return () => {
      cancelled = true;
      clearInterval(id);
    };
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
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
    return {
      actual:    ult.canje,
      delta:     ult.canje - primero.canje,
      min,
      max,
      promedio,
      precio_c:  ult.precio_c,
      precio_d:  ult.precio_d,
    };
  }, [serie]);

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
      {/* Controles */}
      <div className="border border-[#1a1a1a] bg-[#080808] p-3 flex items-center gap-3 shrink-0">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[#555]">Par</span>
          <div className="flex items-center gap-1 h-[26px]">
            {PARES.map((p) => (
              <button
                key={p}
                onClick={() => setPar(p)}
                className={`px-2 h-[26px] text-[10px] font-semibold tracking-wide border ${
                  par === p
                    ? "bg-[#ff9900] text-black border-[#ff9900]"
                    : "bg-transparent text-[#555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto text-[10px] text-[#555] font-mono">
          {loading
            ? "actualizando…"
            : data
              ? `${chartData.length} días${data.meta.fechas_solo_c + data.meta.fechas_solo_d > 0 ? ` (${data.meta.fechas_solo_c + data.meta.fechas_solo_d} sin par)` : ""}`
              : ""}
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-[11px] text-[#ff3333] bg-[#ff3333]/10 border border-[#ff3333]/30 font-mono shrink-0">
          {error}
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
          <Kpi label="Canje actual" value={fmtPct(kpis.actual)} highlight />
          <Kpi
            label="Δ período"
            value={`${kpis.delta >= 0 ? "+" : ""}${(kpis.delta * 100).toFixed(2)} pp`}
            tone={kpis.delta >= 0 ? "up" : "down"}
          />
          <Kpi label="Mín / Máx" value={`${fmtPct(kpis.min)} / ${fmtPct(kpis.max)}`} />
          <Kpi
            label={`${data?.par} C / D último`}
            value={`${kpis.precio_c.toFixed(2)} / ${kpis.precio_d.toFixed(2)}`}
          />
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0 border border-[#1a1a1a] bg-[#080808] p-2">
        {chartData.length < 2 ? (
          <p className="text-[#555] text-xs py-4 text-center">
            {loading ? "Cargando…" : "Sin datos suficientes."}
          </p>
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
                formatter={(v) => [`${Number(v).toFixed(2)}%`, "Canje"]}
              />
              <Line
                type="monotone"
                dataKey="canjePct"
                stroke="#ff9900"
                strokeWidth={1.6}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Leyenda */}
      <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-3 shrink-0 text-[10px] font-mono">
        <div className="text-[9px] uppercase tracking-widest text-[#ff9900] mb-1">
          Cálculo
        </div>
        <div className="text-[#d0d0d0]">
          Canje = Precio<sub>C</sub> / Precio<sub>D</sub> − 1
        </div>
        <div className="text-[#888] mt-1 leading-relaxed">
          Spread implícito de cable: cuánto más caro está el bono en CCL (USD
          afuera) que en MEP (USD acá). Un canje en alza señala fuga de USD
          hacia el exterior; comprime cuando hay confianza local.
          <br />
          <span className="text-[#555]">Solo se grafican días con ambos precios disponibles.</span>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  highlight = false,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "up" | "down";
}) {
  const color =
    tone === "up"
      ? "text-[#00cc66]"
      : tone === "down"
        ? "text-[#ff3333]"
        : highlight
          ? "text-[#ff9900]"
          : "text-[#d0d0d0]";
  return (
    <div className="border border-[#1a1a1a] bg-[#080808] p-2">
      <div className="text-[9px] uppercase tracking-widest text-[#555] mb-1">{label}</div>
      <div className={`text-[14px] font-mono font-semibold ${color}`}>{value}</div>
    </div>
  );
}
