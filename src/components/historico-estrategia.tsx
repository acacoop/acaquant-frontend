"use client";

import { useEffect, useState } from "react";
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
import type { ResolvedLeg } from "@/lib/estrategias";

interface HistoricoDoc {
  instrumento: string;
  timestamp: string;
  bid?: number;
  offer?: number;
  last?: number;
}

interface Point {
  t: number;
  label: string;
  costo: number;
}

const BUCKET_MS = 15 * 60 * 1000; // 15 min

function pxOf(d: HistoricoDoc): number {
  const bid = d.bid || 0;
  const offer = d.offer || 0;
  if (bid > 0 && offer > 0) return (bid + offer) / 2;
  return d.last || 0;
}

function bucketKey(ts: string): number {
  const t = new Date(ts).getTime();
  return Math.floor(t / BUCKET_MS) * BUCKET_MS;
}

export function HistoricoEstrategia({
  legs,
  costoActual,
}: {
  legs: ResolvedLeg[];
  costoActual: number;
}) {
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const symbols = legs.map((l) => l.instrumento).filter(Boolean);
    if (!symbols.length) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const results = await Promise.all(
          symbols.map(async (s) => {
            const res = await fetch(
              `/api/opciones-historico?instrumento=${encodeURIComponent(s)}`
            );
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return (await res.json()) as HistoricoDoc[];
          })
        );
        if (cancelled) return;

        // bucket por símbolo: bucket -> last px del bucket
        const bySym = new Map<string, Map<number, number>>();
        for (let i = 0; i < symbols.length; i++) {
          const docs = results[i];
          const m = new Map<number, number>();
          for (const d of docs) {
            if (!d.timestamp) continue;
            const px = pxOf(d);
            if (px <= 0) continue;
            m.set(bucketKey(d.timestamp), px);
          }
          bySym.set(symbols[i], m);
        }

        // universo de buckets = intersección (requerimos px en TODAS las patas)
        const allBuckets = [...bySym.values()].map((m) => new Set(m.keys()));
        const common: number[] =
          allBuckets.length === 0
            ? []
            : [...allBuckets[0]].filter((k) =>
                allBuckets.every((s) => s.has(k))
              );

        const sorted = common.sort((a, b) => a - b);
        const pts: Point[] = [];
        for (const bk of sorted) {
          let neto = 0;
          let ok = true;
          for (const leg of legs) {
            const px = bySym.get(leg.instrumento)?.get(bk);
            if (px === undefined) {
              ok = false;
              break;
            }
            const m = leg.side === "buy" ? 1 : -1;
            neto += px * leg.qty * m;
          }
          if (!ok) continue;
          const d = new Date(bk);
          pts.push({
            t: bk,
            label: d.toLocaleString("es-AR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Argentina/Buenos_Aires",
            }),
            costo: neto * 100,
          });
        }
        setData(pts);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [legs]);

  if (loading) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">Cargando…</p>
    );
  }
  if (err) {
    return (
      <p className="text-[#ff4444] text-xs py-4 text-center">Error: {err}</p>
    );
  }
  if (!data.length) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        Sin datos históricos suficientes para esta estrategia.
      </p>
    );
  }

  const step = Math.max(1, Math.floor(data.length / 8));
  const tickVals = data.filter((_, i) => i % step === 0).map((d) => d.label);

  return (
    <div className="h-full min-h-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 4, right: 12, bottom: 24, left: 4 }}
        >
          <CartesianGrid stroke="#1a1a1a" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#808080", fontSize: 9 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={false}
            ticks={tickVals}
            angle={-25}
            textAnchor="end"
            height={32}
          />
          <YAxis
            tick={{ fill: "#808080", fontSize: 9 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={false}
            tickFormatter={(v) =>
              v.toLocaleString("es-AR", { maximumFractionDigits: 0 })
            }
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: "#0e0e0e",
              border: "1px solid #2a2a2a",
              fontSize: 11,
              fontFamily: "JetBrains Mono, monospace",
            }}
            formatter={(value) => [
              `$${Number(value).toLocaleString("es-AR", {
                maximumFractionDigits: 2,
              })}`,
              "Costo",
            ]}
          />
          <ReferenceLine y={0} stroke="#555" strokeDasharray="4 4" />
          <ReferenceLine
            y={costoActual}
            stroke="#ffcc00"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: `Ahora $${costoActual.toFixed(0)}`,
              fill: "#ffcc00",
              fontSize: 9,
              position: "insideTopLeft",
            }}
          />
          <Line
            type="monotone"
            dataKey="costo"
            stroke="#4a9eff"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
