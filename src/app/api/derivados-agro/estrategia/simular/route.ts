import { proxyBackend } from "@/lib/proxy-backend";

// Simulador de estrategias agro. El gate admin lo aplica el backend.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function POST(req: Request) {
  return proxyBackend(req, { path: "/api/derivados/agro/estrategia/simular" });
}
