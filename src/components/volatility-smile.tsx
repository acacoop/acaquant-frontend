"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
  Legend,
} from "recharts";
import type { OpcionDoc } from "@/lib/estrategias";

interface Row {
  strike: number;
  CALL?: number;
  PUT?: number;
}

export function VolatilitySmile({ data }: { data: OpcionDoc[] }) {
  const { rows, spot } = useMemo(() => {
    const byStrike = new Map<number, Row>();
    let spot: number | undefined;
    for (const d of data) {
      if (d.spot && !spot) spot = d.spot;
      const k = d.strike;
      const iv = d.iv;
      if (!k || !iv || iv <= 0) continue;
      if (!byStrike.has(k)) byStrike.set(k, { strike: k });
      const row = byStrike.get(k)!;
      if (d.tipo === "CALL") row.CALL = iv * 100;
      else if (d.tipo === "PUT") row.PUT = iv * 100;
    }
    const rows = Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
    return { rows, spot };
  }, [data]);

  if (rows.length === 0) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        Sin datos de IV. ¿Motor de opciones corriendo?
      </p>
    );
  }

  const fmtStrike = (v: number) =>
    v.toLocaleString("es-AR", { maximumFractionDigits: 0 });

  return (
    <div className="h-full min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          margin={{ top: 8, right: 12, bottom: 24, left: 4 }}
        >
          <CartesianGrid stroke="#1a1a1a" vertical={false} />
          <XAxis
            dataKey="strike"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "#808080", fontSize: 10 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={false}
            tickFormatter={fmtStrike}
          />
          <YAxis
            tick={{ fill: "#808080", fontSize: 10 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={false}
            tickFormatter={(v) => `${v.toFixed(0)}%`}
            width={40}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "#0e0e0e",
              border: "1px solid #2a2a2a",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
            }}
            labelStyle={{ color: "#ff9900" }}
            labelFormatter={(v) => `Strike ${fmtStrike(Number(v))}`}
            formatter={(value, name) => [
              `${Number(value).toFixed(1)}%`,
              String(name),
            ]}
          />
          <Legend
            verticalAlign="top"
            height={18}
            wrapperStyle={{ fontSize: 10, color: "#808080" }}
          />
          {spot && (
            <ReferenceLine
              x={spot}
              stroke="#ffcc00"
              strokeDasharray="4 4"
              label={{
                value: `SPOT ${fmtStrike(spot)}`,
                fill: "#ffcc00",
                fontSize: 9,
                position: "top",
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="CALL"
            name="CALL IV%"
            stroke="#4a9eff"
            strokeWidth={1.5}
            dot={{ r: 2, fill: "#4a9eff" }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="PUT"
            name="PUT IV%"
            stroke="#ff4444"
            strokeWidth={1.5}
            dot={{ r: 2, fill: "#ff4444" }}
            connectNulls
            isAnimationActive={false}
          />
          <Scatter dataKey="CALL" fill="#4a9eff" />
          <Scatter dataKey="PUT" fill="#ff4444" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
