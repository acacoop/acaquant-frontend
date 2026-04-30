import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// PATCH proxy: reenvía body al backend. El gate trader+admin lo aplica
// el backend (api/routers/derivados_agro.py).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ commodity: string }> },
) {
  const { commodity } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const data = await apiFetch<unknown>(
      `/api/derivados/agro/pizarra/${encodeURIComponent(commodity)}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
