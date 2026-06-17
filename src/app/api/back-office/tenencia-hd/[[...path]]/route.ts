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

// POST /tenencia-hd/precio → edita a mano el precio de una unidad de un día
// (recalcula la valuación HD). Sin este handler, el POST choca con un 405 y el
// front muestra "error de red".
export async function POST(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const sub = path?.length ? `/${path.join("/")}` : "";
  try {
    const body = await req.text();
    const data = await apiFetch<unknown>(`/api/back-office/tenencia-hd${sub}`, {
      method: "POST",
      body,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
