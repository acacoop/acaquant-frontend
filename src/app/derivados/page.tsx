import { apiFetch } from "@/lib/api";
import { DerivadosView } from "@/components/derivados-view";
import type { OpcionDoc } from "@/lib/estrategias";
import { getMe } from "@/lib/me";

export const dynamic = "force-dynamic";

interface Meta {
  tasa: number;
  vr_local: number;
  vr_adr: number;
  updated_at?: string;
}

async function safeFetch<T>(path: string, fallback: T, revalidate = 0): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate });
  } catch {
    return fallback;
  }
}

export default async function DerivadosPage() {
  const [opciones, meta, me] = await Promise.all([
    safeFetch<OpcionDoc[]>("/api/cotizaciones/opciones", [], 10),
    safeFetch<Meta>(
      "/api/cotizaciones/opciones/meta",
      { tasa: 0.242, vr_local: 0, vr_adr: 0 },
      30
    ),
    getMe(),
  ]);

  return (
    <DerivadosView
      docs={opciones}
      metaInicial={meta}
      isAdmin={me?.is_admin ?? false}
    />
  );
}
