import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy live — reads market prices via MarketSnapshot, no edge cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id_cuenta: string }> },
) {
  try {
    const { id_cuenta } = await params;
    const url = new URL(req.url);
    const q = new URLSearchParams();
    const hasta = url.searchParams.get("hasta");
    if (hasta) q.set("hasta", hasta);
    const suffix = q.toString() ? `?${q}` : "";
    const data = await apiFetch(
      `/api/valuaciones/${encodeURIComponent(id_cuenta)}/posiciones${suffix}`,
      { revalidate: 0 },
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
