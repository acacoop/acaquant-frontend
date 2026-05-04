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
  // Mismo orden de niveles a ambos lados: nivel 1 = top of book (mejor bid + mejor ask).
  const bids = pad(book?.bids, DEPTH);
  const offers = pad(book?.offers, DEPTH);

  const maxBidSize = Math.max(...bids.map((b) => b?.size ?? 0), 1);
  const maxAskSize = Math.max(...offers.map((o) => o?.size ?? 0), 1);

  const spread =
    bids[0] && offers[0] ? offers[0].price - bids[0].price : null;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
        <span>Book L2</span>
        <span className="font-mono text-[10px] text-amber-400">
          MID {mid != null ? fmt(mid, 4) : "—"}
          {spread != null && (
            <span className="ml-2 text-zinc-500">spr {fmt(spread, 3)}</span>
          )}
        </span>
      </div>
      <table className="w-full text-[11px] leading-tight tabular-nums">
        <thead>
          <tr className="border-b border-zinc-800 text-[9px] uppercase text-zinc-500">
            <th className="px-2 py-0.5 text-left font-normal">Bid Sz</th>
            <th className="px-2 py-0.5 text-right font-normal">Bid</th>
            <th className="w-1" />
            <th className="px-2 py-0.5 text-left font-normal">Ask</th>
            <th className="px-2 py-0.5 text-right font-normal">Ask Sz</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: DEPTH }).map((_, i) => {
            const b = bids[i];
            const o = offers[i];
            const bidPct = b ? (b.size / maxBidSize) * 100 : 0;
            const askPct = o ? (o.size / maxAskSize) * 100 : 0;
            return (
              <tr key={i} className="border-b border-zinc-900">
                <td className="relative px-2 py-0.5 text-left text-zinc-200">
                  <div
                    className="absolute inset-y-0 left-0 bg-emerald-500/10"
                    style={{ width: `${bidPct}%` }}
                  />
                  <span className="relative">{b ? fmtSize(b.size) : "—"}</span>
                </td>
                <td className="px-2 py-0.5 text-right font-medium text-emerald-400">
                  {b ? fmt(b.price, 3) : "—"}
                </td>
                <td className="border-x border-amber-500/20 bg-amber-500/5" />
                <td className="px-2 py-0.5 text-left font-medium text-rose-400">
                  {o ? fmt(o.price, 3) : "—"}
                </td>
                <td className="relative px-2 py-0.5 text-right text-zinc-200">
                  <div
                    className="absolute inset-y-0 right-0 bg-rose-500/10"
                    style={{ width: `${askPct}%` }}
                  />
                  <span className="relative">{o ? fmtSize(o.size) : "—"}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
