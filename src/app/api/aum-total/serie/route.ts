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

// Filtros madre por nivel de la barra de NEGOCIO · AUM (multi-valor).
const NIVELES = ["nivel_1", "nivel_2", "nivel_3", "nivel_5"] as const;

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
    // Los niveles son MULTI: se reenvían como params repetidos (`&nivel_1=A&nivel_1=B`),
    // que es lo que `scope_aum` parsea como lista. Un `set` los aplastaría a uno solo
    // y el filtro achicaría de menos sin que nada falle.
    for (const n of NIVELES) for (const v of url.searchParams.getAll(n)) q.append(n, v);
    // CARTERA: también multi. Filtra POSICIONES (no cuentas como los niveles),
    // así que va como param propio del endpoint, no por `scope_aum`.
    for (const v of url.searchParams.getAll("cartera")) q.append("cartera", v);
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
