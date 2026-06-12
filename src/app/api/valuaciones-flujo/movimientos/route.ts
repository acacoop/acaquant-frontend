import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Proxy GET /api/valuaciones-flujo/movimientos?id_cuenta=X → backend.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const id_cuenta = new URL(req.url).searchParams.get("id_cuenta");
    if (!id_cuenta) {
      return NextResponse.json({ error: "id_cuenta requerido" }, { status: 400 });
    }
    const data = await apiFetch<unknown>(
      `/api/valuaciones-flujo/movimientos?id_cuenta=${encodeURIComponent(id_cuenta)}`,
      { revalidate: 0 },
    );
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
