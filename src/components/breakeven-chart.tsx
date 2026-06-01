"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface BreakevenPar {
  lecap: string;
  cer: string;
  fecha_vencimiento: string;
  dias: number;
  breakeven_mensual: number;
}

function shortTicker(full: string): string {
  const parts = full.split(" - ");
  return parts.length >= 3 ? parts[2] : full;
}

export function BreakevenChart({ pares }: { pares: BreakevenPar[] }) {
  const data = pares.map((p) => ({
    name: shortTicker(p.lecap),
    dias: p.dias,
    be: +(p.breakeven_mensual * 100).toFixed(2),
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 15, right: 20, bottom: 5, left: 10 }}>
        <XAxis
          dataKey="name"
          tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
          axisLine={{ stroke: "var(--t-border-2)" }}
          tickLine={false}
        />
        <YAxis
          domain={["dataMin - 0.2", "dataMax + 0.2"]}
          tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
          axisLine={{ stroke: "var(--t-border-2)" }}
          tickLine={false}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
        />
        <ReferenceLine y={3} stroke="var(--t-neg)" strokeDasharray="6 3" strokeOpacity={0.5} />
        <Tooltip
          contentStyle={{
            background: "var(--t-surface)",
            border: "1px solid var(--t-border-2)",
            fontSize: 11,
            fontFamily: "JetBrains Mono, monospace",
          }}
          labelStyle={{ color: "var(--t-text-dim)" }}
          formatter={(value) => [`${Number(value).toFixed(2)}%`, "BE Mensual"]}
        />
        <Line
          type="monotone"
          dataKey="be"
          stroke="#ff9900"
          strokeWidth={2}
          dot={{ fill: "#ff9900", r: 4, stroke: "#080808", strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
