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
import { useViewportKey } from "@/lib/use-viewport-key";
import {
  PERIODOS_INTRADIA,
  PeriodoFilter,
  inicioPeriodo,
  type Periodo,
} from "./periodo-filter";
import { claveDia, ejeSesion, fmtDDMMHHMM } from "@/lib/eje-sesion";

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
 * trae los ticks intradía de HOY (options_data, que se purga de noche) más
 * un punto de CIERRE (17:00) por cada día anterior en que el contrato operó
 * (options_data_hist, el rollup diario). Orden desc. Lo revertimos a
 * ascendente y usamos índice como eje X para no dejar huecos en fines de
 * semana/feriados (mismo criterio que CostoHistoricoChart).
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
  // Período visible (HOY / WTD / MTD / TODO). Reemplaza al brush.
  const [periodo, setPeriodo] = useState<Periodo>("TODO");

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
    const desde = inicioPeriodo(periodo);
    const byBucket = new Map<number, TradeDoc>();
    for (const p of data) {
      const t = new Date(p.timestamp).getTime();
      if (!Number.isFinite(t)) continue;
      if (desde != null && t < desde) continue;
      byBucket.set(Math.floor(t / BUCKET_MS), p); // data asc → último gana
    }
    // El spot (VR-GGal) es DIARIO: lo ponemos UNA vez por día y null en el
    // resto → con connectNulls + type linear la línea queda recta, no escalonada.
    const keys = [...byBucket.keys()].sort((a, b) => a - b);
    const tDe = (k: number) => new Date(byBucket.get(k)!.timestamp).getTime();
    const eje = ejeSesion(keys.map(tDe));
    return keys.map((k, idx) => {
        const p = byBucket.get(k)!;
        const t = tDe(k);
        const fecha = claveDia(t);
        const nuevoDia = idx === 0 || fecha !== claveDia(tDe(keys[idx - 1]));
        const vr = vrMap[fecha];
        const spotDia = vr ? (spotMoneda === "ARS" ? vr.local : vr.adr) : undefined;
        // Cierre diario (viene de options_data_hist): el backend lo ubica a las
        // 17:00 en punto y sin `last_timestamp` (un tick real siempre lo trae).
        const d = new Date(t);
        const cierre = p.last_timestamp == null && d.getHours() === 17 && d.getMinutes() === 0;
        return {
          x: eje.xs[idx],
          t,
          cierre,
          last: Number(p.last),
          spot: p.spot,
          strike: p.strike,
          spot2: nuevoDia ? (spotDia ?? null) : null,
        };
      });
  }, [data, vrMap, spotMoneda, periodo]);

  const eje = useMemo(() => ejeSesion(serie.map((p) => p.t)), [serie]);

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
  if (!data.length) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
        Sin histórico para {instrumento}.
      </p>
    );
  }

  const fmtPx = (v: number) =>
    v.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  const fmtTooltipFecha = (p?: (typeof serie)[number]) =>
    p ? (p.cierre ? `${fmtDDMMHHMM(p.t)} · cierre` : fmtDDMMHHMM(p.t)) : "";

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-3 px-2 pb-1 text-[9px] text-[var(--t-text-dim)] shrink-0 flex-wrap">
        <PeriodoFilter value={periodo} onChange={setPeriodo} opciones={PERIODOS_INTRADIA} />
        {stats && (
          <>
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
          </>
        )}
      </div>
      {!serie.length ? (
        <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
          Sin trades en el período {periodo} para {instrumento}.
        </p>
      ) : (
      <div className="flex-1 min-h-0">
        <ResponsiveContainer key={vpKey} width="100%" height="100%">
          <LineChart
            data={serie}
            margin={{ top: 4, right: 12, bottom: 20, left: 4 }}
          >
            <CartesianGrid stroke="var(--t-border)" vertical={false} />
            <XAxis
              dataKey="x"
              type="number"
              domain={eje.domain}
              ticks={eje.ticks}
              tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
              axisLine={{ stroke: "var(--t-border-2)" }}
              tickLine={false}
              tickFormatter={eje.labelTick}
              minTickGap={24}
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
              axisLine={{ stroke: "var(--t-border-2)" }}
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
                background: "var(--t-surface)",
                border: "1px solid var(--t-border-2)",
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
              }}
              labelFormatter={(_v, payload) =>
                fmtTooltipFecha(payload?.[0]?.payload as (typeof serie)[number] | undefined)
              }
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
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
