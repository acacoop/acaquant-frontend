import { proxyBackend } from "@/lib/proxy-backend";

// Mejoras Precio Dispo — BAHÍA (el disponible sale de la Cámara de Bahía).

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/derivados/agro/mejoras-dispo-bahia" });
}
