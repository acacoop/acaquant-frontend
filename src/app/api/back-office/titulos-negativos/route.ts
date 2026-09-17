import { proxyBackend, queryDe } from "@/lib/proxy-backend";

// CONTROL TÍTULOS NEGATIVOS (posición T0 con nominales < 0). La vista pollea:
// con cache, "no hay negativos" podría ser la respuesta de hace cinco minutos.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: `/api/back-office/titulos-negativos${queryDe(req)}` });
}
