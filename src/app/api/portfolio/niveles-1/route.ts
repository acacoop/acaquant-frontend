import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Valores de Nivel 1 (segmento) para el filtro madre de la vista AUM Total.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await apiFetch("/api/portfolio/niveles-1", { revalidate: 0 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
