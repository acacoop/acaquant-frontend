import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const operador = new URL(req.url).searchParams.get("operador");
    const suffix = operador ? `?operador=${encodeURIComponent(operador)}` : "";
    const data = await apiFetch(`/api/portfolio/tasa-fija${suffix}`, { revalidate: 0 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
