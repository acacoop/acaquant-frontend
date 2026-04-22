import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy live — no cachear ni en Node ni en el edge. El frontend polea
// cada 5 s y el backend ya tiene @cached(ttl=5) en la capa de servicio.
// Si ponemos s-maxage / revalidate acá, el poll del cliente nunca llega
// al origin hasta que expire el edge cache, con lo cual la vista queda
// estática en ARGY (bug reportado 2026-04-23).
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/cotizaciones/argy");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
