"use client";

import { useState } from "react";
import { MMHeader } from "@/components/mm/header";
import { BookL2 } from "@/components/mm/book-l2";
import { Tape } from "@/components/mm/tape";
import { IntradayPanel } from "@/components/mm/intraday";
import { ImpactPanel } from "@/components/mm/impact";
import { SmilePanel } from "@/components/mm/smile";
import { StylizedFactsPanel } from "@/components/mm/stylized-facts";
import { usePoll } from "@/components/mm/use-poll";
import type { LiveResp, TapeResp } from "@/components/mm/types";

const TICKER = "MERV - XMEV - AL30 - CI";
const POLL_LIVE = 1500;
const POLL_TAPE = 2000;

type Tab = "intraday" | "impact" | "smile" | "sf" | "lectura";

export default function MMPage() {
  const [tab, setTab] = useState<Tab>("intraday");

  const liveUrl = `/api/mm/live?ticker=${encodeURIComponent(TICKER)}`;
  const tapeUrl = `/api/mm/tape?ticker=${encodeURIComponent(TICKER)}&ventana_min=30&limit=200`;

  const live = usePoll<LiveResp>(liveUrl, POLL_LIVE);
  const tape = usePoll<TapeResp>(tapeUrl, POLL_TAPE);

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-200">
      <MMHeader data={live.data} loading={live.loading} />

      <div className="grid grid-cols-1 gap-2 p-2 md:grid-cols-2">
        <BookL2 book={live.data?.book ?? null} mid={live.data?.metrics?.mid ?? null} />
        <Tape data={tape.data} loading={tape.loading} error={tape.error} />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden border-t border-zinc-800">
        <div className="flex gap-0 border-b border-zinc-800 bg-zinc-950 px-2">
          <TabBtn active={tab === "intraday"} onClick={() => setTab("intraday")}>
            Intraday
          </TabBtn>
          <TabBtn active={tab === "impact"} onClick={() => setTab("impact")}>
            Impact b/k
          </TabBtn>
          <TabBtn active={tab === "smile"} onClick={() => setTab("smile")}>
            Smile U
          </TabBtn>
          <TabBtn active={tab === "sf"} onClick={() => setTab("sf")}>
            Stylized Facts
          </TabBtn>
          <TabBtn active={tab === "lectura"} onClick={() => setTab("lectura")}>
            Lectura
          </TabBtn>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {tab === "intraday" && <IntradayPanel ticker={TICKER} />}
          {tab === "impact" && <ImpactPanel ticker={TICKER} />}
          {tab === "smile" && <SmilePanel ticker={TICKER} />}
          {tab === "sf" && <StylizedFactsPanel ticker={TICKER} />}
          {tab === "lectura" && <LecturaPanel live={live.data} />}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-950 px-2 py-1 text-[9px] text-zinc-500">
        <span>data · OrderBookL2 + TimeSales</span>
        <span className="ml-auto">book {POLL_LIVE / 1000}s · tape {POLL_TAPE / 1000}s</span>
      </div>
    </div>
  );
}

function TabBtn({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "border-b-2 px-3 py-1.5 text-[10px] uppercase tracking-wide transition " +
        (active
          ? "border-amber-400 text-amber-400"
          : "border-transparent text-zinc-500 hover:text-zinc-300")
      }
    >
      {children}
    </button>
  );
}

function LecturaPanel({ live }: { live: LiveResp | null }) {
  const m = live?.metrics;
  const obi = m?.obi ?? null;
  const microMinusMid = m?.microprice != null && m?.mid != null ? m.microprice - m.mid : null;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Cap 1 — qué dice el book ahora</div>
        <ul className="space-y-1 text-[12px] leading-relaxed text-zinc-300">
          <li>
            · Quoted spread: <span className="text-amber-400">{m?.qs_bps != null ? `${m.qs_bps.toFixed(1)} bps` : "—"}</span> (límite inferior: tick size).
          </li>
          <li>
            · OBI:{" "}
            <span className={obi != null && obi > 0.1 ? "text-emerald-400" : obi != null && obi < -0.1 ? "text-rose-400" : "text-zinc-200"}>
              {obi != null ? obi.toFixed(3) : "—"}
            </span>
            . Más arriba de 0 = presión compradora; más abajo = vendedora.
          </li>
          <li>
            · Microprice − Mid:{" "}
            <span className="text-amber-400">
              {microMinusMid != null ? `${microMinusMid > 0 ? "+" : ""}${(microMinusMid * 1000).toFixed(2)} (×10³)` : "—"}
            </span>
            . El microprice se aleja del mid hacia donde el imbalance espera el próximo trade.
          </li>
        </ul>
      </div>
      <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Cap 2 — modelos detrás del spread</div>
        <ul className="space-y-1 text-[12px] leading-relaxed text-zinc-300">
          <li>
            · <span className="text-zinc-200">Grossman-Miller</span>: spread = 2γσ²/n · i. Crece con aversión al riesgo,
            varianza y inventario; cae con MMs disponibles.
          </li>
          <li>
            · <span className="text-zinc-200">Kyle</span>: λ = (1/2)·σ_v/σ_u. Es el impacto por unidad de order flow;
            empíricamente lo medimos como <span className="text-amber-400">b</span> en el tab Impact.
          </li>
          <li>
            · <span className="text-zinc-200">Glosten-Milgrom</span>: spread crece con la fracción π de informados.
            Su manifestación empírica también es <span className="text-amber-400">b</span> (permanent impact).
          </li>
        </ul>
      </div>
    </div>
  );
}
