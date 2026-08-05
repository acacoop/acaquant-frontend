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
    const nivel1 = url.searchParams.get("nivel_1");
    if (nivel1) q.set("nivel_1", nivel1);

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
