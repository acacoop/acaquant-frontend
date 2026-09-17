import { NextResponse } from "next/server";
import { proxyBackend } from "@/lib/proxy-backend";

// El backend devuelve la lista; el cliente espera `{docs}` (mismo shape que
// /api/aum-total/snapshot).

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const fecha = sp.get("fecha");
  if (!fecha) return NextResponse.json({ error: "fecha requerido" }, { status: 400 });
  const q = new URLSearchParams({ fecha });
  for (const k of ["cuenta_filter", "operador"]) {
    const v = sp.get(k);
    if (v) q.set(k, v);
  }
  return proxyBackend(req, { path: `/api/portfolio/fci-snapshot?${q}`, envolverEn: "docs" });
}
