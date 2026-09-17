import { proxyBackend } from "@/lib/proxy-backend";

// Carteras presentes en el AuM (última foto) — opciones del filtro CARTERA de
// NEGOCIO · AUM. Reenvía operador + niveles porque el endpoint pasa por
// `scope_aum`. OJO: NO se reenvía `cartera` — sería pedir las opciones filtradas
// por la selección, y el desplegable se quedaría sólo con lo ya tildado.

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Filtros madre por nivel de la barra de NEGOCIO · AUM (multi-valor).
const NIVELES = ["nivel_1", "nivel_2", "nivel_3", "nivel_5"] as const;

export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = new URLSearchParams();
  const operador = sp.get("operador");
  if (operador) q.set("operador", operador);
  for (const n of NIVELES) for (const v of sp.getAll(n)) q.append(n, v);
  const suffix = q.toString() ? `?${q}` : "";
  return proxyBackend(req, { path: `/api/portfolio/carteras${suffix}` });
}
