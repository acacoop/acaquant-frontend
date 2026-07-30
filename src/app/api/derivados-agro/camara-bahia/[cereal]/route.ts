import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// PATCH proxy de un cereal de la Cámara de Bahía — body {precio_usd?}.
// El audit y la validación los hace el backend.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ cereal: string }> },
) {
  const { cereal } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  try {
    const data = await apiFetch<unknown>(
      `/api/derivados/agro/camara-bahia/${encodeURIComponent(cereal)}`,
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
