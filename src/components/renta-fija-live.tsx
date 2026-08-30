"use client";

import { useMemo, useState } from "react";
import type {
  BreakevenDoc,
  FairValueDoc,
  ForwardDoc,
  ForwardZscoreDoc,
} from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { FilterBtn, fmtHoraAR } from "@/components/ui";
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
  forwards: ForwardDoc[];
  breakevens: BreakevenDoc[];
}

interface Props {
  initialForwards:       ForwardDoc[];
  forwardsZscore:        ForwardZscoreDoc[];
  fairValueInicial?:     Record<string, FairValueDoc>;
  curvasVista?:          CurvasVista;
}

export function RentaFijaLiveView({
  initialForwards,
  forwardsZscore,
  fairValueInicial,
  curvasVista,
}: Props) {
  // ⚠ MUST be useMemo: usePoll dispara un setState si initial cambia de
  // identidad. Sin useMemo, este objeto se recrea en cada render, lo que
  // disparaba el setState, lo que causa re-render → loop infinito
  // (React error #185 "Maximum update depth exceeded").
  const initialSnapshot: SnapshotLive = useMemo(() => ({
    forwards:   initialForwards,
    breakevens: [],
  }), [initialForwards]);

  const { data: snapshot, lastAt } = usePoll<SnapshotLive>(
    "/api/cotizaciones/snapshot-live", initialSnapshot, POLL_SNAPSHOT_MS,
  );
  const forwards   = snapshot.forwards;


  // `lastAt === 0` → solo SSR todavía. Mismo timestamp para los 3 paneles:
  // el momento del fetch consolidado.
  const sub = lastAt > 0 ? fmtHoraAR(lastAt) : "";

  // TABS (rediseño 2026-08-15, docs/RENTA_FIJA.md §0). Antes era UNA pantalla
  // con los 4 paneles a la vez: se pagaban los 9 fetches y los 4,5 MB aunque
  // mirases uno solo. Los paneles viejos siguen intactos, cada uno en su tab.
  const [tab, setTab] = useState<"curvas" | "forwards" | "clasica">(
    curvasVista ? "curvas" : "clasica",
  );

  // Las TABS se pasan a la tab activa para que compartan fila con SUS controles
  // (el filtro de emisor en CURVAS, los modos en FORWARDS). Una fila de tabs +
  // otra de filtros le comía alto a los datos, que es lo que la vista da.
  const tabs = (
    <>
      {curvasVista && (
        <FilterBtn active={tab === "curvas"} onClick={() => setTab("curvas")}>
          CURVAS
        </FilterBtn>
      )}
      <FilterBtn active={tab === "forwards"} onClick={() => setTab("forwards")}>
        FORWARDS
      </FilterBtn>
      <span className="w-px h-3 bg-[var(--t-border-2)] mx-1" />
    </>
  );

  return (
    <div className="h-full min-h-0 p-3 flex flex-col gap-2">
      {tab === "curvas" && curvasVista ? (
        <CurvasTab
          barra={tabs}
          inicial={curvasVista}
          fairValueInicial={fairValueInicial}
        />
      ) : (
        <>
          <div className="flex items-center gap-2 shrink-0 text-xs">
            {tabs}
            {sub && <span className="ml-auto text-[var(--t-text-2)]">{sub}</span>}
          </div>
          <ForwardsTab forwards={forwards} zscoreInicial={forwardsZscore} />
        </>
      )}
    </div>
  );
}
