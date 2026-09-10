import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Proxy read-only a /api/fci/* del backend (vista FONDOS COMUNES DE INVERSIÓN,
// docs/FCI.md del backend). Solo GET: la vista no escribe nada; el universo se
// administra en el backend (scripts/fci_admin) hasta que exista la pantalla en
// Manager. apiFetch propaga la identidad ya saneada por src/proxy.ts — sin eso
// el backend ve `service:<cn>` y el gate del módulo `fci` devuelve 403.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const url = new URL(req.url);
  const target = `/api/fci/${path.join("/")}${url.search}`;
  try {
    const data = await apiFetch<unknown>(target);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    // Un fondo que no existe viaja como 404, no como 502: la ficha tiene que
    // poder decir «no está en el universo» y no «backend caído».
    const status = /API error 404/.test(msg) ? 404 : 502;
    return NextResponse.json({ error: msg }, { status });
  }
}
