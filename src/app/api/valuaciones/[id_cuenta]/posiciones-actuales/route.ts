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
    const conPnl = url.searchParams.get("con_pnl");
    const q = new URLSearchParams();
    if (fecha) q.set("fecha", fecha);
    if (conPnl) q.set("con_pnl", conPnl);
    const suffix = q.toString() ? `?${q}` : "";
    const data = await apiFetch(
      `/api/valuaciones/${encodeURIComponent(id_cuenta)}/posiciones-actuales${suffix}`,
      { revalidate: 0 },
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
