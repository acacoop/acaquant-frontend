import { NextResponse } from "next/server";
import { proxyBackend, queryDe } from "@/lib/proxy-backend";

// Tab INTERBANKING (Back Office): /vista y /cuentas.
//
// ⚠️ Hacia INTERBANKING no se escribe nunca: los datos los trae
// `jobs/interbanking_sync` y la vista los lee de Postgres. POST/PUT/DELETE pasan
// SOLO para `gastos` (clasificación), `manual` (lo cargado a mano), `saldo`
// (cuál de los dos saldos del banco vale como cierre) y `conciliar` (POST que
// compara y NO persiste). Es una segunda cerradura sobre la misma puerta, y la
// de acá es la que mira internet. El permiso real lo aplica el backend, que
// además audita cada lectura con la identidad que viaja.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ path?: string[] }> };

/** Los ÚNICOS sub-paths con escritura. Todo lo demás es de lectura y una
 *  escritura contra ellos se corta acá, antes de salir de Vercel. */
const ESCRITURA = new Set(["gastos", "manual", "saldo", "conciliar"]);

async function h(req: Request, ctx: Ctx) {
  const path = (await ctx.params).path ?? [];
  if (req.method !== "GET" && !ESCRITURA.has(path[0] ?? "")) {
    return NextResponse.json({ error: "Esta ruta es de solo lectura." }, { status: 405 });
  }
  const sub = path.length ? `/${path.map(encodeURIComponent).join("/")}` : "";
  return proxyBackend(req, { path: `/api/back-office/interbanking${sub}${queryDe(req)}` });
}

export const GET = h;
export const POST = h;
export const PUT = h;
export const DELETE = h;
