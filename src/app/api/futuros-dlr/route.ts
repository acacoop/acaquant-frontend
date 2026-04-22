import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy live — ver comentario en /api/argy/route.ts. El edge cache
// pisaba el polling del cliente.
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/cotizaciones/futuros-dlr");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
