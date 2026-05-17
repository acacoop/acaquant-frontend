import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filtro = searchParams.get("filtro_cuenta") || "todas";
    const data = await apiFetch(
      `/api/valuaciones/consolidado?filtro_cuenta=${encodeURIComponent(filtro)}`,
      { revalidate: 0 },
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
