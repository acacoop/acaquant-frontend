import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Tabla Mejoras Precio Dispo — BAHÍA (3 bloques: Soja/Maíz/Trigo + LECAPs).
// Igual que mejoras-dispo pero el precio disponible sale de la Cámara de Bahía.
// No-store para que el polling vea precios + TNAs frescos.
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/derivados/agro/mejoras-dispo-bahia");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
