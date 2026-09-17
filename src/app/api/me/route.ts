import { proxyBackend } from "@/lib/proxy-backend";

// Identidad del caller (email + role + modules + is_admin). Consumido por el
// layout y por proxy.ts. Todo lo que importa acá (sello firmado, marca de
// invitado) lo hace el helper.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/me" });
}
