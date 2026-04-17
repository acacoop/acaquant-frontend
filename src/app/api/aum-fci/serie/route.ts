import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

interface SerieDoc {
  fecha: string;
  total: number;
  por_emisor: Record<string, number>;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    const suffix = q.toString() ? `?${q}` : "";

    const serie = await apiFetch<SerieDoc[]>(`/api/portfolio/fci-serie${suffix}`);
    return NextResponse.json({ serie });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
