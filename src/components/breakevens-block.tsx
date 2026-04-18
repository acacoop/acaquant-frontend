"use client";

import { useMemo, useState } from "react";
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
import { useViewportKey } from "@/lib/use-viewport-key";

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

interface BreakevenHistDoc {
  fecha: string;
  pares: BreakevenPar[];
}

type Modo = "live" | "hist";

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtMesAnio(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${MESES_CORTOS[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

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

export function BreakevensBlock({
  pares,
  historico,
}: {
  pares: BreakevenPar[];
  historico?: BreakevenHistDoc[];
}) {
  const [modo, setModo] = useState<Modo>("live");

  const fechasOrdenadas = useMemo(
    () =>
      (historico ?? [])
        .map((d) => d.fecha)
        .filter(Boolean)
        .sort(),
    [historico]
  );

  const [fechaIdx, setFechaIdx] = useState<number | null>(null);

  const effectiveIdx =
    fechasOrdenadas.length > 0
      ? fechaIdx == null
        ? fechasOrdenadas.length - 1
        : Math.min(Math.max(0, fechaIdx), fechasOrdenadas.length - 1)
      : 0;
  const fechaSel = fechasOrdenadas[effectiveIdx];
  const paresMostrar =
    modo === "live"
      ? pares
      : (historico ?? []).find((d) => d.fecha === fechaSel)?.pares ?? [];

  const hayHistorico = fechasOrdenadas.length > 0;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2 shrink-0 flex-wrap">
        <FilterBtn active={modo === "live"} onClick={() => setModo("live")}>
          LIVE
        </FilterBtn>
        <FilterBtn
          active={modo === "hist"}
          onClick={() => hayHistorico && setModo("hist")}
          disabled={!hayHistorico}
        >
          HISTÓRICO
        </FilterBtn>
      </div>

      {modo === "hist" && hayHistorico && (
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <span className="text-[10px] text-[#555555] tracking-wide">FECHA</span>
          <input
            type="range"
            min={0}
            max={fechasOrdenadas.length - 1}
            value={effectiveIdx}
            onChange={(e) => setFechaIdx(Number(e.target.value))}
            className="flex-1 range-slider"
          />
          <span className="text-[10px] text-[#ff9900] font-mono min-w-[60px] text-right">
            {fechaSel ? fmtFechaCorta(fechaSel) : "--"}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-[auto_1fr] gap-3 min-w-0">
        <BreakevensTabla pares={paresMostrar} />
        <BreakevensGrafico pares={paresMostrar} />
      </div>
    </div>
  );
}

function BreakevensTabla({ pares }: { pares: BreakevenPar[] }) {
  if (pares.length === 0) return null;
  return (
    <div className="overflow-y-auto shrink-0">
      <table>
        <thead>
          <tr>
            <th>LECAP</th>
            <th>CER</th>
            <th className="text-right">DÍAS</th>
            <th className="text-right">BE MEN.</th>
          </tr>
        </thead>
        <tbody>
          {pares.map((p) => {
            const be = p.breakeven_mensual * 100;
            return (
              <tr key={p.n}>
                <td className="text-[#ff9900]">{shortTicker(p.lecap)}</td>
                <td className="text-[#808080]">{shortTicker(p.cer)}</td>
                <td className="text-right text-[#808080]">{p.dias}</td>
                <td className={`text-right font-bold ${be > 3 ? "text-[#ff3333]" : "text-[#00cc66]"}`}>
                  {be.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BreakevensGrafico({ pares }: { pares: BreakevenPar[] }) {
  const vpKey = useViewportKey();

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
        be: +(p.breakeven_mensual * 100).toFixed(2),
        ticker: shortTicker(p.lecap),
      };
    })
    .sort((a, b) => a.vencTs - b.vencTs);

  const xTicks = data.map((d) => d.vencTs);
  const beVals = data.map((d) => d.be);
  const yScale = beVals.length
    ? niceScale(Math.min(...beVals, 3), Math.max(...beVals, 3), 6)
    : { min: 0, max: 5, ticks: [0, 1, 2, 3, 4, 5] };

  return (
    <div className="h-full min-h-0 min-w-0">
      <ResponsiveContainer key={vpKey} width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 30, left: 10 }}>
          <XAxis
            dataKey="vencTs"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={xTicks}
            scale="time"
            tick={{ fill: "#808080", fontSize: 10 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={false}
            angle={-45}
            textAnchor="end"
            height={40}
            interval={0}
            tickFormatter={(ts: number) => fmtMesAnio(new Date(ts).toISOString())}
          />
          <YAxis
            domain={[yScale.min, yScale.max]}
            ticks={yScale.ticks}
            tick={{ fill: "#808080", fontSize: 10 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={false}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          />
          <ReferenceLine y={3} stroke="#ff3333" strokeDasharray="6 3" strokeOpacity={0.5} />
          <Tooltip
            contentStyle={{ background: "#0e0e0e", border: "1px solid #2a2a2a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
            labelStyle={{ color: "#808080" }}
            formatter={(value, name) => {
              if (name === "be") return [`${Number(value).toFixed(2)}%`, "BE Mensual"];
              return [String(value), String(name)];
            }}
            labelFormatter={(ts) => fmtMesAnio(new Date(Number(ts)).toISOString())}
          />
          <Line dataKey="be" type="monotone" stroke="#ff9900" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Scatter dataKey="be" fill="#ff9900" isAnimationActive={false}>
            <LabelList dataKey="ticker" position="top" fill="#aaaaaa" style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} />
          </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        disabled
          ? "bg-transparent text-[#333333] border-[#1a1a1a] cursor-not-allowed"
          : active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
