import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Proxy a GET /api/analitica/comparar — propaga querystring.
// Live fallback: no cachear (precios y MEP se mueven cada ~10s).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = `/api/analitica/comparar${url.search}`;
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
