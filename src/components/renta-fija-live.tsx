"use client";

import type {
  BreakevenDoc,
  BreakevenHistDoc,
  FlujoTicker,
  ForwardDoc,
  ForwardHistDoc,
  ForwardZscoreDoc,
  RentaFijaDoc,
} from "@/lib/types";
import { usePoll } from "@/lib/use-poll";
import { Panel, fmtHoraAR } from "@/components/ui";
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
  forwardsZscore:        ForwardZscoreDoc[];
}

export function RentaFijaLiveView({
  initialRentaFija,
  initialForwards,
  initialBreakevens,
  flujos,
  breakevensHist,
  forwardsHist,
  forwardsZscore,
}: Props) {
  const { data: rentaFija,  lastAt: atRenta } = usePoll<RentaFijaDoc[]>("/api/cotizaciones/renta-fija", initialRentaFija, POLL_RENTA_MS);
  const { data: forwards,   lastAt: atFwd   } = usePoll<ForwardDoc[]>("/api/cotizaciones/forwards",    initialForwards,  POLL_FORWARDS_MS);
  const { data: breakevens, lastAt: atBe    } = usePoll<BreakevenDoc[]>("/api/cotizaciones/breakevens", initialBreakevens, POLL_BREAKEVENS_MS);

  const pares = breakevens[0]?.pares || [];

  // `lastAt === 0` → todavía no hubo ningún poll (solo SSR). En ese caso
  // caemos al timestamp del backend para no mostrar "00:00:00".
  const subRenta = atRenta > 0 ? fmtHoraAR(atRenta) : "";
  const subFwd   = atFwd > 0 ? fmtHoraAR(atFwd) : "";
  const subBe    = atBe > 0 ? fmtHoraAR(atBe) : "";

  return (
    <div className="h-full min-h-0 p-3">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
        <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Panel title="RENTA FIJA" count={rentaFija.length} sub={subRenta} expandable>
            <RentaFijaTable data={rentaFija} flujos={flujos} forwards={forwards} />
          </Panel>

          <Panel title="CURVAS" sub={subFwd} fill expandable>
            <CurvasChart forwards={forwards} flujos={flujos} />
          </Panel>
        </div>

        <div className="min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <Panel title="FORWARDS" sub={subFwd} expandable>
            <ForwardsPanel forwards={forwards} historico={forwardsHist} zscoreInicial={forwardsZscore} />
          </Panel>

          <Panel title="BREAKEVENS" sub={subBe} fill expandable>
            <BreakevensBlock pares={pares} historico={breakevensHist} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
