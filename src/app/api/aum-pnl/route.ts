import { NextResponse } from "next/server";
import { proxyBackend } from "@/lib/proxy-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  const id_cuenta = new URL(req.url).searchParams.get("id_cuenta");
  if (!id_cuenta) return NextResponse.json({ error: "id_cuenta requerido" }, { status: 400 });
  return proxyBackend(req, {
    path: `/api/portfolio/pnl?id_cuenta=${encodeURIComponent(id_cuenta)}`,
  });
}
