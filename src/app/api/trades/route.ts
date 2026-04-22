import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Trades intradía — sin cache. El frontend (LibroPanel) hace polling
// propio cada 5s; el edge cache pisaba el refresh del time & sales.
export async function GET(req: NextRequest) {
  const instrumento = req.nextUrl.searchParams.get("instrumento");
  if (!instrumento) {
    return NextResponse.json({ error: "instrumento required" }, { status: 400 });
  }
  try {
    const data = await apiFetch<unknown>(
      `/api/cotizaciones/historico/trades?instrumento=${encodeURIComponent(instrumento)}`,
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
