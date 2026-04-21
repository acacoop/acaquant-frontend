import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=30, stale-while-revalidate=120",
};

export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/cotizaciones/mep", { revalidate: 30 });
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
