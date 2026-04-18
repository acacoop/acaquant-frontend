import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const id_cuenta = new URL(req.url).searchParams.get("id_cuenta");
    if (!id_cuenta) return NextResponse.json({ error: "id_cuenta requerido" }, { status: 400 });
    const data = await apiFetch(`/api/portfolio/detalle?id_cuenta=${encodeURIComponent(id_cuenta)}`, { revalidate: 0 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
