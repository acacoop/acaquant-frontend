import { notFound } from "next/navigation";

import { AcaView } from "@/components/aca-view";
import { getMe } from "@/lib/me";

// ACA — RESUMEN EJECUTIVO de la cartera propia (docs/ACA.md en el backend).
//
// Server component: chequea el módulo `aca` antes de renderizar. El link del
// header ya está oculto para quien no lo tiene; esto cierra el bypass por URL
// directa (defense in depth — el gate REAL es require_lectura_aca en el backend,
// que además suma a los escritores de la mesa aunque no tengan el rol).
export const dynamic = "force-dynamic";

export default async function AcaPage() {
  const me = await getMe();
  // Sin backend (dev sin API_URL, o fetch fallido) modules queda null → se
  // renderiza igual, como el resto de las vistas. En prod con backend OK y sin
  // el módulo → 404.
  const isProd = !!process.env.API_URL;
  const modules = me?.modules ?? null;

  if (isProd && modules !== null && !modules.includes("aca")) {
    notFound();
  }

  return <AcaView />;
}
