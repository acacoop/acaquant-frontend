import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy de Tesorería (Back Office). Live contra Aunesa (ingresos/egresos del día)
// + carga manual del saldo inicial por banco (PUT /saldo-inicial).
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

export async function PUT(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path } = await params;
  const sub = path?.length ? `/${path.join("/")}` : "";
  try {
    const body = await req.text();
    const data = await apiFetch<unknown>(`/api/back-office/tesoreria${sub}`, { method: "PUT", body });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
