"use client";

import { useEffect, useState } from "react";
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

const POLL_MS = 5_000;

interface FuturoDlrDoc {
  ticker: string;
  vencimiento: string;
  dias_a_vto: number;
  bid_price: number | null;
  offer_price: number | null;
  last_price: number | null;
  spot_referencia: number | null;
  fuente_spot: string | null;
}

interface Punto {
  ticker: string;
  ticker_short: string;   // "ABR26" en vez de "DLR/ABR26"
  dias: number;
  precio: number;
  selected: boolean;
}

function fmtPrice(v: number): string {
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface Props {
  /** Ticker que viene del watchlist. Sirve para highlightear un punto.
      Cualquier "DLR/*" (o "FUTUROS ROFEX") muestra la curva entera. */
  selectedTicker?: string | null;
}

export function FuturosDlrCurveChart({ selectedTicker }: Props) {
  const [docs, setDocs] = useState<FuturoDlrDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const res = await fetch("/api/futuros-dlr", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: FuturoDlrDoc[] = await res.json();
        if (cancelled) return;
        setDocs(Array.isArray(data) ? data : []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    fetchData();
    const iv = setInterval(fetchData, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, []);

  // Construyo los puntos. Precio = last; si falta, mid (bid+offer)/2.
  // Filtro outrights sin precio para que la línea no quede rota.
  const puntos: Punto[] = docs
    .map((d) => {
      let precio = d.last_price;
      if (!precio || precio <= 0) {
        if (d.bid_price && d.offer_price && d.bid_price > 0 && d.offer_price > 0) {
          precio = (d.bid_price + d.offer_price) / 2;
        }
      }
      if (!precio || precio <= 0) return null;
      return {
        ticker: d.ticker,
        ticker_short: d.ticker.replace(/^DLR\//, ""),
        dias: d.dias_a_vto,
        precio,
        selected: d.ticker === selectedTicker,
      };
    })
    .filter((p): p is Punto => p !== null)
    .sort((a, b) => a.dias - b.dias);

  // Spot del primer doc — todos comparten el mismo TC.
  const spot = docs[0]?.spot_referencia ?? null;
  const fuente = docs[0]?.fuente_spot ?? null;

  if (error && puntos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#ff3333] font-mono text-xs">
        Error: {error}
      </div>
    );
  }

  if (puntos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#888888] font-mono text-xs">
        Esperando datos de la curva DLR…
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#080808]">
      {/* Header con el TC vivo */}
      <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-baseline gap-3 font-mono text-[11px]">
        <span className="text-[#d0d0d0] font-semibold">CURVA DLR (FUTUROS ROFEX)</span>
        {spot !== null && (
          <span className="text-[#888888]">
            TC ref:{" "}
            <span className="text-[#d0d0d0] tabular-nums">{fmtPrice(spot)}</span>
            {fuente && <span className="text-[#555555]"> · {fuente}</span>}
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={puntos}
            margin={{ top: 24, right: 32, bottom: 32, left: 48 }}
          >
            <XAxis
              type="number"
              dataKey="dias"
              name="Días al vto"
              tick={{ fill: "#888888", fontSize: 10, fontFamily: "monospace" }}
              stroke="#1a1a1a"
              label={{
                value: "Días al vencimiento",
                position: "insideBottom",
                offset: -16,
                fill: "#666666",
                fontSize: 10,
                fontFamily: "monospace",
              }}
              domain={["dataMin - 10", "dataMax + 10"]}
              allowDecimals={false}
            />
            <YAxis
              type="number"
              dataKey="precio"
              name="Precio"
              tick={{ fill: "#888888", fontSize: 10, fontFamily: "monospace" }}
              stroke="#1a1a1a"
              tickFormatter={fmtPrice}
              label={{
                value: "Precio",
                angle: -90,
                position: "insideLeft",
                offset: 4,
                fill: "#666666",
                fontSize: 10,
                fontFamily: "monospace",
              }}
              domain={["dataMin - 5", "dataMax + 5"]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0e0e0e",
                border: "1px solid #1a1a1a",
                fontFamily: "monospace",
                fontSize: 11,
              }}
              labelStyle={{ color: "#d0d0d0" }}
              cursor={{ stroke: "#333333", strokeDasharray: "3 3" }}
              formatter={(_value, _name, ctx) => {
                const p = (ctx as { payload?: Punto })?.payload;
                if (!p) return ["", ""];
                return [
                  `${fmtPrice(p.precio)}  ·  ${p.dias} días`,
                  p.ticker_short,
                ];
              }}
              labelFormatter={() => ""}
            />
            {/* Línea conectando todos los puntos en orden de días. */}
            <Line
              type="monotone"
              dataKey="precio"
              stroke="#ff9900"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              legendType="none"
            />
            {/* Puntos por outright. El seleccionado va más grande. */}
            <Scatter
              data={puntos}
              dataKey="precio"
              fill="#ffcc00"
              isAnimationActive={false}
              shape={(props: { cx?: number; cy?: number; payload?: Punto }) => {
                const { cx, cy, payload } = props;
                if (cx === undefined || cy === undefined || !payload) return <g />;
                const r = payload.selected ? 6 : 3.5;
                const fill = payload.selected ? "#00cc66" : "#ffcc00";
                return <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#080808" strokeWidth={1} />;
              }}
            >
              <LabelList
                dataKey="ticker_short"
                position="top"
                fill="#888888"
                fontSize={9}
                fontFamily="monospace"
                offset={8}
              />
            </Scatter>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
