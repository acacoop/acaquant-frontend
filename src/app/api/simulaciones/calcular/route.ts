import { proxyToBackend } from "@/lib/proxy-backend";

// POST /api/simulaciones/calcular — devuelve cashflows + métricas + composición
// para un set de posiciones (sin guardar). Lo llama el frontend mientras el
// usuario edita la cartera para preview live.
export async function POST(req: Request) {
  const body = await req.text();
  return proxyToBackend(req, {
    path: "/api/simulaciones/calcular",
    method: "POST",
    body,
  });
}
