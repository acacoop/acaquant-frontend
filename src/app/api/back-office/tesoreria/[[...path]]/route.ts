import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy de Tesorería (Back Office). Live contra Aunesa (ingresos/egresos del día).
// Catch-all opcional: hoy solo /tesoreria/dia, listo para sumar sub-rutas.
export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const sub = path?.length ? `/${path.join("/")}` : "";
  const url = new URL(req.url);
  try {
    const data = await apiFetch<unknown>(`/api/back-office/tesoreria${sub}${url.search}`);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
