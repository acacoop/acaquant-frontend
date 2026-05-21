import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Proxy a GET /api/analitica/comparar/bonos — universo para el selector.
// TTL backend = 30s, cliente refetcha al montar.
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/analitica/comparar/bonos");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
