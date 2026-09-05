import { NextResponse } from "next/server";
import { isGuestRequest, trustedEmail } from "@/lib/cf-access";

// Proxy de la tab CONTABILIDAD (Back Office) hacia
// /api/back-office/contabilidad/* del backend: /resumen, /detalle, /cuentas.
//
// El cálculo (resultado mensual por título: tenencia / intermediación) vive
// ENTERO en el backend — acá no se deriva nada. Esta tab escribe dos cosas: el
// ABM de cuentas del proceso (`operaciones.contabilidad_cuentas`) y qué
// movimientos NO contabilizar (`operaciones.contabilidad_excluidos`). El
// permiso REAL (allowlist de Tesorería + admin) lo aplica el backend; esto solo
// acota la superficie.
//
// Mismo patrón de auth que interbanking: bearer + service token de CF +
// propagación de la identidad verificada + marca de portal invitado (REGLA #8:
// back-office jamás llega al invitado).
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ path?: string[] }> };

/** Los ÚNICOS sub-paths con escritura. Todo lo demás es de lectura y una
 *  escritura contra ellos se corta acá, antes de salir de Vercel.
 *
 *  Dos cosas escriben: el ABM de cuentas del proceso (que desde 2026-09-05 solo
 *  admite cuentas CON movimientos en `movimientos_propias` — lo valida el
 *  backend) y elegir qué movimientos NO contabilizar. Las dos cambian un número
 *  que después se informa, así que el permiso real (allowlist de Tesorería +
 *  admin) lo aplica el backend; esto solo acota la superficie. */
const ESCRITURA = new Set(["cuentas", "excluir", "incluir"]);

async function proxy(req: Request, params: Ctx["params"], method: string) {
  try {
    const { path } = await params;
    if (method !== "GET" && !ESCRITURA.has(path?.[0] ?? "")) {
      return NextResponse.json(
        { error: "Esta ruta es de solo lectura." },
        { status: 405 },
      );
    }
    const url = new URL(req.url);
    const sub = path?.length ? `/${path.join("/")}` : "";
    const target = `${API_URL}/api/back-office/contabilidad${sub}${url.search}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    const userEmail = await trustedEmail((n) => req.headers.get(n));
    if (userEmail) {
      headers["cf-access-authenticated-user-email"] = userEmail;
      headers["x-acaquant-user-email"] = userEmail;
    }
    if (await isGuestRequest((n) => req.headers.get(n))) {
      headers["x-acaquant-portal"] = "guest";
    }

    let body: string | undefined;
    if (method !== "GET") {
      body = await req.text();
      headers["content-type"] = "application/json";
    }

    const res = await fetch(target, { method, headers, body, cache: "no-store" });
    const texto = await res.text();
    return new NextResponse(texto, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export const GET = (req: Request, ctx: Ctx) => proxy(req, ctx.params, "GET");
export const POST = (req: Request, ctx: Ctx) => proxy(req, ctx.params, "POST");
export const DELETE = (req: Request, ctx: Ctx) => proxy(req, ctx.params, "DELETE");
