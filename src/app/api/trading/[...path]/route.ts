import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Proxy read-only a /api/trading/* del backend (pivots, monitor, universo).
//
// GET-ONLY desde el 2026-09-04: el handler POST existía SOLO para el cuaderno
// de PNL HISTÓRICO, que se borró entero (front y back). El router de trading ya
// no tiene una sola ruta que escriba, así que un POST acá no tendría destino.
// apiFetch propaga el user email para RBAC (módulo `trading`, admin-only).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = new URL(req.url);
  const target = `/api/trading/${path.join("/")}${url.search}`;
  try {
    const data = await apiFetch<unknown>(target);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
