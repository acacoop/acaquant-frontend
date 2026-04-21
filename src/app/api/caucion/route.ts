import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=15, stale-while-revalidate=60",
};

export async function GET(req: NextRequest) {
  try {
    const moneda = req.nextUrl.searchParams.get("moneda");
    const qs = moneda ? `?moneda=${encodeURIComponent(moneda)}` : "";
    const data = await apiFetch<unknown>(`/api/cotizaciones/caucion${qs}`, { revalidate: 15 });
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
