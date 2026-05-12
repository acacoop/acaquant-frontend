import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Proxy genérico read-only a /api/smart-money/* del backend.
// Usa apiFetch (que propaga user email para RBAC).
//
// Endpoints expuestos:
//   /api/smart-money/catalog
//   /api/smart-money/managers
//   /api/smart-money/manager/{cik}
//   /api/smart-money/ticker/{ticker}
//   /api/smart-money/cohort-overview
//   /api/smart-money/recent-activity?days=7
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = new URL(req.url);
  const target = `/api/smart-money/${path.join("/")}${url.search}`;
  try {
    const data = await apiFetch<unknown>(target);
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
