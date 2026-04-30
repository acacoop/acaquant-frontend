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

async function safeFetch<T>(path: string, fallback: T, revalidate = 0): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate });
  } catch {
    return fallback;
  }
}

export default async function DerivadosPage() {
  // Resolvemos /me primero para decidir si fetchear agro: el endpoint está
  // gated a admin en backend, no tiene sentido llamarlo si no es admin (y
  // ahorramos el 403).
  const me = await getMe();
  const isAdmin = me?.is_admin ?? false;

  // Las opciones (chain) NO se fetchean en SSR — la pantalla la usa muy poca
  // gente y cargar la chain en cada navegación a /derivados gasta cómputo
  // Vercel sin necesidad. El cliente (DerivadosView con usePoll
  // fetchOnMount=true) hace el primer fetch al montar la sub-tab. Si el
  // user solo va a ver agro, opciones nunca se compula.
  const [meta, agro] = await Promise.all([
    safeFetch<Meta>(
      "/api/cotizaciones/opciones/meta",
      { tasa: 0.242, vr_local: 0, vr_adr: 0 },
      30
    ),
    isAdmin ? safeFetch<AgroResp | null>("/api/derivados/agro", null, 0) : Promise.resolve(null),
  ]);
  const opciones: OpcionDoc[] = [];

  return (
    <DerivadosShell
      opcionesDocs={opciones}
      opcionesMeta={meta}
      isAdmin={isAdmin}
      agroInitial={agro}
      canEditAgro={isAdmin}
      showAgroTab={isAdmin}
    />
  );
}
