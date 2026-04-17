import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const instrumento = req.nextUrl.searchParams.get("instrumento");
  if (!instrumento) {
    return NextResponse.json({ error: "instrumento required" }, { status: 400 });
  }
  try {
    const data = await apiFetch<unknown>(
      `/api/cotizaciones/historico/trades?instrumento=${encodeURIComponent(instrumento)}`
    );
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
