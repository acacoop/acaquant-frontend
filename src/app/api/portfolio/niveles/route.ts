import { proxyBackend } from "@/lib/proxy-backend";

// Combos (operador_email, nivel_1, nivel_2, nivel_3, nivel_5) de las cuentas
// activas: pueblan y CRUZAN los filtros madre de NEGOCIO · AUM.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/portfolio/niveles" });
}
