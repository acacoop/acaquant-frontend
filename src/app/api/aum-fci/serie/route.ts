import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

interface SerieDoc {
  fecha: string;
  total: number;
  por_emisor: Record<string, number>;
}

const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    const suffix = q.toString() ? `?${q}` : "";

    const serie = await apiFetch<SerieDoc[]>(
      `/api/portfolio/fci-serie${suffix}`,
      { revalidate: 300 }
    );
    return NextResponse.json({ serie }, { headers: CACHE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
