import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Proxy read-only a /api/estrategia/* del backend (ESTRATEGIA QUANT: live,
// track-record, senales, contexto). apiFetch propaga el user email para RBAC
// (módulo `trading`, admin-only — mismo gate que /api/trading).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = new URL(req.url);
  const target = `/api/estrategia/${path.join("/")}${url.search}`;
  try {
    const data = await apiFetch<unknown>(target);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
