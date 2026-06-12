import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy GET /api/valuaciones-flujo/resumen?id_cuenta&desde&hasta → backend (matriz agregada).
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const qs = new URL(req.url).search;
    const data = await apiFetch<unknown>(`/api/valuaciones-flujo/resumen${qs}`, {
      revalidate: 0,
    });
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
