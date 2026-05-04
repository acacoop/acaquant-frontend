import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Sin cache: la última fecha disponible cambia al ritmo del live fallback
// del backend (MarketSnapshot). Cualquier cache del CDN nos hace perder
// el día de hoy hasta que expire.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

interface Row {
  fecha: string;
  ticker: string;
  price: number | null;
  TEA: number | null;
  TEM: number | null;
  duration: number | null;
  paridad: number | null;
}

export async function GET(req: NextRequest) {
  const curva = req.nextUrl.searchParams.get("curva");
  if (!curva) {
    return NextResponse.json({ error: "missing curva" }, { status: 400 });
  }
  try {
    const data = await apiFetch<Row[]>(
      `/api/cotizaciones/historico/curva?curva=${encodeURIComponent(curva)}`,
    );
    return NextResponse.json(data, { headers: NO_CACHE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
