import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Derivado read-only: precio disponible descontado a caución 7D por commodity
// (Cámara × tasa de caución 7D). Es el "Monto Pesos Cau 7D" del Pase con
// Cobertura. No-store para reflejar los cambios manuales al toque.
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/derivados/agro/descuento-caucion");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
