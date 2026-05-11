import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// POST proxy del simulador de estrategias agro. El gate admin lo aplica
// el backend (api/routers/derivados_agro.py).
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const data = await apiFetch<unknown>(
      "/api/derivados/agro/estrategia/simular",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
