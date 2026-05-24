import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

interface SerieDoc {
  fecha: string;
  total: number;
  por_cartera: Record<string, number>;
  mep_used?: number | null;
}

interface BackendResp {
  serie: SerieDoc[];
  moneda: "ARS" | "USD";
  fechas_sin_mep: string[];
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    const cf = url.searchParams.get("cuenta_filter");
    const moneda = url.searchParams.get("moneda");
    const q = new URLSearchParams();
    if (desde) q.set("desde", desde);
    if (hasta) q.set("hasta", hasta);
    if (cf) q.set("cuenta_filter", cf);
    if (moneda) q.set("moneda", moneda);
    const operador = url.searchParams.get("operador");
    if (operador) q.set("operador", operador);
    const suffix = q.toString() ? `?${q}` : "";

    const data = await apiFetch<BackendResp>(
      `/api/portfolio/total-serie${suffix}`,
      { revalidate: 0 }
    );
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
