import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy live — ver /api/argy/route.ts. Caución tiene snapshot cada 5s
// en el motor; el edge cache de 15s estaba pisando el polling.
export async function GET(req: NextRequest) {
  try {
    const moneda = req.nextUrl.searchParams.get("moneda");
    const qs = moneda ? `?moneda=${encodeURIComponent(moneda)}` : "";
    const data = await apiFetch<unknown>(`/api/cotizaciones/caucion${qs}`);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
