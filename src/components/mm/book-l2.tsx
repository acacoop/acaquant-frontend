"use client";

import { fmt, fmtSize } from "./fmt";
import type { BookSnapshot } from "./types";

interface Props {
  book: BookSnapshot | null;
  mid: number | null;
}

const DEPTH = 5;

function pad<T>(arr: T[] | undefined, n: number): (T | null)[] {
  const a = arr ? arr.slice(0, n) : [];
  while (a.length < n) a.push(null as never);
  return a as (T | null)[];
}

export function BookL2({ book, mid }: Props) {
  const offers = pad(book?.offers, DEPTH);
  const bids = pad(book?.bids, DEPTH);
  const offersDesc = [...offers].reverse(); // peor offer arriba

  const maxBidSize = Math.max(...bids.map((b) => b?.size ?? 0), 1);
  const maxAskSize = Math.max(...offers.map((o) => o?.size ?? 0), 1);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        Order Book L2 · depth 5
      </div>
      <table className="w-full text-[12px] tabular-nums">
        <thead>
          <tr className="text-[10px] uppercase text-zinc-500">
            <th className="px-3 py-1 text-left font-normal">Size</th>
            <th className="px-3 py-1 text-right font-normal">Bid</th>
            <th className="px-3 py-1 text-right font-normal">Ask</th>
            <th className="px-3 py-1 text-right font-normal">Size</th>
          </tr>
        </thead>
        <tbody>
          {offersDesc.map((lvl, i) => {
            const pct = lvl ? (lvl.size / maxAskSize) * 100 : 0;
            return (
              <tr key={`o-${i}`} className="border-t border-zinc-900">
                <td className="px-3 py-1 text-zinc-700">—</td>
                <td className="px-3 py-1 text-right text-zinc-700">—</td>
                <td className="relative px-3 py-1 text-right text-rose-400">
                  <div
                    className="absolute inset-y-0 right-0 bg-rose-500/10"
                    style={{ width: `${pct}%` }}
                  />
                  <span className="relative">{lvl ? fmt(lvl.price, 3) : "—"}</span>
                </td>
                <td className="px-3 py-1 text-right text-zinc-300">
                  {lvl ? fmtSize(lvl.size) : "—"}
                </td>
              </tr>
            );
          })}
          <tr className="border-y border-amber-500/30 bg-amber-500/5">
            <td colSpan={4} className="px-3 py-1.5 text-center text-[11px] font-semibold text-amber-400">
              MID {mid != null ? fmt(mid, 4) : "—"}
            </td>
          </tr>
          {bids.map((lvl, i) => {
            const pct = lvl ? (lvl.size / maxBidSize) * 100 : 0;
            return (
              <tr key={`b-${i}`} className="border-b border-zinc-900">
                <td className="px-3 py-1 text-left text-zinc-300">
                  {lvl ? fmtSize(lvl.size) : "—"}
                </td>
                <td className="relative px-3 py-1 text-right text-emerald-400">
                  <div
                    className="absolute inset-y-0 left-0 bg-emerald-500/10"
                    style={{ width: `${pct}%` }}
                  />
                  <span className="relative">{lvl ? fmt(lvl.price, 3) : "—"}</span>
                </td>
                <td className="px-3 py-1 text-right text-zinc-700">—</td>
                <td className="px-3 py-1 text-right text-zinc-700">—</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
