import { NextResponse } from "next/server";
import { proxyBackend } from "@/lib/proxy-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const fa = sp.get("fecha_actual");
  const fp = sp.get("fecha_anterior");
  if (!fa || !fp) {
    return NextResponse.json({ error: "fecha_actual y fecha_anterior requeridos" }, { status: 400 });
  }
  const q = new URLSearchParams({ fecha_actual: fa, fecha_anterior: fp });
  for (const k of ["cuenta_filter", "moneda", "operador"]) {
    const v = sp.get(k);
    if (v) q.set(k, v);
  }
  return proxyBackend(req, { path: `/api/portfolio/diff?${q}` });
}
