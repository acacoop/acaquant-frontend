import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Lista los 5 cereales de la Cámara Arbitral (precio_ars + precio_usd
// manuales). No-store para ver cambios en tiempo real al editar.
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/derivados/agro/camara");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
