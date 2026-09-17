import { proxyBackend, queryDe } from "@/lib/proxy-backend";

// Títulos/Mercado, live: el polling ve movimientos nuevos en cuanto entran.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: `/api/back-office/titulos-mercado${queryDe(req)}` });
}
