"use client";

import { useMemo, useState } from "react";
import type {
  BreakevenDoc,
  BreakevenHistDoc,
  FairValueDoc,
  FlujoTicker,
  ForwardDoc,
  ForwardHistDoc,
  ForwardZscoreDoc,
  RentaFijaDoc,
} from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { FilterBtn, Panel, fmtHoraAR } from "@/components/ui";
import { RentaFijaTable } from "@/components/renta-fija-table";
import { ForwardsPanel } from "@/components/forwards-panel";
import { CurvasChart } from "@/components/curvas-chart";
import { BreakevensBlock } from "@/components/breakevens-block";
import { CurvasTab } from "@/components/curvas-tab";
import { ForwardsTab } from "@/components/forwards-tab";
import type { CurvasVista } from "@/lib/types";

// Polling unificado: 1 sola request al endpoint /snapshot-live cada 5s
// que devuelve {renta_fija, forwards, breakevens}. Cada bloque viene del
// cache server-side con su propio TTL (renta_fija=5s, forwards=30s,
// breakevens=30s), así que el cliente recibe la frescura correcta de
// cada bloque sin importar la cadencia del poll. Antes eran 3 polls
// separados (5/15/15s) — con 8 users la carga al backend cae ~70%.
const POLL_SNAPSHOT_MS = 5_000;

interface SnapshotLive {
  renta_fija: RentaFijaDoc[];
  forwards: ForwardDoc[];
  breakevens: BreakevenDoc[];
}

interface Props {
  initialRentaFija:      RentaFijaDoc[];
  initialForwards:       ForwardDoc[];
  initialBreakevens:     BreakevenDoc[];
  flujos:                FlujoTicker[];
  breakevensHist:        BreakevenHistDoc[];
  forwardsHist:          ForwardHistDoc[];
  forwardsZscore:        ForwardZscoreDoc[];
  fairValueInicial?:     Record<string, FairValueDoc>;
  curvasVista?:          CurvasVista;
}

export function RentaFijaLiveView({
  initialRentaFija,
  initialForwards,
  initialBreakevens,
  flujos,
  breakevensHist,
  forwardsHist,
  forwardsZscore,
  fairValueInicial,
  curvasVista,
}: Props) {
  // ⚠ MUST be useMemo: usePoll dispara un setState si initial cambia de
  // identidad. Sin useMemo, este objeto se recrea en cada render, lo que
  // disparaba el setState, lo que causa re-render → loop infinito
  // (React error #185 "Maximum update depth exceeded").
  const initialSnapshot: SnapshotLive = useMemo(() => ({
    renta_fija: initialRentaFija,
    forwards:   initialForwards,
    breakevens: initialBreakevens,
  }), [initialRentaFija, initialForwards, initialBreakevens]);

  const { data: snapshot, lastAt } = usePoll<SnapshotLive>(
    "/api/cotizaciones/snapshot-live", initialSnapshot, POLL_SNAPSHOT_MS,
  );
  const rentaFija  = snapshot.renta_fija;
  const forwards   = snapshot.forwards;
  const breakevens = snapshot.breakevens;

  const pares = breakevens[0]?.pares || [];

  // `lastAt === 0` → solo SSR todavía. Mismo timestamp para los 3 paneles:
  // el momento del fetch consolidado.
  const sub = lastAt > 0 ? fmtHoraAR(lastAt) : "";

  // TABS (rediseño 2026-08-15, docs/RENTA_FIJA.md §0). Antes era UNA pantalla
  // con los 4 paneles a la vez: se pagaban los 9 fetches y los 4,5 MB aunque
  // mirases uno solo. Los paneles viejos siguen intactos, cada uno en su tab.
  const [tab, setTab] = useState<"curvas" | "forwards" | "clasica">(
    curvasVista ? "curvas" : "clasica",
  );

  return (
    <div className="h-full min-h-0 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 shrink-0">
        {curvasVista && (
          <FilterBtn active={tab === "curvas"} onClick={() => setTab("curvas")}>
            CURVAS
          </FilterBtn>
        )}
        <FilterBtn active={tab === "forwards"} onClick={() => setTab("forwards")}>
          FORWARDS
        </FilterBtn>
        <FilterBtn active={tab === "clasica"} onClick={() => setTab("clasica")}>
          CLÁSICA
        </FilterBtn>
        {sub && <span className="ml-auto text-xs text-[var(--t-text-2)]">{sub}</span>}
      </div>

      {tab === "curvas" && curvasVista ? (
        <CurvasTab
          inicial={curvasVista}
          forwards={forwards}
          flujos={flujos}
          fairValueInicial={fairValueInicial}
        />
      ) : tab === "forwards" ? (
        <ForwardsTab
          forwards={forwards}
          historico={forwardsHist}
          zscoreInicial={forwardsZscore}
        />
      ) : (
        // La vista de SIEMPRE, sin tocar un panel. Se conserva entera mientras
        // la tab nueva se valida en uso real; el paso 4 la reemplaza por las
        // tabs FORWARDS y BREAKEVENS con su rediseño.
        <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
          <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <Panel title="RENTA FIJA" count={rentaFija.length} sub={sub} expandable>
              <RentaFijaTable data={rentaFija} flujos={flujos} forwards={forwards} />
            </Panel>
            <Panel title="CURVAS" sub={sub} fill expandable>
              <CurvasChart forwards={forwards} flujos={flujos} fairValueInicial={fairValueInicial} />
            </Panel>
          </div>
          <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <Panel title="FORWARDS" sub={sub} expandable>
              <ForwardsPanel forwards={forwards} historico={forwardsHist} zscoreInicial={forwardsZscore} />
            </Panel>
            <Panel title="BREAKEVENS" sub={sub} fill expandable>
              <BreakevensBlock pares={pares} historico={breakevensHist} />
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
