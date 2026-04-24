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
  ["/asistente", "asistente"],
  ["/api/chat", "asistente"],
  ["/operaciones", "operaciones"],
  ["/api/operaciones", "operaciones"],
  ["/api/cuentas", "operaciones"],
  ["/portfolios", "portfolios"],
  ["/aum", "portfolios"],
  ["/api/portfolio", "portfolios"],
  ["/api/titulos", "portfolios"],
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
  if (email) headers["cf-access-authenticated-user-email"] = email;
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  if (cfId && cfSecret) {
    headers["CF-Access-Client-Id"] = cfId;
    headers["CF-Access-Client-Secret"] = cfSecret;
  }

  try {
    const res = await fetch(`${apiUrl}/api/me`, { headers, cache: "no-store" });
    if (!res.ok) return NextResponse.next(); // fail-open
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
    return NextResponse.next(); // fail-open
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/manager/:path*",
    "/asistente/:path*",
    "/operaciones/:path*",
    "/portfolios/:path*",
    "/aum/:path*",
    "/api/chat/:path*",
    "/api/operaciones/:path*",
    "/api/cuentas/:path*",
    "/api/portfolio/:path*",
    "/api/titulos/:path*",
  ],
};
