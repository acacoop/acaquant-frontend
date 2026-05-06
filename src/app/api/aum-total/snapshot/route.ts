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

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const fecha = url.searchParams.get("fecha");
    if (!fecha) {
      return NextResponse.json({ error: "fecha requerido" }, { status: 400 });
    }
    const cf = url.searchParams.get("cuenta_filter");
    const q = new URLSearchParams({ fecha });
    if (cf) q.set("cuenta_filter", cf);

    const docs = await apiFetch<SnapshotDoc[]>(
      `/api/portfolio/total-snapshot?${q}`,
      { revalidate: 0 }
    );
    return NextResponse.json({ docs }, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
