import { proxyToBackend } from "@/lib/proxy-backend";

interface Params {
  params: Promise<{ id: string }>;
}

// GET /api/simulaciones/{id} — trae una simulación.
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  return proxyToBackend(req, { path: `/api/simulaciones/${encodeURIComponent(id)}` });
}

// PUT /api/simulaciones/{id} — actualiza nombre y/o posiciones.
export async function PUT(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.text();
  return proxyToBackend(req, {
    path: `/api/simulaciones/${encodeURIComponent(id)}`,
    method: "PUT",
    body,
  });
}

// DELETE /api/simulaciones/{id} — elimina la simulación.
export async function DELETE(req: Request, { params }: Params) {
  const { id } = await params;
  return proxyToBackend(req, {
    path: `/api/simulaciones/${encodeURIComponent(id)}`,
    method: "DELETE",
  });
}
