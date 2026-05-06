import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id_cuenta: string }> },
) {
  try {
    const { id_cuenta } = await params;
    const url = new URL(req.url);
    const fecha = url.searchParams.get("fecha");
    if (!fecha) {
      return NextResponse.json({ error: "fecha required" }, { status: 400 });
    }
    const data = await apiFetch(
      `/api/valuaciones/${encodeURIComponent(id_cuenta)}/movimientos?fecha=${encodeURIComponent(fecha)}`,
      { revalidate: 0 },
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
