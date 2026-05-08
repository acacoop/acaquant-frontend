import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filtro = url.searchParams.get("filtro_cuenta") || "todas";
    const data = await apiFetch<unknown>(
      `/api/portfolio/pnl-todas?filtro_cuenta=${encodeURIComponent(filtro)}`,
      { revalidate: 0 },
    );
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
