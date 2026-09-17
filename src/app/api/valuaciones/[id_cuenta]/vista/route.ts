import { proxyBackend } from "@/lib/proxy-backend";

// El INFORME de la cuenta (RESUMEN + ACTIVOS + MÉTRICAS) en UN request: los
// números salen calculados del backend, así el PDF y la pantalla no pueden
// decir cosas distintas. Ver api/services/carteras_informe.py.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id_cuenta: string }> },
) {
  const { id_cuenta } = await params;
  const sp = new URL(req.url).searchParams;
  const q = new URLSearchParams();
  const fecha = sp.get("fecha");
  if (fecha) q.set("fecha", fecha);
  // t0 | t1 — solo aplica en modo ACTUAL (sin fecha).
  const horizonte = sp.get("horizonte");
  if (horizonte) q.set("horizonte", horizonte);
  const suffix = q.toString() ? `?${q}` : "";
  return proxyBackend(req, {
    path: `/api/valuaciones/${encodeURIComponent(id_cuenta)}/vista${suffix}`,
    cacheControl: "no-store, no-cache, must-revalidate",
  });
}
