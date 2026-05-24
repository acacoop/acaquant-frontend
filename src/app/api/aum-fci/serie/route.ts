import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

interface SerieDoc {
  fecha: string;
  total: number;
  por_emisor: Record<string, number>;
}

// no-store + force-dynamic — los datos se actualizan diario por cron y el
// usuario edita CARTERA durante el día; cachear acá hace que el CDN sirva
// el set de unidades viejo.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    const cf = url.searchParams.get("cuenta_filter");
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    if (cf) q.set("cuenta_filter", cf);
    const operador = url.searchParams.get("operador");
    if (operador) q.set("operador", operador);
    const suffix = q.toString() ? `?${q}` : "";

    const serie = await apiFetch<SerieDoc[]>(
      `/api/portfolio/fci-serie${suffix}`,
      { revalidate: 0 }
    );
    return NextResponse.json({ serie }, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
