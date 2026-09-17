import { proxyBackend } from "@/lib/proxy-backend";

// Proxy live — no cachear en ninguna capa. El frontend polea cada 5 s y el
// backend ya tiene @cached(ttl=5); un edge cache dejaba la vista estática.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/cotizaciones/argy" });
}
