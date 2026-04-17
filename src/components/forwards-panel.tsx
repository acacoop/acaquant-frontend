"use client";

import { useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  CartesianGrid,
} from "recharts";
import { ForwardMatrix } from "./forward-matrix";
import { fmtTs, shortTicker } from "./ui";
import { useViewportKey } from "@/lib/use-viewport-key";

interface ForwardDoc {
  curva: string;
  tickers?: string[];
  matrix?: Record<string, Record<string, number>>;
  updated_at?: string;
}

interface ForwardHistDoc {
  curva: string;
  fecha: string;
  matrix: Record<string, Record<string, number>>;
}

type Curva = "tasa_fija" | "cer";
type Modo = "live" | "grafico";

const PALETA = [
  "#ff9900",
  "#4a9eff",
  "#00cc66",
  "#ff3333",
  "#bb66ff",
  "#00cccc",
  "#ffee44",
  "#ff66aa",
];

function fmtFechaCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ForwardsPanel({
  forwards,
  historico,
}: {
  forwards: ForwardDoc[];
  historico?: ForwardHistDoc[];
}) {
  const [curva, setCurva] = useState<Curva>("tasa_fija");
  const [modo, setModo] = useState<Modo>("live");
  const vpKey = useViewportKey();

  const fw = forwards.find((f) => f.curva === curva);
  const hasData = !!fw?.matrix && !!fw?.tickers && fw.tickers.length >= 2;

  const histCurva = useMemo(
    () => (historico ?? []).filter((d) => d.curva === curva).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [historico, curva]
  );

  const paresDisp = useMemo(() => {
    if (!histCurva.length) return [] as string[];
    const ultima = histCurva[histCurva.length - 1];
    const pares: string[] = [];
    for (const [tLargo, inner] of Object.entries(ultima.matrix || {})) {
      for (const [tCorto, val] of Object.entries(inner || {})) {
        if (val !== null && val !== undefined) {
          pares.push(`${tLargo}→${tCorto}`);
        }
      }
    }
    return pares.sort();
  }, [histCurva]);

  const [paresSel, setParesSel] = useState<string[]>([]);

  const paresEfectivos = useMemo(() => {
    if (paresSel.length) return paresSel;
    return paresDisp.slice(0, 2);
  }, [paresSel, paresDisp]);

  const chartData = useMemo(() => {
    if (!histCurva.length || !paresEfectivos.length) return [] as Array<Record<string, string | number>>;
    return histCurva.map((doc) => {
      const row: Record<string, string | number> = { fecha: doc.fecha };
      for (const par of paresEfectivos) {
        const [tLargo, tCorto] = par.split("→");
        const v = doc.matrix?.[tLargo]?.[tCorto];
        if (v !== null && v !== undefined) {
          row[par] = +(v * 100).toFixed(3);
        }
      }
      return row;
    });
  }, [histCurva, paresEfectivos]);

  const togglePar = (par: string) => {
    setParesSel((prev) => {
      if (prev.length === 0) {
        const base = paresDisp.slice(0, 2);
        const next = base.includes(par) ? base.filter((p) => p !== par) : [...base, par];
        return next;
      }
      return prev.includes(par) ? prev.filter((p) => p !== par) : [...prev, par];
    });
  };

  const hayHistorico = histCurva.length > 0 && paresDisp.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <FilterBtn
          active={curva === "tasa_fija"}
          onClick={() => setCurva("tasa_fija")}
        >
          TASA FIJA
        </FilterBtn>
        <FilterBtn active={curva === "cer"} onClick={() => setCurva("cer")}>
          CER
        </FilterBtn>
        <span className="w-px h-3 bg-[#2a2a2a] mx-1" />
        <FilterBtn active={modo === "live"} onClick={() => setModo("live")}>
          LIVE
        </FilterBtn>
        <FilterBtn
          active={modo === "grafico"}
          onClick={() => hayHistorico && setModo("grafico")}
          disabled={!hayHistorico}
        >
          GRÁFICO
        </FilterBtn>
        {fw?.updated_at && modo === "live" && (
          <span className="ml-auto text-[10px] text-[#555555]">
            {fmtTs(fw.updated_at)}
          </span>
        )}
        {modo === "grafico" && histCurva.length > 0 && (
          <span className="ml-auto text-[10px] text-[#555555]">
            {histCurva.length} días
          </span>
        )}
      </div>

      {modo === "live" ? (
        <div className="h-[380px] overflow-auto">
          {hasData ? (
            <ForwardMatrix tickers={fw!.tickers!} matrix={fw!.matrix!} />
          ) : (
            <p className="text-[#555555] text-xs py-4 text-center">
              SIN DATOS — MERCADO CERRADO
            </p>
          )}
        </div>
      ) : (
        <div className="h-[380px] flex flex-col gap-2 min-h-0">
          <div className="flex flex-wrap gap-1 shrink-0 max-h-[80px] overflow-y-auto border border-[#1a1a1a] p-1">
            {paresDisp.map((par) => {
              const activo = paresEfectivos.includes(par);
              const [tLargo, tCorto] = par.split("→");
              const color = PALETA[paresEfectivos.indexOf(par) % PALETA.length];
              return (
                <button
                  key={par}
                  onClick={() => togglePar(par)}
                  className={`text-[10px] px-1.5 py-0.5 border font-mono transition-colors ${
                    activo
                      ? "text-black border-transparent"
                      : "bg-transparent text-[#707070] border-[#2a2a2a] hover:border-[#ff9900] hover:text-[#ff9900]"
                  }`}
                  style={activo ? { backgroundColor: color, borderColor: color } : undefined}
                  title={par}
                >
                  {shortTicker(tLargo)}→{shortTicker(tCorto)}
                </button>
              );
            })}
          </div>
          <div className="flex-1 min-h-0">
            {paresEfectivos.length === 0 || chartData.length === 0 ? (
              <p className="text-[#555555] text-xs py-4 text-center">
                Seleccioná al menos un par.
              </p>
            ) : (
              <ResponsiveContainer key={vpKey} width="100%" height="100%" minHeight={180}>
                <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 24, left: 4 }}>
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
                    interval={Math.max(0, Math.floor(chartData.length / 10))}
                  />
                  <YAxis
                    tick={{ fill: "#808080", fontSize: 10 }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                    width={55}
                    domain={[
                      (dataMin: number) => dataMin - 0.5,
                      (dataMax: number) => dataMax + 0.5,
                    ]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0e0e0e",
                      border: "1px solid #2a2a2a",
                      fontSize: 11,
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                    labelStyle={{ color: "#ff9900" }}
                    labelFormatter={(v) => fmtFechaCorta(String(v))}
                    formatter={(v, name) => {
                      const [tLargo, tCorto] = String(name).split("→");
                      return [
                        `${Number(v).toFixed(3)}%`,
                        `${shortTicker(tLargo)}→${shortTicker(tCorto)}`,
                      ];
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={20}
                    wrapperStyle={{ fontSize: 10 }}
                    formatter={(value) => {
                      const [tLargo, tCorto] = String(value).split("→");
                      return `${shortTicker(tLargo)}→${shortTicker(tCorto)}`;
                    }}
                  />
                  {paresEfectivos.map((par, i) => (
                    <Line
                      key={par}
                      type="monotone"
                      dataKey={par}
                      stroke={PALETA[i % PALETA.length]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
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
