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

async function safeFetch<T>(path: string, fallback: T, revalidate = 0): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate });
  } catch {
    return fallback;
  }
}

export default async function DerivadosPage() {
  // Derivados ahora es SOLO Opciones — Agro y Sintéticos se promovieron a
  // módulos top-level (/agro y /sinteticos). Esta page se queda con la meta
  // de Opciones; la chain se polleea client-side al montar.
  const me = await getMe();
  const isAdmin = me?.is_admin ?? false;

  const meta = await safeFetch<Meta>(
    "/api/cotizaciones/opciones/meta",
    { tasa: 0.242, vr_local: 0, vr_adr: 0 },
    30,
  );
  const opciones: OpcionDoc[] = [];

  return (
    <DerivadosShell
      opcionesDocs={opciones}
      opcionesMeta={meta}
      isAdmin={isAdmin}
    />
  );
}
