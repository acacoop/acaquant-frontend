import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
};

export async function GET(req: NextRequest) {
  const instrumento = req.nextUrl.searchParams.get("instrumento");
  if (!instrumento) {
    return NextResponse.json({ error: "instrumento required" }, { status: 400 });
  }
  try {
    const data = await apiFetch<unknown>(
      `/api/cotizaciones/historico/opciones?instrumento=${encodeURIComponent(instrumento)}`,
      { revalidate: 60 }
    );
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
