"use client";

import { InfoIcon } from "@/components/info-icon";
import { useFetchOnce } from "./use-poll";
import { fmt } from "./fmt";
import { tips } from "./tips";
import type { SmileResp } from "./types";

interface Props {
  ticker: string;
}

export function SmilePanel({ ticker }: Props) {
  const url = `/api/mm/smile?ticker=${encodeURIComponent(ticker)}&dias=5&bucket_min=30`;
  const { data, error, loading } = useFetchOnce<SmileResp>(url);

  if (loading) return <div className="text-[12px] text-zinc-500">cargando…</div>;
  if (error) return <div className="text-[12px] text-rose-400">{error}</div>;
  if (!data || data.buckets.length === 0)
    return <div className="text-[12px] text-zinc-500">Sin datos suficientes.</div>;

  const maxVol = Math.max(...data.buckets.map((b) => b.avg_volume ?? 0), 1);
  const maxRv = Math.max(...data.buckets.map((b) => b.avg_realized_vol ?? 0), 0.01);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1 text-[11px] text-zinc-400">
        Promedios por bucket de {data.bucket_min} min sobre los últimos {data.dias} días con trades.
        Esperás forma U: pico apertura, mínimo mediodía, pico mayor cierre.
        <InfoIcon tip={tips.smile} width="400px" />
      </div>

      <Chart
        title={`Volumen promedio por bucket (${data.bucket_min} min)`}
        buckets={data.buckets}
        maxVal={maxVol}
        getter={(b) => b.avg_volume}
        format={(v) => fmt(v, 0)}
        color="rgba(59,130,246,0.6)"
      />

      <Chart
        title="Volatilidad realizada promedio (bps)"
        buckets={data.buckets}
        maxVal={maxRv}
        getter={(b) => b.avg_realized_vol}
        format={(v) => `${fmt(v, 1)}bps`}
        color="rgba(245,158,11,0.6)"
      />
    </div>
  );
}

interface ChartProps {
  title: string;
  buckets: SmileResp["buckets"];
  maxVal: number;
  getter: (b: SmileResp["buckets"][number]) => number | null;
  format: (v: number) => string;
  color: string;
}

function Chart({ title, buckets, maxVal, getter, format, color }: ChartProps) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
      <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="flex h-32 items-end gap-1">
        {buckets.map((b, i) => {
          const v = getter(b);
          const h = v != null ? (v / maxVal) * 100 : 0;
          return (
            <div
              key={i}
              title={`${b.ts_ar} · ${v != null ? format(v) : "—"} (${b.n_dias_obs} días)`}
              className="flex-1 self-end"
              style={{ height: `${h}%`, background: color }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex gap-1">
        {buckets.map((b, i) => (
          <div key={i} className="flex flex-1 justify-center text-[9px] text-zinc-500">
            {i % 2 === 0 ? b.ts_ar : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
