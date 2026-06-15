import { RetornoTotalView } from "@/components/retorno-total-view";

export const dynamic = "force-dynamic";

export default function RetornoPage() {
  // TRADE LAB se movió a /trade-lab (vista propia, admin-only). Esta vista
  // (COBERTURAS + herramientas RF) queda para todos los roles con `estrategia`.
  return <RetornoTotalView />;
}
