import { proxyBackend } from "@/lib/proxy-backend";

// Proxy live — ver /api/argy: el edge cache pisaba el polling del cliente.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/cotizaciones/futuros-dlr" });
}
