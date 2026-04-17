"use client";

import { useState } from "react";
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { shortTicker } from "./ui";

interface BreakevenPar {
  n: number;
  lecap: string;
  cer: string;
  fecha_vencimiento: string;
  dias: number;
  tem_lecap: number;
  paridad_cer: number;
  breakeven_mensual: number;
}

type Vista = "grafico" | "tabla";

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtMesAnio(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${MESES_CORTOS[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

export function BreakevensBlock({ pares }: { pares: BreakevenPar[] }) {
  const [vista, setVista] = useState<Vista>("grafico");

  if (pares.length === 0) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        SIN DATOS — MERCADO CERRADO
      </p>
    );
  }

  const data = pares
    .filter((p) => p.breakeven_mensual != null)
    .map((p) => {
      const d = new Date(p.fecha_vencimiento);
      return {
        vencTs: d.getTime(),
        vencLabel: fmtMesAnio(p.fecha_vencimiento),
        be: +(p.breakeven_mensual * 100).toFixed(2),
        ticker: shortTicker(p.lecap),
      };
    })
    .sort((a, b) => a.vencTs - b.vencTs);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <FilterBtn active={vista === "grafico"} onClick={() => setVista("grafico")}>
          GRAFICO
        </FilterBtn>
        <FilterBtn active={vista === "tabla"} onClick={() => setVista("tabla")}>
          TABLA
        </FilterBtn>
      </div>

      {vista === "grafico" ? (
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 30, left: 10 }}>
              <XAxis
                dataKey="vencTs"
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
                tick={{ fill: "#808080", fontSize: 10 }}
                axisLine={{ stroke: "#2a2a2a" }}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                height={40}
                tickFormatter={(ts: number) => fmtMesAnio(new Date(ts).toISOString())}
              />
              <YAxis
                domain={["dataMin - 0.2", "dataMax + 0.2"]}
                tick={{ fill: "#808080", fontSize: 10 }}
                axisLine={{ stroke: "#2a2a2a" }}
                tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <ReferenceLine y={3} stroke="#ff3333" strokeDasharray="6 3" strokeOpacity={0.5} />
              <Tooltip
                contentStyle={{
                  background: "#0e0e0e",
                  border: "1px solid #2a2a2a",
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                labelStyle={{ color: "#808080" }}
                formatter={(value, name) => {
                  if (name === "be") return [`${Number(value).toFixed(2)}%`, "BE Mensual"];
                  return [String(value), String(name)];
                }}
                labelFormatter={(ts) => fmtMesAnio(new Date(Number(ts)).toISOString())}
              />
              <Line
                dataKey="be"
                type="monotone"
                stroke="#ff9900"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              <Scatter dataKey="be" fill="#ff9900" isAnimationActive={false}>
                <LabelList
                  dataKey="ticker"
                  position="top"
                  fill="#aaaaaa"
                  style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                />
              </Scatter>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-[320px] overflow-y-auto">
          <table>
            <thead>
              <tr>
                <th>LECAP</th>
                <th>CER</th>
                <th className="text-right">DIAS</th>
                <th className="text-right">BE MENSUAL</th>
              </tr>
            </thead>
            <tbody>
              {pares.map((p) => {
                const be = p.breakeven_mensual * 100;
                return (
                  <tr key={p.n}>
                    <td className="text-[#ff9900]">{shortTicker(p.lecap)}</td>
                    <td className="text-[#808080]">{shortTicker(p.cer)}</td>
                    <td className="text-right">{p.dias}</td>
                    <td
                      className={`text-right font-bold ${
                        be > 3 ? "text-[#ff3333]" : "text-[#00cc66]"
                      }`}
                    >
                      {be.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
