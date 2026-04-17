import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
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
      { revalidate: 300 }
    );
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
