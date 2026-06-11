import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy de Tenencia Valorizada (cartera HD, cuentas propias 100/255/256).
// Lee el rollup Valuaciones.TenenciaHD. Catch-all opcional: cubre tanto
// /tenencia-hd (serie diaria) como /tenencia-hd/posiciones?fecha=...
export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const sub = path?.length ? `/${path.join("/")}` : "";
  const url = new URL(req.url);
  try {
    const data = await apiFetch<unknown>(`/api/back-office/tenencia-hd${sub}${url.search}`);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
