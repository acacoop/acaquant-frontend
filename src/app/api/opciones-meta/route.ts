import { NextResponse } from "next/server";
import { proxyBackend } from "@/lib/proxy-backend";

// VR / tasa de opciones: se actualiza en el motor o via PUT; cualquier cache
// intermedia demora el refresh del header de Derivados.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/cotizaciones/opciones/meta" });
}

export function PUT(req: Request) {
  const valor = new URL(req.url).searchParams.get("valor");
  if (!valor) return NextResponse.json({ error: "valor required" }, { status: 400 });
  return proxyBackend(req, {
    path: `/api/cotizaciones/opciones/tasa?valor=${encodeURIComponent(valor)}`,
    body: null,
  });
}
