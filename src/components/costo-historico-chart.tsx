"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Brush,
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
  // 2º eje Y: spot del subyacente (GGAL) desde Opciones.VR-GGal, switch ARS/ADR.
  const [spotMoneda, setSpotMoneda] = useState<"ARS" | "ADR">("ARS");
  const [vrMap, setVrMap] = useState<Record<string, { local?: number; adr?: number }>>({});

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

  // Serie diaria del subyacente (VR-GGal) — una vez, para el 2º eje. Mapeada
  // por fecha (YYYY-MM-DD) y proyectada a cada bucket del costo según el día.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cotizaciones/vr-ggal", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { fecha: string; local?: number; adr?: number }[]) => {
        if (cancelled) return;
        const m: Record<string, { local?: number; adr?: number }> = {};
        for (const r of rows || []) {
          if (r.fecha) m[r.fecha.slice(0, 10)] = { local: r.local, adr: r.adr };
        }
        setVrMap(m);
      })
      .catch(() => {
        if (!cancelled) setVrMap({});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // serie indexada (idx categórico) — el eje X usa el índice del bucket,
  // no el timestamp real, así dos buckets consecutivos quedan pegados
  // aunque haya un fin de semana o feriado entre ellos. Sin esto el
  // chart abre un hueco visual durante 2-3 días por mes que se ve mal.
  const serie = useMemo(() => {
    // El spot (VR-GGal) es DIARIO; el costo es intradía (buckets de 15 min).
    // Ponemos el spot UNA vez por día (primer bucket) y null en el resto: con
    // connectNulls + type linear la línea conecta los puntos diarios en recto,
    // en vez de quedar escalonada (flat dentro del día + salto entre días).
    let lastDay = "";
    return data.map((p, idx) => {
      const day = p.ts.slice(0, 10);
      const nuevoDia = day !== lastDay;
      lastDay = day;
      const vr = vrMap[day];
      const spotDia = vr ? (spotMoneda === "ARS" ? vr.local : vr.adr) : undefined;
      return {
        idx,
        t: new Date(p.ts).getTime(),
        costo: p.costo,
        atm: p.atm,
        spot: p.spot,
        spot2: nuevoDia ? (spotDia ?? null) : null,
        strikes: p.strikes,
      };
    });
  }, [data, vrMap, spotMoneda]);

  const haySpot2 = useMemo(() => serie.some((p) => p.spot2 != null), [serie]);

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

  // Domain ajustado a la serie real (con padding 10%) para que la línea
  // ocupe todo el alto. Sin esto Recharts arranca en 0 y los movimientos
  // chicos quedan aplastados.
  const yDomain = useMemo<[number, number] | ["auto", "auto"]>(() => {
    if (!serie.length) return ["auto", "auto"];
    const vals = serie.map((p) => p.costo);
    if (typeof costoLive === "number" && costoLive !== 0) {
      vals.push(costoLive);
    }
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (min === max) {
      // Todos iguales → forzar un rango chico para no colapsar
      return [Math.floor(min - 1), Math.ceil(max + 1)];
    }
    const pad = (max - min) * 0.1;
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [serie, costoLive]);

  // Un tick por día. Como el eje X es ahora `idx` (categórico), guardo
  // el `idx` del primer bucket de cada día en lugar del timestamp.
  const xTicks = useMemo<number[]>(() => {
    if (!serie.length) return [];
    const seen = new Set<string>();
    const out: number[] = [];
    for (const p of serie) {
      const d = new Date(p.t);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(p.idx);
      }
    }
    return out;
  }, [serie]);

  if (loading) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
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
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
        Sin histórico disponible para esta estrategia en el OPEX en curso.
      </p>
    );
  }

  const fmtCosto = (v: number) =>
    v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  // El eje X es idx — buscamos el timestamp real del bucket en `serie`
  // y lo formateamos a DD/MM.
  const fmtTickFecha = (idx: number) => {
    const p = serie[idx];
    if (!p) return "";
    const d = new Date(p.t);
    return `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1,
    ).padStart(2, "0")}`;
  };
  // Tooltip: ídem, mapea idx → ts → DD/MM HH:MM.
  const fmtTooltipFecha = (idx: number) => {
    const p = serie[idx];
    if (!p) return "";
    const d = new Date(p.t);
    return `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1,
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  };

  return (
    <div className="h-full min-h-0 flex flex-col">
      {stats && (
        <div className="flex items-center gap-3 px-2 pb-1 text-[9px] text-[var(--t-text-dim)] shrink-0">
          <span>
            MIN{" "}
            <span className="text-[var(--t-text)] font-semibold">
              ${fmtCosto(stats.min)}
            </span>
          </span>
          <span>
            MAX{" "}
            <span className="text-[var(--t-text)] font-semibold">
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
          {haySpot2 && (
            <span className="ml-auto flex items-center gap-1">
              <span className="text-[var(--t-text-muted)]">SPOT</span>
              {(["ARS", "ADR"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setSpotMoneda(m)}
                  className={
                    "px-1.5 py-0 text-[9px] uppercase tracking-wider border " +
                    (spotMoneda === m
                      ? "bg-[#4a9eff] text-black border-[#4a9eff]"
                      : "bg-[#0a0a0a] text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[#4a9eff]")
                  }
                >
                  {m}
                </button>
              ))}
            </span>
          )}
          <span className={(haySpot2 ? "" : "ml-auto ") + "text-[var(--t-text-muted)]"}>
            {serie.length} puntos
          </span>
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
              dataKey="idx"
              type="number"
              domain={[0, Math.max(0, serie.length - 1)]}
              ticks={xTicks}
              tick={{ fill: "#808080", fontSize: 9 }}
              axisLine={{ stroke: "#2a2a2a" }}
              tickLine={false}
              tickFormatter={fmtTickFecha}
              minTickGap={30}
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: "#808080", fontSize: 9 }}
              axisLine={{ stroke: "#2a2a2a" }}
              tickLine={false}
              tickFormatter={fmtCosto}
              tickCount={6}
              width={60}
              allowDecimals={false}
            />
            {haySpot2 && (
              <YAxis
                yAxisId="spot"
                orientation="right"
                domain={["auto", "auto"]}
                tick={{ fill: "#4a9eff", fontSize: 9 }}
                axisLine={{ stroke: "#2a4a6a" }}
                tickLine={false}
                tickFormatter={(v: number) =>
                  spotMoneda === "ADR" ? `$${v.toFixed(1)}` : `$${(v / 1000).toFixed(1)}k`
                }
                width={48}
              />
            )}
            <Tooltip
              contentStyle={{
                background: "#0e0e0e",
                border: "1px solid #2a2a2a",
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
              }}
              labelFormatter={(v) => fmtTooltipFecha(Number(v))}
              formatter={(value, key, item) => {
                if (key === "costo") {
                  const p = item.payload as (typeof serie)[0];
                  return [
                    `$${fmtCosto(Number(value))}  (${p.strikes})`,
                    "Costo",
                  ];
                }
                if (key === "spot2") {
                  return [`$${fmtCosto(Number(value))}`, `Spot ${spotMoneda}`];
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
            {haySpot2 && (
              <Line
                yAxisId="spot"
                type="linear"
                dataKey="spot2"
                stroke="#4a9eff"
                strokeWidth={1.2}
                strokeDasharray="3 3"
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            )}
            <Brush
              dataKey="idx"
              height={16}
              stroke="#ff9900"
              fill="#0a0a0a"
              travellerWidth={8}
              tickFormatter={(idx: number) => fmtTickFecha(Number(idx))}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
