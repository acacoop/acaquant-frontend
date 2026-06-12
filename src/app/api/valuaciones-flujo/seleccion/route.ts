import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy PATCH /api/valuaciones-flujo/seleccion — body {id_cuenta, comprobante, incluido}.
export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const data = await apiFetch<unknown>("/api/valuaciones-flujo/seleccion", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
