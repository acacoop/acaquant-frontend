import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy live — ver /api/argy/route.ts. MEP live viene del motor de
// dólares (snapshot 5s); el edge cache de 30s estaba dejando el
// indicador del top ticker desactualizado casi medio minuto.
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/cotizaciones/mep");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
