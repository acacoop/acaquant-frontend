import { proxyBackend } from "@/lib/proxy-backend";

// Tabla PASE AGRO, live (last_price, oficial, pizarra editada).

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/derivados/agro" });
}
