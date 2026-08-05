import { safeFetch } from "@/lib/api";
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
    breakevens,
    breakevensHist,
    forwardsHist,
    forwardsZscore,
    fairValueTF,
    fairValueCER,
  ] = await Promise.all([
    safeFetch<RentaFijaDoc[]>("/api/cotizaciones/renta-fija", [], 10),
    safeFetch<ForwardDoc[]>("/api/cotizaciones/forwards", [], 30),
    safeFetch<FlujoTicker[]>("/api/titulos/flujos", [], 60),
    safeFetch<BreakevenDoc[]>("/api/cotizaciones/breakevens", [], 30),
    safeFetch<BreakevenHistDoc[]>("/api/cotizaciones/historico/breakevens", [], 300),
    safeFetch<ForwardHistDoc[]>("/api/cotizaciones/historico/forwards", [], 300),
    safeFetch<ForwardZscoreDoc[]>("/api/cotizaciones/forwards-zscore", [], 300),
    safeFetch<FairValueDoc | { error: string }>("/api/cotizaciones/fair-value?curva=tasa_fija", { error: "init" }, 60),
    safeFetch<FairValueDoc | { error: string }>("/api/cotizaciones/fair-value?curva=cer", { error: "init" }, 60),
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
      initialBreakevens={breakevens}
      flujos={allFlujos}
      breakevensHist={breakevensHist}
      forwardsHist={forwardsHist}
      forwardsZscore={forwardsZscore}
      fairValueInicial={fairValueInicial}
    />
  );
}
