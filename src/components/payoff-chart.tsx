"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  payoffCurve,
  findBreakevens,
  type ResolvedLeg,
} from "@/lib/estrategias";
import { useViewportKey } from "@/lib/use-viewport-key";

export function PayoffChart({
  legs,
  spot,
  costo,
}: {
  legs: ResolvedLeg[];
  spot: number;
  costo: number;
}) {
  const vpKey = useViewportKey();
  const { curve, breakevens } = useMemo(() => {
    const curve = payoffCurve(legs, spot, costo, 200);
    return { curve, breakevens: findBreakevens(curve) };
  }, [legs, spot, costo]);

  if (!curve.length) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        Sin datos para el payoff.
      </p>
    );
  }

  const data = curve.map((p) => ({
    x: p.x,
    plPos: p.pl >= 0 ? p.pl : 0,
    plNeg: p.pl < 0 ? p.pl : 0,
    pl: p.pl,
  }));

  const fmtX = (v: number) =>
    v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  const fmtY = (v: number) =>
    v.toLocaleString("es-AR", { maximumFractionDigits: 0 });

  return (
    <div className="h-full min-h-0 flex flex-col">
      <ResponsiveContainer key={vpKey} width="100%" height="100%" minHeight={240}>
        <ComposedChart
          data={data}
          margin={{ top: 4, right: 12, bottom: 20, left: 4 }}
        >
          <CartesianGrid stroke="#1a1a1a" vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={["dataMin", "dataMax"]}
            tick={{ fill: "#808080", fontSize: 9 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={false}
            tickFormatter={fmtX}
          />
          <YAxis
            tick={{ fill: "#808080", fontSize: 9 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={false}
            tickFormatter={fmtY}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: "#0e0e0e",
              border: "1px solid #2a2a2a",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
            }}
            labelFormatter={(v) => `GGAL $${fmtX(Number(v))}`}
            formatter={(value) => [`$${fmtY(Number(value))}`, "P&L"]}
          />
          <ReferenceLine y={0} stroke="#555" strokeDasharray="4 4" />
          <ReferenceLine
            x={spot}
            stroke="#ffcc00"
            strokeDasharray="4 4"
            label={{
              value: `SPOT`,
              fill: "#ffcc00",
              fontSize: 9,
              position: "insideTopRight",
            }}
          />
          {breakevens.map((be) => (
            <ReferenceLine
              key={be}
              x={be}
              stroke="#ffffff"
              strokeDasharray="6 3"
              label={{
                value: `BE $${be.toLocaleString("es-AR")}`,
                fill: "#ffffff",
                fontSize: 9,
                position: "top",
              }}
            />
          ))}
          <Area
            type="monotone"
            dataKey="plPos"
            stroke="none"
            fill="#00cc66"
            fillOpacity={0.55}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="plNeg"
            stroke="none"
            fill="#ff4444"
            fillOpacity={0.55}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="pl"
            stroke="#ffffff"
            strokeWidth={1.2}
            fill="none"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
