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
import type { Leg } from "@/lib/estrategias";
import { useViewportKey } from "@/lib/use-viewport-key";

type Punto = {
  ts: string;      // ISO
  costo: number;
  atm: number;
  spot: number;
  strikes: string;
};

export function CostoHistoricoChart({
  legs,
  bucketMin = 15,
  costoLive,
}: {
  legs: Leg[];
  bucketMin?: number;
  costoLive?: number;
}) {
  const vpKey = useViewportKey();
  const [data, setData] = useState<Punto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Firma estable de los legs para disparar el refetch al cambiar estrategia.
  const legsKey = useMemo(
    () =>
      JSON.stringify(
        legs.map((l) => ({
          offset: l.offset,
          tipo: l.tipo,
          side: l.side,
          qty: l.qty,
        })),
      ),
    [legs],
  );

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);

    fetch("/api/analitica/estrategia-historico", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ legs, bucket_min: bucketMin }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as Punto[];
      })
      .then((rows) => {
        if (cancelled) return;
        setData(rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e.message || e));
        setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // legs se serializa en legsKey; bucketMin dispara refetch al cambiar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legsKey, bucketMin]);

  const serie = useMemo(
    () =>
      data.map((p) => ({
        t: new Date(p.ts).getTime(),
        costo: p.costo,
        atm: p.atm,
        spot: p.spot,
        strikes: p.strikes,
      })),
    [data],
  );

  const stats = useMemo(() => {
    if (!serie.length) return null;
    const costos = serie.map((p) => p.costo);
    const min = Math.min(...costos);
    const max = Math.max(...costos);
    const ultimo = costos[costos.length - 1];
    const primero = costos[0];
    const delta = ultimo - primero;
    return { min, max, ultimo, primero, delta };
  }, [serie]);

  if (loading) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        Cargando costo histórico…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-[#ff6666] text-xs py-4 text-center">
        Error: {error}
      </p>
    );
  }
  if (!serie.length) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        Sin histórico disponible para esta estrategia en el OPEX en curso.
      </p>
    );
  }

  const fmtCosto = (v: number) =>
    v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  const fmtFecha = (t: number) => {
    const d = new Date(t);
    return `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1,
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      {stats && (
        <div className="flex items-center gap-3 px-2 pb-1 text-[9px] text-[#808080] shrink-0">
          <span>
            MIN{" "}
            <span className="text-[#d0d0d0] font-semibold">
              ${fmtCosto(stats.min)}
            </span>
          </span>
          <span>
            MAX{" "}
            <span className="text-[#d0d0d0] font-semibold">
              ${fmtCosto(stats.max)}
            </span>
          </span>
          <span>
            ÚLT{" "}
            <span className="text-[#ff9900] font-semibold">
              ${fmtCosto(stats.ultimo)}
            </span>
          </span>
          <span
            className={
              stats.delta >= 0
                ? "text-[#00cc66]"
                : "text-[#ff4444]"
            }
          >
            Δ {stats.delta >= 0 ? "+" : ""}
            {fmtCosto(stats.delta)}
          </span>
          <span className="ml-auto text-[#555]">{serie.length} puntos</span>
        </div>
      )}
      <div className="flex-1 min-h-0">
        <ResponsiveContainer key={vpKey} width="100%" height="100%">
          <LineChart
            data={serie}
            margin={{ top: 4, right: 12, bottom: 20, left: 4 }}
          >
            <CartesianGrid stroke="#1a1a1a" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tick={{ fill: "#808080", fontSize: 9 }}
              axisLine={{ stroke: "#2a2a2a" }}
              tickLine={false}
              tickFormatter={fmtFecha}
              scale="time"
            />
            <YAxis
              tick={{ fill: "#808080", fontSize: 9 }}
              axisLine={{ stroke: "#2a2a2a" }}
              tickLine={false}
              tickFormatter={fmtCosto}
              width={60}
            />
            <Tooltip
              contentStyle={{
                background: "#0e0e0e",
                border: "1px solid #2a2a2a",
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
              }}
              labelFormatter={(v) => fmtFecha(Number(v))}
              formatter={(value, key, item) => {
                if (key === "costo") {
                  const p = item.payload as (typeof serie)[0];
                  return [
                    `$${fmtCosto(Number(value))}  (${p.strikes})`,
                    "Costo",
                  ];
                }
                return [value, key];
              }}
            />
            {typeof costoLive === "number" && costoLive !== 0 && (
              <ReferenceLine
                y={costoLive}
                stroke="#ffcc00"
                strokeDasharray="4 4"
                label={{
                  value: `LIVE $${fmtCosto(costoLive)}`,
                  fill: "#ffcc00",
                  fontSize: 9,
                  position: "insideTopRight",
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="costo"
              stroke="#ff9900"
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
