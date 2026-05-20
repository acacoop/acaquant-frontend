import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy live de Títulos/Mercado. No-store para que el polling vea
// movimientos nuevos en cuanto entran a CashFlow.NegocioMovimientos.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fecha = url.searchParams.get("fecha");
  const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
  try {
    const data = await apiFetch<unknown>(
      `/api/back-office/titulos-mercado${qs}`,
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
