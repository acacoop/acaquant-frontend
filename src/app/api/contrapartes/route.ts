import { proxyBackend } from "@/lib/proxy-backend";

// PII de contrapartes → `private, no-store` (no al CDN compartido; el backend
// ya cachea 300s).

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE = "private, no-store";

function ventana(): { desde: string; hasta: string } {
  const hoy = new Date();
  return {
    desde: new Date(hoy.getFullYear() - 2, hoy.getMonth(), 1).toISOString().slice(0, 10),
    hasta: hoy.toISOString().slice(0, 10),
  };
}

export function GET(req: Request) {
  const dia = new URL(req.url).searchParams.get("dia");
  // Drill-down de un día puntual: operaciones individuales de ESE día (el
  // resumen agregado no las tiene). El cliente espera `{ops}`.
  if (dia) {
    return proxyBackend(req, {
      path: `/api/operaciones/flujo?desde=${encodeURIComponent(dia)}&hasta=${encodeURIComponent(dia)}`,
      cacheControl: CACHE,
      envolverEn: "ops",
    });
  }
  // Vista general: agregado por (día, contraparte, moneda) que arma el backend.
  const { desde, hasta } = ventana();
  return proxyBackend(req, {
    path: `/api/operaciones/flujo/resumen?desde=${desde}&hasta=${hasta}`,
    cacheControl: CACHE,
  });
}
