import { NextResponse } from "next/server";
import { proxyBackend, queryDe } from "@/lib/proxy-backend";

// Tab CONTABILIDAD (Back Office): /resumen, /detalle, /cuentas. El cálculo
// (resultado mensual por título) vive ENTERO en el backend. Escribe dos cosas:
// el ABM de cuentas del proceso y qué movimientos NO contabilizar. El permiso
// REAL (allowlist de Tesorería + admin) lo aplica el backend; esto acota la
// superficie.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ path?: string[] }> };

/** Los ÚNICOS sub-paths con escritura. Todo lo demás es de lectura y una
 *  escritura contra ellos se corta acá, antes de salir de Vercel. */
const ESCRITURA = new Set(["cuentas", "excluir", "incluir"]);

async function h(req: Request, ctx: Ctx) {
  const path = (await ctx.params).path ?? [];
  if (req.method !== "GET" && !ESCRITURA.has(path[0] ?? "")) {
    return NextResponse.json({ error: "Esta ruta es de solo lectura." }, { status: 405 });
  }
  const sub = path.length ? `/${path.map(encodeURIComponent).join("/")}` : "";
  return proxyBackend(req, { path: `/api/back-office/contabilidad${sub}${queryDe(req)}` });
}

export const GET = h;
export const POST = h;
export const DELETE = h;
