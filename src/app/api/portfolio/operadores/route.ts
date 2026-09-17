import { proxyBackend } from "@/lib/proxy-backend";

// Operadores para el filtro madre de la vista AUM.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/portfolio/operadores" });
}
