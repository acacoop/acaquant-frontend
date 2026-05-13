import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Proxy genérico read-only a /api/scanner/* del backend.
// Usa apiFetch (que propaga user email para RBAC).
//
// Endpoints expuestos:
//   /api/scanner/cedears
//
// force-dynamic + revalidate=0 + Cache-Control: no-store para que el
// CDN de Vercel no cachee — el endpoint sirve datos live del motor
// (motor_cedears actualiza Trading.CedearsSnapshot cada 1s).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = new URL(req.url);
  const target = `/api/scanner/${path.join("/")}${url.search}`;
  try {
    const data = await apiFetch<unknown>(target);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
