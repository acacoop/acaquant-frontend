import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id_cuenta = url.searchParams.get("id_cuenta");
    const q = new URLSearchParams();
    if (id_cuenta) q.set("id_cuenta", id_cuenta);
    const suffix = q.toString() ? `?${q}` : "";
    const data = await apiFetch(`/api/portfolio/resumen${suffix}`, { revalidate: 0 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
