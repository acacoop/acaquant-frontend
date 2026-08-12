import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy de CONTROL TÍTULOS NEGATIVOS (posición T0 con nominales < 0).
// La vista pollea, así que va no-store: con cache, "no hay negativos" podría ser
// la respuesta de hace cinco minutos y nadie se enteraría.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  try {
    const data = await apiFetch<unknown>(
      `/api/back-office/titulos-negativos${url.search}`,
    );
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
