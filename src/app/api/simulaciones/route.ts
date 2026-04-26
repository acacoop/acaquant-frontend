import { proxyToBackend } from "@/lib/proxy-backend";

// GET /api/simulaciones — lista las simulaciones del usuario.
export async function GET(req: Request) {
  return proxyToBackend(req, { path: "/api/simulaciones" });
}

// POST /api/simulaciones — crea una simulación nueva.
export async function POST(req: Request) {
  const body = await req.text();
  return proxyToBackend(req, {
    path: "/api/simulaciones",
    method: "POST",
    body,
  });
}
