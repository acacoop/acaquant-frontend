import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Costo Pase (gastos MATBA + ALyC) — panel automático de la tab DATOS:
// desglose del 0,45% que se le resta al Pase Lleno + costo US$/Tn por
// commodity. No-store: el costo por commodity sigue al precio de la Cámara.
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/derivados/agro/costo-pase");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
