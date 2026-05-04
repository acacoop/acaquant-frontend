"use client";

import { fmt, fmtBps, fmtTimeAr } from "./fmt";
import type { LiveResp } from "./types";

interface Props {
  data: LiveResp | null;
  loading: boolean;
}

function Stat({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "green" | "red" | "amber";
}) {
  const colors: Record<string, string> = {
    default: "text-zinc-100",
    green: "text-emerald-400",
    red: "text-rose-400",
    amber: "text-amber-400",
  };
  return (
    <div className="flex min-w-[100px] flex-col px-3 py-1.5">
      <span className="text-[9px] uppercase tracking-wide text-zinc-500">{label}</span>
      <span className={`text-[14px] font-semibold tabular-nums ${colors[tone]}`}>{value}</span>
      {sub && <span className="text-[9px] text-zinc-500">{sub}</span>}
    </div>
  );
}

export function MMHeader({ data, loading }: Props) {
  const m = data?.metrics;
  const obi = m?.obi ?? null;
  const obiTone = obi == null ? "default" : obi > 0.1 ? "green" : obi < -0.1 ? "red" : "default";
  const obiSign = obi == null ? "" : obi > 0 ? "+" : "";

  return (
    <div className="flex flex-wrap items-stretch border-b border-zinc-800 bg-zinc-950">
      <div className="flex flex-col justify-center border-r border-zinc-800 px-3 py-1.5">
        <span className="text-[9px] uppercase tracking-wide text-zinc-500">Ticker</span>
        <span className="text-[12px] font-semibold text-zinc-100">{data?.ticker?.replace("MERV - XMEV - ", "") ?? "—"}</span>
        <span className="text-[9px] text-zinc-500">{loading ? "loading…" : data?.ts_book ? `book ${fmtTimeAr(data.ts_book)}` : "sin book"}</span>
      </div>
      <Stat label="Mid" value={m?.mid != null ? fmt(m.mid, 4) : "—"} tone="amber" />
      <Stat
        label="Microprice"
        value={m?.microprice != null ? fmt(m.microprice, 4) : "—"}
        sub={
          m?.mid != null && m?.microprice != null
            ? `${m.microprice > m.mid ? "+" : ""}${fmt((m.microprice - m.mid) * 1000, 2)} mp - mid (×10³)`
            : undefined
        }
      />
      <Stat
        label="OBI"
        value={obi != null ? `${obiSign}${fmt(obi, 3)}` : "—"}
        sub="(bid - ask) / (bid + ask)"
        tone={obiTone}
      />
      <Stat
        label="Quoted Spread"
        value={m?.qs_bps != null ? fmtBps(m.qs_bps) : "—"}
        sub={m?.quoted_spread != null ? `${fmt(m.quoted_spread, 3)} abs` : undefined}
      />
      <Stat
        label="Top size bid / ask"
        value={
          m?.bid_size != null && m?.ask_size != null
            ? `${fmt(m.bid_size, 0)} / ${fmt(m.ask_size, 0)}`
            : "—"
        }
      />
      {data?.last_trade && (
        <div className="ml-auto flex flex-col justify-center border-l border-zinc-800 px-3 py-1.5">
          <span className="text-[9px] uppercase tracking-wide text-zinc-500">Last trade</span>
          <span className="text-[12px] tabular-nums text-zinc-200">
            {fmt(data.last_trade.price, 3)} ×{" "}
            <span className="text-zinc-400">{fmt(data.last_trade.size, 0)}</span>{" "}
            <span
              className={
                data.last_trade.side === "BUY"
                  ? "text-emerald-400"
                  : data.last_trade.side === "SELL"
                  ? "text-rose-400"
                  : "text-zinc-400"
              }
            >
              {data.last_trade.side}
            </span>
          </span>
          <span className="text-[9px] text-zinc-500">
            {fmtTimeAr(data.last_trade.timestamp)} · es {data.last_trade.es_bps != null ? `${fmt(data.last_trade.es_bps, 1)}bps` : "—"}
          </span>
        </div>
      )}
    </div>
  );
}
