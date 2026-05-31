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
import { useViewportKey } from "@/lib/use-viewport-key";

interface TradeDoc {
  instrumento: string;
  timestamp: string;
  last_timestamp?: string;
  bid?: number;
  offer?: number;
  last?: number;
  spot?: number;
  strike?: number;
  tipo?: "CALL" | "PUT";
  iv?: number;
  delta?: number;
}

/**
 * Histórico de un contrato individual (call o put). Plotea `last` vs tiempo.
 *
 * El endpoint backend `/api/cotizaciones/historico/opciones?instrumento=X`
 * trae todas las operaciones de los últimos 21 días (Opciones.Data),
 * orden desc. Lo revertimos a ascendente y usamos índice como eje X
 * para no dejar huecos en fines de semana/feriados (mismo criterio que
 * CostoHistoricoChart).
 */
export function OpcionHistoricoChart({
  instrumento,
  lastLive,
}: {
  instrumento: string;
  lastLive?: number;
}) {
  const vpKey = useViewportKey();
  const [data, setData] = useState<TradeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 2º eje Y: spot del subyacente (GGAL) desde Opciones.VR-GGal, switch ARS/ADR.
  const [spotMoneda, setSpotMoneda] = useState<"ARS" | "ADR">("ARS");
  const [vrMap, setVrMap] = useState<Record<string, { local?: number; adr?: number }>>({});

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
     
    setError(null);

    const url =
      "/api/cotizaciones/historico/opciones?instrumento=" +
      encodeURIComponent(instrumento);
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as TradeDoc[];
      })
      .then((rows) => {
        if (cancelled) return;
        // Endpoint trae desc; revertimos a asc para graficar de izq→der.
        rows.reverse();
        setData(rows.filter((r) => typeof r.last === "number" && r.last! > 0));
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
  }, [instrumento]);

  // Serie diaria del subyacente (VR-GGal) para el 2º eje. Mapeada por fecha.
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

  // Bucketing por tiempo (15 min): un punto por bucket (último trade del
  // bucket). Sin esto el eje X usaba el índice de TRADE, y las opciones más
  // operadas tienen miles de trades concentrados en los días recientes que se
  // comen el eje → el histórico viejo quedaba aplastado y no se podía ver si
  // estaba cara/barata. Con buckets de tiempo cada franja de 15 min pesa
  // igual (mismo criterio que CostoHistoricoChart, que bucketea en backend).
  const serie = useMemo(() => {
    const BUCKET_MS = 15 * 60 * 1000;
    const byBucket = new Map<number, TradeDoc>();
    for (const p of data) {
      const t = new Date(p.timestamp).getTime();
      if (!Number.isFinite(t)) continue;
      byBucket.set(Math.floor(t / BUCKET_MS), p); // data asc → último gana
    }
    // El spot (VR-GGal) es DIARIO: lo ponemos UNA vez por día y null en el
    // resto → con connectNulls + type linear la línea queda recta, no escalonada.
    let lastDay = "";
    return [...byBucket.keys()]
      .sort((a, b) => a - b)
      .map((k, idx) => {
        const p = byBucket.get(k)!;
        const t = new Date(p.timestamp).getTime();
        const fecha = new Date(t).toISOString().slice(0, 10);
        const nuevoDia = fecha !== lastDay;
        lastDay = fecha;
        const vr = vrMap[fecha];
        const spotDia = vr ? (spotMoneda === "ARS" ? vr.local : vr.adr) : undefined;
        return {
          idx,
          t,
          last: Number(p.last),
          spot: p.spot,
          strike: p.strike,
          spot2: nuevoDia ? (spotDia ?? null) : null,
        };
      });
  }, [data, vrMap, spotMoneda]);

  const haySpot2 = useMemo(() => serie.some((p) => p.spot2 != null), [serie]);

  const stats = useMemo(() => {
    if (!serie.length) return null;
    const xs = serie.map((p) => p.last);
    const min = Math.min(...xs);
    const max = Math.max(...xs);
    const ultimo = xs[xs.length - 1];
    const primero = xs[0];
    const delta = ultimo - primero;
    return { min, max, ultimo, primero, delta };
  }, [serie]);

  const yDomain = useMemo<[number, number] | ["auto", "auto"]>(() => {
    if (!serie.length) return ["auto", "auto"];
    const vals = serie.map((p) => p.last);
    if (typeof lastLive === "number" && lastLive > 0) vals.push(lastLive);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (min === max) return [Math.floor(min - 1), Math.ceil(max + 1)];
    const pad = (max - min) * 0.1;
    return [min - pad, max + pad];
  }, [serie, lastLive]);

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
        Cargando histórico de {instrumento}…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-[var(--t-neg)] text-xs py-4 text-center">
        Error: {error}
      </p>
    );
  }
  if (!serie.length) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
        Sin trades de los últimos 21 días para {instrumento}.
      </p>
    );
  }

  const fmtPx = (v: number) =>
    v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  const fmtTickFecha = (idx: number) => {
    const p = serie[idx];
    if (!p) return "";
    const d = new Date(p.t);
    return `${String(d.getDate()).padStart(2, "0")}/${String(
      d.getMonth() + 1,
    ).padStart(2, "0")}`;
  };
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
              ${fmtPx(stats.min)}
            </span>
          </span>
          <span>
            MAX{" "}
            <span className="text-[var(--t-text)] font-semibold">
              ${fmtPx(stats.max)}
            </span>
          </span>
          <span>
            ÚLT{" "}
            <span className="text-[var(--t-accent)] font-semibold">
              ${fmtPx(stats.ultimo)}
            </span>
          </span>
          <span
            className={
              stats.delta >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
            }
          >
            Δ {stats.delta >= 0 ? "+" : ""}
            {fmtPx(stats.delta)}
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
                      : "bg-[var(--t-panel)] text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[#4a9eff]")
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
              tickFormatter={fmtPx}
              tickCount={6}
              width={60}
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
              formatter={(value, name) =>
                name === "spot2"
                  ? [`$${fmtPx(Number(value))}`, `Spot ${spotMoneda}`]
                  : [`$${fmtPx(Number(value))}`, "Last"]
              }
            />
            {typeof lastLive === "number" && lastLive > 0 && (
              <ReferenceLine
                y={lastLive}
                stroke="#ffcc00"
                strokeDasharray="4 4"
                label={{
                  value: `LIVE $${fmtPx(lastLive)}`,
                  fill: "#ffcc00",
                  fontSize: 9,
                  position: "insideTopRight",
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="last"
              stroke="#ff9900"
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
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
