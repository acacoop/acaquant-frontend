import { NextResponse } from "next/server";
import { isGuestRequest, trustedEmail } from "@/lib/cf-access";

// Proxy de la tab INTERBANKING (Back Office) hacia
// /api/back-office/interbanking/* del backend: /vista y /cuentas.
//
// ⚠️ **Hacia INTERBANKING no se escribe nunca**: los datos los trae
// `jobs/interbanking_sync` y la vista los lee de Postgres. Este proxy no puede
// llegar a Interbanking ni queriendo.
//
// Desde 2026-08-18 sí pasan POST/PUT/DELETE, y **solo para `/gastos/*` y
// `/manual/*`**: la clasificación de gastos bancarios y lo cargado a mano, que
// escriben en tablas nuestras
// (`bancos.gastos_reglas` / `gastos_overrides` / `movimientos_ignorados`). El
// resto de los paths siguen siendo de lectura y una escritura contra ellos se
// rechaza ACÁ, antes de salir
// — es una segunda cerradura sobre la misma puerta, y la de acá es la que mira
// internet. El permiso REAL (allowlist + admin) lo aplica el backend; esto solo
// acota la superficie.
//
// Mismo patrón de auth que /api/back-office/senebis: bearer + service token de
// CF + propagación de la identidad real del usuario, que el backend necesita
// para auditar cada lectura en `bancos.audit_lecturas`.
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ path?: string[] }> };

/** Los únicos sub-paths donde se admite escribir. Todo lo demás es lectura.
 *  `gastos` = la clasificación (reglas, marcas, ignorados, desglose).
 *  `manual` = cuentas y movimientos que Interbanking no informa.
 *  Las dos escriben en tablas NUESTRAS; hacia el banco no sale nada. */
const ESCRITURA = new Set(["gastos", "manual"]);

function esEscrituraPermitida(path: string[] | undefined) {
  return ESCRITURA.has(path?.[0] ?? "");
}

async function proxy(req: Request, params: Ctx["params"], method: string) {
  try {
    const { path } = await params;
    if (method !== "GET" && !esEscrituraPermitida(path)) {
      return NextResponse.json(
        { error: "Esta ruta es de solo lectura." },
        { status: 405 },
      );
    }
    const url = new URL(req.url);
    const sub = path?.length ? `/${path.join("/")}` : "";
    const target = `${API_URL}/api/back-office/interbanking${sub}${url.search}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    // Identidad de CONFIANZA: con CF activo sale del sello firmado (JWT), el
    // header de texto plano se ignora → no spoofeable. El backend la usa para
    // la auditoría de lectura, así que sin esto la auditoría diría "anónimo".
    const userEmail = await trustedEmail((n) => req.headers.get(n));
    if (userEmail) {
      headers["cf-access-authenticated-user-email"] = userEmail;
      headers["x-acaquant-user-email"] = userEmail;
    }
    // Portal invitado (www): REGLA #8. Sin esta marca el backend resolvería el
    // rol por email (default `sales`, que SÍ tiene back-office) y un invitado
    // vería los saldos bancarios de la casa. Con la marca fuerza rol invitado
    // (sin back-office) → 403.
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
export const PUT = (req: Request, ctx: Ctx) => proxy(req, ctx.params, "PUT");
export const DELETE = (req: Request, ctx: Ctx) => proxy(req, ctx.params, "DELETE");
