import { NextResponse } from "next/server";
import { proxyBackend } from "@/lib/proxy-backend";

// Trades intradía — sin cache. LibroPanel polea cada 5s.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  const instrumento = new URL(req.url).searchParams.get("instrumento");
  if (!instrumento) return NextResponse.json({ error: "instrumento required" }, { status: 400 });
  return proxyBackend(req, {
    path: `/api/cotizaciones/historico/trades?instrumento=${encodeURIComponent(instrumento)}`,
  });
}
