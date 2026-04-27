import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy del histórico de dólares (MEP + CCL + oficial) — alimenta el
// chart custom del panel ARGY. Cache no-store por la misma razón que
// los otros live: el polling del cliente decide la cadencia.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  try {
    const data = await apiFetch<unknown>(
      `/api/cotizaciones/historico/dolares${qs ? `?${qs}` : ""}`,
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
