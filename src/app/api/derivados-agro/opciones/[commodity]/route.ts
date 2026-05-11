import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Proxy live del panel de opciones agro. No-store para que el polling
// del cliente reciba siempre el último snapshot (bid/offer/last refresh 5s).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ commodity: string }> },
) {
  const { commodity } = await params;
  try {
    const data = await apiFetch<unknown>(
      `/api/derivados/agro/opciones/${encodeURIComponent(commodity)}`,
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
