import { notFound } from "next/navigation";

import { AvAgentView } from "@/components/av-agent-view";
import { getMe } from "@/lib/me";

// AV AGENT — el primer agente de ACAquant (docs/AV_AGENT.md en el backend).
//
// Server component: chequea el módulo `ia` antes de renderizar. El link del
// header ya está oculto para quien no lo tiene; esto cierra el bypass por URL
// directa (defense in depth — el gate REAL es el `_IA` del backend, que monta
// todo /api/ia detrás de require_module("ia")).
export const dynamic = "force-dynamic";

export default async function AvAgentPage() {
  const me = await getMe();
  // Sin backend (dev sin API_URL, o fetch fallido) modules queda null → se
  // renderiza igual, como el resto de las vistas. En prod con backend OK y sin
  // el módulo → 404.
  const isProd = !!process.env.API_URL;
  const modules = me?.modules ?? null;

  if (isProd && modules !== null && !modules.includes("ia")) {
    notFound();
  }

  return <AvAgentView />;
}
