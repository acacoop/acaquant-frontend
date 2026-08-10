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

// PUT / POST / DELETE comparten todo salvo el verbo: alta, edición y baja de los
// cheques emitidos (tab CHEQUES) y la carga del saldo inicial.
async function _write(req: Request, path: string[] | undefined,
                      method: "PUT" | "POST" | "DELETE") {
  const sub = path?.length ? `/${path.join("/")}` : "";
  // El DELETE no lleva body: su clave viaja en la query (ej. borrar un banco por
  // nombre + moneda), así que hay que reenviarla.
  const search = new URL(req.url).search;
  try {
    const body = method === "DELETE" ? undefined : await req.text();
    const data = await apiFetch<unknown>(`/api/back-office/tesoreria${sub}${search}`, { method, body });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return _write(req, (await params).path, "PUT");
}

export async function POST(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return _write(req, (await params).path, "POST");
}

export async function DELETE(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return _write(req, (await params).path, "DELETE");
}
