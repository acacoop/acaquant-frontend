import { proxyBackend } from "@/lib/proxy-backend";

// Costo Pase (gastos MATBA + ALyC) — panel automático de la tab DATOS.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/derivados/agro/costo-pase" });
}
