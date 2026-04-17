import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
};

interface Fondos {
  fondos: string[];
  error?: string;
}

interface Serie {
  contraparte: string;
  moneda: string;
  unidades: string[];
  aum: { mes: string; total: number }[];
  flujo: { mes: string; bruto: number }[];
  error?: string;
}

export async function GET(req: NextRequest) {
  const contraparte = req.nextUrl.searchParams.get("contraparte");
  const moneda = req.nextUrl.searchParams.get("moneda") || "ARS";

  if (!contraparte) {
    try {
      const data = await apiFetch<string[]>(
        "/api/operaciones/fondos",
        { revalidate: 600 }
      );
      return NextResponse.json<Fondos>({ fondos: data }, { headers: CACHE_HEADERS });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      return NextResponse.json({ error: msg, fondos: [] }, { status: 502 });
    }
  }

  try {
    const qs = new URLSearchParams({ contraparte, moneda }).toString();
    const data = await apiFetch<Serie>(
      `/api/operaciones/flujo-vs-aum?${qs}`,
      { revalidate: 300 }
    );
    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
