"use client";

import { fmt, fmtTimeAr } from "./fmt";
import type { TapeResp } from "./types";

interface Props {
  data: TapeResp | null;
  loading: boolean;
  error: string | null;
}

const CAP = 60; // últimos N en la pantalla.

export function Tape({ data, loading, error }: Props) {
  const trades = (data?.trades ?? []).slice(-CAP).reverse();

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        <span>Tape — TimeSales enriquecido</span>
        <span className="text-[10px] font-normal text-zinc-500">
          {data ? `${data.n} trades · últimos ${Math.min(CAP, trades.length)}` : ""}
        </span>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-[11px] tabular-nums">
          <thead className="sticky top-0 bg-zinc-950 text-[10px] uppercase tracking-wide text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th className="px-2 py-1 text-left font-normal">Time AR</th>
              <th className="px-2 py-1 text-right font-normal">Price</th>
              <th className="px-2 py-1 text-right font-normal">Size</th>
              <th className="px-2 py-1 text-center font-normal">Side</th>
              <th className="px-2 py-1 text-center font-normal">LR</th>
              <th className="px-2 py-1 text-right font-normal">ES bps</th>
              <th className="px-2 py-1 text-center font-normal">Walk</th>
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-rose-400">
                  {error}
                </td>
              </tr>
            )}
            {loading && trades.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-zinc-500">
                  loading…
                </td>
              </tr>
            )}
            {!loading && !error && trades.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-zinc-500">
                  Sin trades en la ventana.
                </td>
              </tr>
            )}
            {trades.map((t, i) => {
              const sideClr =
                t.side === "BUY" ? "text-emerald-400" : t.side === "SELL" ? "text-rose-400" : "text-zinc-400";
              const lrClr =
                t.lee_ready === "BUY"
                  ? "text-emerald-400"
                  : t.lee_ready === "SELL"
                  ? "text-rose-400"
                  : "text-zinc-500";
              const lrMatch = t.lee_ready_matches_side === false;
              return (
                <tr key={`${t.timestamp}-${i}`} className="border-b border-zinc-900 hover:bg-zinc-900/40">
                  <td className="px-2 py-0.5 text-zinc-400">{fmtTimeAr(t.timestamp)}</td>
                  <td className="px-2 py-0.5 text-right text-zinc-100">{fmt(t.price, 3)}</td>
                  <td className="px-2 py-0.5 text-right text-zinc-300">{fmt(t.size, 0)}</td>
                  <td className={`px-2 py-0.5 text-center ${sideClr}`}>{t.side}</td>
                  <td className={`px-2 py-0.5 text-center ${lrClr}`} title={lrMatch ? "Lee-Ready ≠ side reportado" : ""}>
                    {t.lee_ready}
                    {lrMatch && <span className="ml-1 text-amber-400">!</span>}
                  </td>
                  <td className={`px-2 py-0.5 text-right ${(t.es_bps ?? 0) > 5 ? "text-amber-400" : "text-zinc-300"}`}>
                    {t.es_bps != null ? fmt(t.es_bps, 1) : "—"}
                  </td>
                  <td className="px-2 py-0.5 text-center">
                    {t.walking === true ? <span className="text-amber-400">●</span> : <span className="text-zinc-700">·</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-zinc-800 px-3 py-1.5 text-[10px] text-zinc-500">
        <span className="text-amber-400">!</span> Lee-Ready ≠ side reportado · <span className="text-amber-400">●</span> walking-the-book (size {">"} top depth)
      </div>
    </div>
  );
}
