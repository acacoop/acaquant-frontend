import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy live de la tabla PASE AGRO. No-store para que el polling del
// cliente vea cambios en tiempo real (last_price, oficial, pizarra editada).
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/derivados/agro");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
