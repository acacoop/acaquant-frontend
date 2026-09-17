import { proxyBackend } from "@/lib/proxy-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Filtros madre por nivel de la barra de NEGOCIO · AUM (multi-valor).
const NIVELES = ["nivel_1", "nivel_2", "nivel_3", "nivel_5"] as const;

export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = new URLSearchParams();
  for (const k of ["desde", "hasta", "cuenta_filter", "moneda", "operador"]) {
    const v = sp.get(k);
    if (v) q.set(k, v);
  }
  // Los niveles son MULTI: params repetidos (`&nivel_1=A&nivel_1=B`), que es lo
  // que `scope_aum` parsea como lista. Un `set` los aplastaría a uno solo y el
  // filtro achicaría de menos sin que nada falle.
  for (const n of NIVELES) for (const v of sp.getAll(n)) q.append(n, v);
  // CARTERA: también multi. Filtra POSICIONES (no cuentas), va como param propio.
  for (const v of sp.getAll("cartera")) q.append("cartera", v);
  const suffix = q.toString() ? `?${q}` : "";
  return proxyBackend(req, { path: `/api/portfolio/total-serie${suffix}` });
}
