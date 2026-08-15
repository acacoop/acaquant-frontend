import { safeFetch } from "@/lib/api";
import type {
  FairValueDoc,
  FlujoTicker,
  ForwardDoc,
  ForwardZscoreDoc,
  RentaFijaDoc,
  CurvasVista,
} from "@/lib/types";
import { RentaFijaLiveView } from "@/components/renta-fija-live";

export const dynamic = "force-dynamic";

export default async function Home() {
  // SSR inicial — carga rápida con datos del último snapshot. El polling
  // client-side en RentaFijaLiveView mantiene los 3 datasets live (renta
  // fija, forwards, breakevens) sin depender de AutoRefresh global.
  const [
    rentaFija,
    forwards,
    flujos,
    forwardsZscore,
    fairValueTF,
    fairValueCER,
    curvasVista,
  ] = await Promise.all([
    safeFetch<RentaFijaDoc[]>("/api/cotizaciones/renta-fija", [], 10),
    safeFetch<ForwardDoc[]>("/api/cotizaciones/forwards", [], 30),
    safeFetch<FlujoTicker[]>("/api/titulos/flujos", [], 60),
    safeFetch<ForwardZscoreDoc[]>("/api/cotizaciones/forwards-zscore", [], 300),
    safeFetch<FairValueDoc | { error: string }>("/api/cotizaciones/fair-value?curva=tasa_fija", { error: "init" }, 60),
    safeFetch<FairValueDoc | { error: string }>("/api/cotizaciones/fair-value?curva=cer", { error: "init" }, 60),
    // Tab CURVAS del rediseño: UN request con los bonos ya clasificados
    // (docs/RENTA_FIJA.md §0). Si falla, cae a null y la vista arranca en la
    // tab FORWARDS con los paneles de siempre — no rompe nada.
    safeFetch<CurvasVista | null>("/api/cotizaciones/curvas-vista", null, 10),
  ]);

  const allFlujos: FlujoTicker[] = flujos.map((f) => ({
    ticker: f.ticker,
    curva: f.curva,
    curva_efectiva: f.curva_efectiva,
    cer_fijado: f.cer_fijado,
    fecha_vencimiento: f.fecha_vencimiento,
  }));

  const fairValueInicial: Record<string, FairValueDoc> = {};
  if ("bonos" in fairValueTF) fairValueInicial.tasa_fija = fairValueTF;
  if ("bonos" in fairValueCER) fairValueInicial.cer = fairValueCER;

  return (
    <RentaFijaLiveView
      initialRentaFija={rentaFija}
      initialForwards={forwards}
      flujos={allFlujos}
      forwardsZscore={forwardsZscore}
      fairValueInicial={fairValueInicial}
      curvasVista={curvasVista?.bonos ? curvasVista : undefined}
    />
  );
}
