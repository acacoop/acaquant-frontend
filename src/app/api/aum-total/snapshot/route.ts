import { proxyBackend } from "@/lib/proxy-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Filtros madre por nivel de la barra de NEGOCIO · AUM (multi-valor).
const NIVELES = ["nivel_1", "nivel_2", "nivel_3", "nivel_5"] as const;

export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = new URLSearchParams();
  // fecha ausente = el backend resuelve la última disponible (y la devuelve en
  // `fecha`) — evita el waterfall serie→snapshot.
  for (const k of ["fecha", "cuenta_filter", "moneda", "operador"]) {
    const v = sp.get(k);
    if (v) q.set(k, v);
  }
  // Niveles y CARTERA son MULTI: params repetidos (ver /api/aum-total/serie).
  for (const n of NIVELES) for (const v of sp.getAll(n)) q.append(n, v);
  for (const v of sp.getAll("cartera")) q.append("cartera", v);
  return proxyBackend(req, { path: `/api/portfolio/total-snapshot?${q}` });
}
