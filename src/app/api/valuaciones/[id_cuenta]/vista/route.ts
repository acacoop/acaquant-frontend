import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// El INFORME de la cuenta (RESUMEN + ACTIVOS + MÉTRICAS) en UN request.
// Reemplaza al trío /posiciones-actuales + los totales que la vista armaba en el
// navegador: los números salen calculados del backend, así el PDF y la pantalla
// no pueden decir cosas distintas. Ver api/services/carteras_informe.py.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id_cuenta: string }> },
) {
  try {
    const { id_cuenta } = await params;
    const url = new URL(req.url);
    const fecha = url.searchParams.get("fecha");
    // t0 | t1 — solo aplica en modo ACTUAL (sin fecha).
    const horizonte = url.searchParams.get("horizonte");
    const q = new URLSearchParams();
    if (fecha) q.set("fecha", fecha);
    if (horizonte) q.set("horizonte", horizonte);
    const suffix = q.toString() ? `?${q}` : "";
    const data = await apiFetch(
      `/api/valuaciones/${encodeURIComponent(id_cuenta)}/vista${suffix}`,
      { revalidate: 0 },
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
