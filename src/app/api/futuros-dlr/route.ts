import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=15, stale-while-revalidate=60",
};

export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/cotizaciones/futuros-dlr", { revalidate: 15 });
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
