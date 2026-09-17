import { proxyBackend } from "@/lib/proxy-backend";

// Tabla de sintéticos, live (precios del bono / del futuro / SPOT).

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/derivados/sinteticos" });
}
