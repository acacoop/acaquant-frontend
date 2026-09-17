import { proxyBackend } from "@/lib/proxy-backend";

// Tasas manuales ON / Pagaré (globales) de la tab DATOS. Alimentan el "Pase
// con Cobertura".

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/derivados/agro/tasas-cobertura" });
}

// PATCH: validación + audit en el backend.
export function PATCH(req: Request) {
  return proxyBackend(req, { path: "/api/derivados/agro/tasas-cobertura" });
}
