import { proxyBackend } from "@/lib/proxy-backend";

// Precio disponible descontado a caución 7D por commodity (Cámara × tasa 7D).

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/derivados/agro/descuento-caucion" });
}
