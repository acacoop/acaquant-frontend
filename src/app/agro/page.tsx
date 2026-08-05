import { safeFetch } from "@/lib/api";
import { AgroShell } from "@/components/agro-shell";

export const dynamic = "force-dynamic";

interface AgroResp {
  oficial: { value: number | null; ts: string | null; source: string };
  ts: string;
  bloques: {
    commodity: "TRIGO" | "MAIZ" | "SOJA";
    rows: {
      tipo: "pizarra" | "dispo" | "futuro";
      ticker?: string;
      vencimiento: string | null;
      posicion: string;
      us: number | null;
      pase: number | null;
      ars: number | null;
      tnav_us: number | null;
    }[];
  }[];
}

export default async function AgroPage() {
  // SSR del PASE AGRO (tab Mercado) — el resto (Mejoras Dispo, Datos)
  // se carga client-side al entrar a cada tab.
  const agro = await safeFetch<AgroResp | null>("/api/derivados/agro", null, 0);
  return <AgroShell agroInitial={agro} />;
}
