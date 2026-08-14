import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy del ABM de cuentas OCULTAS del control de saldos.
//
// Va en su propia ruta y no adentro de /titulos-negativos porque esa es un GET
// pelado sin catch-all: un PUT ahí choca con un 405 y el front muestra "error de
// red" sin más pista. La LECTURA de la lista no pasa por acá — viaja dentro de
// la respuesta de /titulos-negativos, que es la misma pantalla.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params;
  const sub = path?.length ? `/${path.join("/")}` : "";
  try {
    const body = await req.text();
    const data = await apiFetch<unknown>(`/api/back-office/saldos${sub}`, {
      method: "PUT",
      body,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params;
  const sub = path?.length ? `/${path.join("/")}` : "";
  try {
    const data = await apiFetch<unknown>(`/api/back-office/saldos${sub}`, {
      method: "DELETE",
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
