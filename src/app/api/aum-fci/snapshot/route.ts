import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

interface SnapshotDoc {
  unidad: string;
  emisor: string;
  ticker: string;
  cuenta: string;
  id_cuenta: string;
  valuacion: number;
  cantidad: number;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const fecha = url.searchParams.get("fecha");
    if (!fecha) {
      return NextResponse.json({ error: "fecha requerido" }, { status: 400 });
    }
    const docs = await apiFetch<SnapshotDoc[]>(
      `/api/portfolio/fci-snapshot?fecha=${fecha}`
    );
    return NextResponse.json({ docs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
