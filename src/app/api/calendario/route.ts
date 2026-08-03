import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Proxy read-only a GET /api/calendario del backend (calendario económico de la
// watchlist HOME). Público, como el resto de la watchlist de mercado.
export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const data = await apiFetch<unknown>(`/api/calendario${url.search}`);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
