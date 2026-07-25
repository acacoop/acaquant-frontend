import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Tasas manuales ON / Pagaré (globales) de la tab DATOS. Alimentan el
// "Pase con Cobertura". No-store para ver los cambios al tipear.
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/derivados/agro/tasas-cobertura");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// PATCH proxy — body {tasa_on?, tasa_pagare?}. Validación + audit en el backend.
export async function PATCH(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const data = await apiFetch<unknown>("/api/derivados/agro/tasas-cobertura", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
