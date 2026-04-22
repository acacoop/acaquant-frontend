import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Sin cache — el VR / tasa se actualiza en el motor o via PUT; cualquier
// cache intermedia demora el refresh del header de Derivados.
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/cotizaciones/opciones/meta");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const valor = req.nextUrl.searchParams.get("valor");
  if (!valor) {
    return NextResponse.json({ error: "valor required" }, { status: 400 });
  }
  try {
    const data = await apiFetch<unknown>(
      `/api/cotizaciones/opciones/tasa?valor=${encodeURIComponent(valor)}`,
      { method: "PUT" },
    );
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
