import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Proxy a /api/trading/* del backend (panel de los 5 sistemas + watchlist por
// usuario). apiFetch propaga el user email para RBAC (módulo `trading`, admin-only).
//
// Endpoints:
//   GET  /api/trading/panel?tickers=RKLB,SNDK
//   GET  /api/trading/watchlist
//   PUT  /api/trading/watchlist  { tickers: [...] }
//
// force-dynamic + revalidate=0 + no-store: data live (motor_cedears cada 1s).

function target(path: string[], search: string): string {
  return `/api/trading/${path.join("/")}${search}`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = new URL(req.url);
  try {
    const data = await apiFetch<unknown>(target(path, url.search));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const body = await req.text();
  try {
    const data = await apiFetch<unknown>(target(path, ""), { method: "PUT", body });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
