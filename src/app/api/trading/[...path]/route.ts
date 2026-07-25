import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Proxy read-only a /api/trading/* del backend (pivots CEDEAR + universo).
// apiFetch propaga el user email para RBAC (módulo `trading`, admin-only).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = new URL(req.url);
  const target = `/api/trading/${path.join("/")}${url.search}`;
  try {
    const data = await apiFetch<unknown>(target);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

// POST → carga manual del PnL histórico (/api/trading/pnl-historico). El gate
// admin (módulo `trading`) lo aplica el backend.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const target = `/api/trading/${path.join("/")}`;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const data = await apiFetch<unknown>(target, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
