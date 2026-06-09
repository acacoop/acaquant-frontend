import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy live de Acreencias (cobros futuros por cliente). No-store: la vista
// refleja el último precompute de CashFlow.Acreencias.
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const url = new URL(req.url);
  try {
    const data = await apiFetch<unknown>(`/api/back-office/acreencias/${path.join("/")}${url.search}`);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
