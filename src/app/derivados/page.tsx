import { apiFetch } from "@/lib/api";
import { DerivadosShell } from "@/components/derivados-shell";
import type { OpcionDoc } from "@/lib/estrategias";
import { getMe } from "@/lib/me";

export const dynamic = "force-dynamic";

interface Meta {
  tasa: number;
  vr_local: number;
  vr_adr: number;
  updated_at?: string;
}

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

const AGRO_EMPTY: AgroResp = {
  oficial: { value: null, ts: null, source: "none" },
  ts: "",
  bloques: [
    { commodity: "TRIGO", rows: [] },
    { commodity: "MAIZ", rows: [] },
    { commodity: "SOJA", rows: [] },
  ],
};

async function safeFetch<T>(path: string, fallback: T, revalidate = 0): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate });
  } catch {
    return fallback;
  }
}

export default async function DerivadosPage() {
  const [opciones, meta, me, agro] = await Promise.all([
    safeFetch<OpcionDoc[]>("/api/cotizaciones/opciones", [], 10),
    safeFetch<Meta>(
      "/api/cotizaciones/opciones/meta",
      { tasa: 0.242, vr_local: 0, vr_adr: 0 },
      30
    ),
    getMe(),
    safeFetch<AgroResp>("/api/derivados/agro", AGRO_EMPTY, 0),
  ]);

  const role = me?.role ?? "sales";
  const canEditAgro = role === "trader" || role === "admin";

  return (
    <DerivadosShell
      opcionesDocs={opciones}
      opcionesMeta={meta}
      isAdmin={me?.is_admin ?? false}
      agroInitial={agro}
      canEditAgro={canEditAgro}
    />
  );
}
