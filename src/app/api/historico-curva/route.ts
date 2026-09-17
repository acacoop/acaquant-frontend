import { NextResponse } from "next/server";
import { proxyBackend } from "@/lib/proxy-backend";

// Sin cache: la última fecha disponible cambia al ritmo del live fallback del
// backend (MarketSnapshot).

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  const curva = new URL(req.url).searchParams.get("curva");
  if (!curva) return NextResponse.json({ error: "missing curva" }, { status: 400 });
  return proxyBackend(req, {
    path: `/api/cotizaciones/historico/curva?curva=${encodeURIComponent(curva)}`,
    cacheControl: "no-store, no-cache, must-revalidate",
  });
}
