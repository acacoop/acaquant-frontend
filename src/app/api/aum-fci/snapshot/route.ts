import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

interface SnapshotDoc {
  unidad: string;
  emisor: string;
  ticker: string;
  cuenta: string;
  id_cuenta: string;
  valuacion: number;
  cantidad: number;
}

const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
};

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const fecha = url.searchParams.get("fecha");
    if (!fecha) {
      return NextResponse.json({ error: "fecha requerido" }, { status: 400 });
    }
    const docs = await apiFetch<SnapshotDoc[]>(
      `/api/portfolio/fci-snapshot?fecha=${fecha}`,
      { revalidate: 300 }
    );
    return NextResponse.json({ docs }, { headers: CACHE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
