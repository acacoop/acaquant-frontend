"use client";

import { InfoIcon } from "@/components/info-icon";
import { useFetchOnce } from "./use-poll";
import { fmt } from "./fmt";
import { tips } from "./tips";
import type { IntradayResp } from "./types";

interface Props {
  ticker: string;
}

export function IntradayPanel({ ticker }: Props) {
  const url = `/api/mm/intraday?ticker=${encodeURIComponent(ticker)}&bucket_min=5`;
  const { data, error, loading, refetch } = useFetchOnce<IntradayResp>(url);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-zinc-400">
          Intraday — buckets de 5 min
          {data?.fecha && <span className="ml-2 text-zinc-500">· {data.fecha}</span>}
          {data?.n_trades != null && (
            <span className="ml-2 text-zinc-500">· {data.n_trades} trades del día</span>
          )}
        </div>
        <button
          onClick={refetch}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:bg-zinc-800"
        >
          refresh
        </button>
      </div>

      {loading && <div className="text-[12px] text-zinc-500">cargando…</div>}
      {error && <div className="text-[12px] text-rose-400">{error}</div>}

      {data && data.buckets.length > 0 && (
        <>
          <NofChart buckets={data.buckets} />
          <QesChart buckets={data.buckets} />
          <RealizedVolChart buckets={data.buckets} />
        </>
      )}
      {data && data.buckets.length === 0 && !loading && (
        <div className="text-[12px] text-zinc-500">Sin datos para esta fecha.</div>
      )}
    </div>
  );
}

function NofChart({ buckets }: { buckets: IntradayResp["buckets"] }) {
  const max = Math.max(...buckets.map((b) => Math.abs(b.nof || 0)), 1);
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
      <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
        Net Order Flow (Lee-Ready) por bucket — buy_size − sell_size
        <InfoIcon tip={tips.nof} width="340px" />
      </div>
      <div className="flex h-28 items-end gap-[1px]">
        {buckets.map((b, i) => {
          const h = (Math.abs(b.nof || 0) / max) * 100;
          const positive = (b.nof || 0) >= 0;
          return (
            <div
              key={i}
              title={`${b.ts_start_ar} · NOF ${fmt(b.nof, 0)}`}
              className="flex-1 self-end"
              style={{
                height: `${h}%`,
                background: positive ? "rgba(16,185,129,0.6)" : "rgba(244,63,94,0.6)",
              }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-zinc-500">
        <span>{buckets[0]?.ts_start_ar}</span>
        <span>{buckets[buckets.length - 1]?.ts_start_ar}</span>
      </div>
    </div>
  );
}

function QesChart({ buckets }: { buckets: IntradayResp["buckets"] }) {
  const vals = buckets.filter((b) => b.qES != null).map((b) => b.qES as number);
  if (vals.length === 0) return null;
  const max = Math.max(...vals, 0.01);

  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
      <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
        qES — quantity-weighted effective spread por bucket (abs)
        <InfoIcon tip={tips.qES} width="340px" />
      </div>
      <div className="flex h-24 items-end gap-[1px]">
        {buckets.map((b, i) => {
          const v = b.qES;
          const h = v != null ? (v / max) * 100 : 0;
          return (
            <div
              key={i}
              title={`${b.ts_start_ar} · qES ${v != null ? fmt(v, 3) : "—"}`}
              className="flex-1 self-end bg-amber-500/40"
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function RealizedVolChart({ buckets }: { buckets: IntradayResp["buckets"] }) {
  const vals = buckets.filter((b) => b.realized_vol != null).map((b) => b.realized_vol as number);
  if (vals.length === 0) return null;
  const max = Math.max(...vals, 0.01);

  return (
    <div className="rounded border border-zinc-800 bg-zinc-950 p-2">
      <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-zinc-500">
        Realized vol (bps) por bucket — stdev de retornos sobre mid
        <InfoIcon tip={tips.realizedVol} width="340px" />
      </div>
      <div className="flex h-24 items-end gap-[1px]">
        {buckets.map((b, i) => {
          const v = b.realized_vol;
          const h = v != null ? (v / max) * 100 : 0;
          return (
            <div
              key={i}
              title={`${b.ts_start_ar} · ${v != null ? fmt(v, 1) : "—"}bps`}
              className="flex-1 self-end bg-sky-500/40"
              style={{ height: `${h}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
