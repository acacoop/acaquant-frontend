import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Trades intradía — cache 15s (coincide con TTL del backend).
const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=15, stale-while-revalidate=60",
};

export async function GET(req: NextRequest) {
  const instrumento = req.nextUrl.searchParams.get("instrumento");
  if (!instrumento) {
    return NextResponse.json({ error: "instrumento required" }, { status: 400 });
  }
  try {
    const data = await apiFetch<unknown>(
      `/api/cotizaciones/historico/trades?instrumento=${encodeURIComponent(instrumento)}`,
      { revalidate: 15 }
    );
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
