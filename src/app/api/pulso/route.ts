import { proxyBackend } from "@/lib/proxy-backend";

// EL PULSO DEL CLIENTE (AGENT.md §0.dg): una pantalla que lleva más de un
// minuto sin poder refrescar lo dice acá. Con identidad: el backend guarda
// quién estaba ciego.

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 10;

export function POST(req: Request) {
  return proxyBackend(req, { path: "/api/pulso" });
}
