import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy live del tab CHICAGO (futuros CBOT del feed Eikon de oficina).
// No-store para que el polling del cliente vea cada actualización del feed.
export async function GET() {
  try {
    const data = await apiFetch<unknown>("/api/derivados/agro/chicago");
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
