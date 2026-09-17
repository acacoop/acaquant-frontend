import { proxyBackend } from "@/lib/proxy-backend";

// Los 5 cereales de la Cámara de Bahía (solo precio_usd manual; la ARS se deriva).

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/derivados/agro/camara-bahia" });
}
