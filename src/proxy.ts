import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy (Next.js 16+) — antes se llamaba middleware.
 *
 * Consulta /api/me del backend y restringe rutas por módulo según el role
 * del user. Solo corre en paths restringidos (config.matcher más abajo),
 * las rutas públicas (home, renta-fija, derivados, estrategia) no pagan
 * el fetch.
 *
 * Mapeo path → módulo coincide con ENDPOINT_MODULE_PREFIXES del backend
 * (api/auth.py). Cualquier cambio acá hay que replicarlo allá.
 *
 * Fail-open en errores de red: si el backend está caído el middleware
 * deja pasar. No es un agujero: el backend tiene su propio gate con
 * require_module(), que devuelve 403 server-side igual.
 */
const PATH_MODULES: [string, string][] = [
  ["/manager", "manager"],
  // Asistente (legacy): accesible solo desde Manager. Sin entrada propia.
  ["/api/chat", "manager"],
  // /operar (DOLAR MEP, órdenes vivas, saldo) — módulo `operar`
  ["/operar", "operar"],
  ["/api/ordenes", "operar"],
  ["/api/operativa", "operar"],
  ["/api/risk", "operar"],
  // /operaciones (mesa, flujo, contrapartes) — módulo `operaciones`
  ["/operaciones", "operaciones"],
  ["/api/operaciones", "operaciones"],
  ["/api/cuentas", "operaciones"],
  ["/aum", "portfolios"],
  ["/api/portfolio", "portfolios"],
  ["/api/titulos", "portfolios"],
  // /renta-variable (smart money: 13F + Form 4 sobre CEDEARs) — módulo `renta-variable`
  ["/renta-variable", "renta-variable"],
  ["/api/smart-money", "renta-variable"],
];

function moduleForPath(path: string): string | null {
  for (const [prefix, mod] of PATH_MODULES) {
    if (path === prefix || path.startsWith(prefix + "/")) return mod;
  }
  return null;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const requiredModule = moduleForPath(path);
  if (!requiredModule) return NextResponse.next();

  const email = (
    request.headers.get("cf-access-authenticated-user-email") ?? ""
  ).toLowerCase();

  // Dev (sin CF Access activo): dejar pasar todo
  if (!email && !process.env.API_URL) return NextResponse.next();

  const apiUrl = process.env.API_URL || "https://api.acaquant.com";
  const apiKey = process.env.API_KEY || "";
  const cfId = process.env.CF_ACCESS_CLIENT_ID || "";
  const cfSecret = process.env.CF_ACCESS_CLIENT_SECRET || "";

  const headers: Record<string, string> = {};
  // CF Access estripa cf-access-authenticated-user-email cuando el request
  // viene autenticado por service token (CF_ACCESS_CLIENT_ID/SECRET).
  // x-acaquant-user-email NO está en el namespace CF, pasa intacto y el
  // backend lo lee con prioridad. Mandamos los dos por compat.
  if (email) {
    headers["cf-access-authenticated-user-email"] = email;
    headers["x-acaquant-user-email"] = email;
  }
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  if (cfId && cfSecret) {
    headers["CF-Access-Client-Id"] = cfId;
    headers["CF-Access-Client-Secret"] = cfSecret;
  }

  // En prod (API_URL definido) si el fetch a /api/me falla cerramos por
  // defecto: redirigimos al home en vez de dejar pasar. El comentario
  // viejo decía "no es agujero porque el backend tiene su gate" — eso
  // sigue siendo cierto para los endpoints /api/* (el backend devuelve
  // 403 igual), pero el HTML de las pages restringidas (/manager, etc.)
  // quedaba accesible visualmente por unos segundos antes de que los
  // fetches fallaran. Un trader llegando vía URL directa veía la página
  // por un instante. Fail-closed evita ese flash.
  try {
    const res = await fetch(`${apiUrl}/api/me`, { headers, cache: "no-store" });
    if (!res.ok) {
      return path.startsWith("/api/")
        ? NextResponse.json({ error: "auth_failed" }, { status: 502 })
        : NextResponse.redirect(new URL("/", request.url));
    }
    const me = (await res.json()) as { modules: string[] };
    if (!me.modules?.includes(requiredModule)) {
      if (path.startsWith("/api/")) {
        return NextResponse.json(
          { error: "forbidden", module: requiredModule },
          { status: 403 },
        );
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
  } catch {
    return path.startsWith("/api/")
      ? NextResponse.json({ error: "auth_failed" }, { status: 502 })
      : NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/manager/:path*",
    "/operaciones/:path*",
    "/operar/:path*",
    "/aum/:path*",
    "/api/chat/:path*",
    "/api/operaciones/:path*",
    "/api/ordenes/:path*",
    "/api/operativa/:path*",
    "/api/risk/:path*",
    "/api/cuentas/:path*",
    "/api/portfolio/:path*",
    "/api/titulos/:path*",
  ],
};
