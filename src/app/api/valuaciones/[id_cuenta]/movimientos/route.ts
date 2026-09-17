import { NextResponse } from "next/server";
import { proxyBackend } from "@/lib/proxy-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id_cuenta: string }> },
) {
  const { id_cuenta } = await params;
  const fecha = new URL(req.url).searchParams.get("fecha");
  if (!fecha) return NextResponse.json({ error: "fecha required" }, { status: 400 });
  return proxyBackend(req, {
    path: `/api/valuaciones/${encodeURIComponent(id_cuenta)}/movimientos?fecha=${encodeURIComponent(fecha)}`,
    cacheControl: "no-store, no-cache, must-revalidate",
  });
}
