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
import {
  PERIODOS_INTRADIA,
  PeriodoFilter,
  inicioPeriodo,
  type Periodo,
} from "./periodo-filter";
import { claveDia, ejeSesion, fmtDDMMHHMM } from "@/lib/eje-sesion";

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
  // Período visible (HOY / WTD / MTD / TODO). Reemplaza al brush.
  const [periodo, setPeriodo] = useState<Periodo>("TODO");

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

  // Eje X "de sesión" (lib/eje-sesion): cada día de rueda ocupa el mismo
  // ancho y el punto se ubica por su hora dentro de la sesión. Sin huecos de
  // noches ni fines de semana, y los días con un solo cierre no se aplastan.
  const serie = useMemo(() => {
    // El spot (VR-GGal) es DIARIO; el costo es intradía (buckets de 15 min).
    // Ponemos el spot UNA vez por día (primer bucket) y null en el resto: con
    // connectNulls + type linear la línea conecta los puntos diarios en recto,
    // en vez de quedar escalonada (flat dentro del día + salto entre días).
    const desde = inicioPeriodo(periodo);
    const visibles = data.filter((p) => desde == null || new Date(p.ts).getTime() >= desde);
    const tDe = (p: Punto) => new Date(p.ts).getTime();
    const eje = ejeSesion(visibles.map(tDe));
    return visibles.map((p, idx) => {
      const t = tDe(p);
      const day = claveDia(t);
      const nuevoDia = idx === 0 || day !== claveDia(tDe(visibles[idx - 1]));
      const vr = vrMap[day];
      const spotDia = vr ? (spotMoneda === "ARS" ? vr.local : vr.adr) : undefined;
      return {
        x: eje.xs[idx],
        t,
        costo: p.costo,
        atm: p.atm,
        spot: p.spot,
        spot2: nuevoDia ? (spotDia ?? null) : null,
        strikes: p.strikes,
      };
    });
  }, [data, vrMap, spotMoneda, periodo]);

  const haySpot2 = useMemo(() => serie.some((p) => p.spot2 != null), [serie]);
  const eje = useMemo(() => ejeSesion(serie.map((p) => p.t)), [serie]);

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


  if (loading) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
        Cargando costo histórico…
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
        Sin histórico disponible para esta estrategia.
      </p>
    );
  }

  const fmtCosto = (v: number) =>
    v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  const fmtTooltipFecha = (p?: (typeof serie)[number]) => (p ? fmtDDMMHHMM(p.t) : "");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-3 px-2 pb-1 text-[9px] text-[var(--t-text-dim)] shrink-0 flex-wrap">
        <PeriodoFilter value={periodo} onChange={setPeriodo} opciones={PERIODOS_INTRADIA} />
        {stats && (
          <>
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
            <span className="text-[var(--t-accent)] font-semibold">
              ${fmtCosto(stats.ultimo)}
            </span>
          </span>
          <span
            className={
              stats.delta >= 0
                ? "text-[var(--t-pos)]"
                : "text-[var(--t-neg)]"
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
          Sin datos en el período {periodo} para esta estrategia.
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
                background: "var(--t-surface)",
                border: "1px solid var(--t-border-2)",
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
              }}
              labelFormatter={(_v, payload) =>
                fmtTooltipFecha(payload?.[0]?.payload as (typeof serie)[number] | undefined)
              }
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
          </LineChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
