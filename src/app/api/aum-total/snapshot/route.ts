import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

interface SnapshotDoc {
  unidad: string;
  cartera: string;
  tipo: string;
  cuenta: string;
  id_cuenta: string;
  valuacion: number;
  cantidad: number;
}

interface BackendResp {
  docs: SnapshotDoc[];
  moneda: "ARS" | "USD";
  mep_used: number | null;
  mep_missing: boolean;
  fecha: string | null;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

// Filtros madre por nivel de la barra de NEGOCIO · AUM (multi-valor).
const NIVELES = ["nivel_1", "nivel_2", "nivel_3", "nivel_5"] as const;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // fecha ausente = el backend resuelve la última disponible (y la devuelve
    // en el campo `fecha` de la respuesta) — evita el waterfall serie→snapshot.
    const fecha = url.searchParams.get("fecha");
    const cf = url.searchParams.get("cuenta_filter");
    const moneda = url.searchParams.get("moneda");
    const q = new URLSearchParams();
    if (fecha) q.set("fecha", fecha);
    if (cf) q.set("cuenta_filter", cf);
    if (moneda) q.set("moneda", moneda);
    const operador = url.searchParams.get("operador");
    if (operador) q.set("operador", operador);
    // Los niveles son MULTI: params repetidos (`&nivel_1=A&nivel_1=B`), que es lo que
    // `scope_aum` parsea como lista. Con `set` se perdería todo menos el último valor.
    for (const n of NIVELES) for (const v of url.searchParams.getAll(n)) q.append(n, v);

    const data = await apiFetch<BackendResp>(
      `/api/portfolio/total-snapshot?${q}`,
      { revalidate: 0 }
    );
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
