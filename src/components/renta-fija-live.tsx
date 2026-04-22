"use client";

import { useEffect, useRef, useState } from "react";
import type {
  BreakevenDoc,
  BreakevenHistDoc,
  FlujoTicker,
  ForwardDoc,
  ForwardHistDoc,
  RentaFijaDoc,
} from "@/lib/types";
import { Panel, fmtTs } from "@/components/ui";
import { RentaFijaTable } from "@/components/renta-fija-table";
import { ForwardsPanel } from "@/components/forwards-panel";
import { CurvasChart } from "@/components/curvas-chart";
import { BreakevensBlock } from "@/components/breakevens-block";

// Intervalos de polling, alineados con la cadencia del motor:
//  - renta-fija   → MarketSnapshot se replacea cada 1 s
//  - forwards     → ForwardsLive se recalcula cada 30 s
//  - breakevens   → BreakevensLive se recalcula cada 30 s
// Los históricos no se re-pollean: cambian solo al cierre.
const POLL_RENTA_MS       = 5_000;
const POLL_FORWARDS_MS    = 15_000;
const POLL_BREAKEVENS_MS  = 15_000;

interface Props {
  initialRentaFija:      RentaFijaDoc[];
  initialForwards:       ForwardDoc[];
  initialBreakevens:     BreakevenDoc[];
  flujos:                FlujoTicker[];
  breakevensHist:        BreakevenHistDoc[];
  forwardsHist:          ForwardHistDoc[];
}

/** Hook simple de polling que mantiene el initialData como fallback. */
function usePoll<T>(endpoint: string, initial: T, intervalMs: number): T {
  const [data, setData] = useState<T>(initial);
  const initialRef = useRef(initial);

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const r = await fetch(endpoint, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as T;
        if (alive) setData(j);
      } catch {
        // mantener data vieja si falló un poll puntual
      }
    }

    // No disparamos tick inmediato: el initialData del SSR ya es reciente.
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [endpoint, intervalMs]);

  // Si initial cambia de verdad (navigate + SSR otra vez), resetear.
  useEffect(() => {
    if (initial !== initialRef.current) {
      initialRef.current = initial;
      setData(initial);
    }
  }, [initial]);

  return data;
}

export function RentaFijaLiveView({
  initialRentaFija,
  initialForwards,
  initialBreakevens,
  flujos,
  breakevensHist,
  forwardsHist,
}: Props) {
  const rentaFija  = usePoll<RentaFijaDoc[]>("/api/cotizaciones/renta-fija", initialRentaFija, POLL_RENTA_MS);
  const forwards   = usePoll<ForwardDoc[]>("/api/cotizaciones/forwards",    initialForwards,  POLL_FORWARDS_MS);
  const breakevens = usePoll<BreakevenDoc[]>("/api/cotizaciones/breakevens", initialBreakevens, POLL_BREAKEVENS_MS);

  const pares = breakevens[0]?.pares || [];
  const breakevensTs = breakevens[0]?.updated_at;

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Panel title="RENTA FIJA" count={rentaFija.length} expandable>
            <RentaFijaTable data={rentaFija} flujos={flujos} forwards={forwards} />
          </Panel>

          <Panel title="CURVAS" fill expandable>
            <CurvasChart forwards={forwards} flujos={flujos} />
          </Panel>
        </div>

        <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Panel title="FORWARDS" expandable>
            <ForwardsPanel forwards={forwards} historico={forwardsHist} />
          </Panel>

          <Panel
            title="BREAKEVENS"
            sub={breakevensTs ? fmtTs(breakevensTs) : ""}
            fill
            expandable
          >
            <BreakevensBlock pares={pares} historico={breakevensHist} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
