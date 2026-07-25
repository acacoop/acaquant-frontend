import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy de los titulares Reuters (feed Eikon de oficina) — tab NOTICIAS de la
// watchlist HOME. No-store: el polling del cliente ve cada ingesta del feed.
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/market/eikon-news");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
