import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy live de la tabla de sintéticos. No-store para que el polling del
// cliente vea los precios actualizados (los del bono / del futuro / SPOT).
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/derivados/sinteticos");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
