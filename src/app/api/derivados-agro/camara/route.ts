import { proxyBackend } from "@/lib/proxy-backend";

// Los 5 cereales de la Cámara Arbitral (precio_ars + precio_usd manuales).

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/derivados/agro/camara" });
}
