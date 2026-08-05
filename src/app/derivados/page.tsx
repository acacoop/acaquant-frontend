import { safeFetch } from "@/lib/api";
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

export default async function DerivadosPage() {
  // Derivados ahora es SOLO Opciones — Agro y Sintéticos se promovieron a
  // módulos top-level (/agro y /sinteticos). Esta page se queda con la meta
  // de Opciones; la chain se polleea client-side al montar.
  // En paralelo: me y meta son independientes (antes iban en serie → 2 RTT).
  const [me, meta] = await Promise.all([
    getMe(),
    safeFetch<Meta>(
      "/api/cotizaciones/opciones/meta",
      { tasa: 0.242, vr_local: 0, vr_adr: 0 },
      30,
    ),
  ]);
  const isAdmin = me?.is_admin ?? false;
  const opciones: OpcionDoc[] = [];

  return (
    <DerivadosShell
      opcionesDocs={opciones}
      opcionesMeta={meta}
      isAdmin={isAdmin}
    />
  );
}
