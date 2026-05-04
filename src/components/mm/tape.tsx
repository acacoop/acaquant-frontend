"use client";

import { InfoIcon } from "@/components/info-icon";
import { fmt, fmtTimeAr } from "./fmt";
import { tips } from "./tips";
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
      <div className="flex items-center justify-between border-b border-zinc-800 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
        <span>Tape · TimeSales</span>
        <span className="text-[10px] font-normal text-zinc-500">
          {data ? `${data.n} · últ ${Math.min(CAP, trades.length)}` : ""}
        </span>
      </div>
      <div className="max-h-[210px] overflow-auto">
        <table className="w-full text-[10px] leading-tight tabular-nums">
          <thead className="sticky top-0 bg-zinc-950 text-[9px] uppercase tracking-wide text-zinc-500">
            <tr className="border-b border-zinc-800">
              <th className="px-2 py-0.5 text-left font-normal">Hora</th>
              <th className="px-2 py-0.5 text-right font-normal">Px</th>
              <th className="px-2 py-0.5 text-right font-normal">Sz</th>
              <th className="px-2 py-0.5 text-center font-normal">Sd</th>
              <th className="px-2 py-0.5 text-center font-normal">
                <span className="inline-flex items-center gap-1">LR <InfoIcon tip={tips.leeReady} width="340px" align="right" /></span>
              </th>
              <th className="px-2 py-0.5 text-right font-normal">
                <span className="inline-flex items-center gap-1">ES bps <InfoIcon tip={tips.effectiveSpread} width="340px" align="right" /></span>
              </th>
              <th className="px-2 py-0.5 text-center font-normal">
                <span className="inline-flex items-center gap-1">W <InfoIcon tip={tips.walking} width="340px" align="right" /></span>
              </th>
            </tr>
          </thead>
          <tbody>
            {error && (
              <tr>
                <td colSpan={7} className="px-2 py-2 text-center text-rose-400">
                  {error}
                </td>
              </tr>
            )}
            {loading && trades.length === 0 && !error && (
              <tr>
                <td colSpan={7} className="px-2 py-2 text-center text-zinc-500">
                  loading…
                </td>
              </tr>
            )}
            {!loading && !error && trades.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-2 text-center text-zinc-500">
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
                  <td className="px-2 py-0 text-zinc-400">{fmtTimeAr(t.timestamp)}</td>
                  <td className="px-2 py-0 text-right text-zinc-100">{fmt(t.price, 3)}</td>
                  <td className="px-2 py-0 text-right text-zinc-300">{fmt(t.size, 0)}</td>
                  <td className={`px-2 py-0 text-center ${sideClr}`}>{t.side?.[0] ?? "—"}</td>
                  <td className={`px-2 py-0 text-center ${lrClr}`} title={lrMatch ? "Lee-Ready ≠ side reportado" : ""}>
                    {t.lee_ready?.[0] ?? "—"}
                    {lrMatch && <span className="ml-0.5 text-amber-400">!</span>}
                  </td>
                  <td className={`px-2 py-0 text-right ${(t.es_bps ?? 0) > 5 ? "text-amber-400" : "text-zinc-300"}`}>
                    {t.es_bps != null ? fmt(t.es_bps, 1) : "—"}
                  </td>
                  <td className="px-2 py-0 text-center">
                    {t.walking === true ? <span className="text-amber-400">●</span> : <span className="text-zinc-700">·</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
