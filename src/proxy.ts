import { NextRequest, NextResponse } from "next/server";
import { isGuestRequest, trustedEmail } from "./lib/cf-access";

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
// Cada prefijo lista los módulos que habilitan acceso (OR). El path pasa si el
// user tiene CUALQUIERA. /manager acepta el umbrella `manager` (admin) O los
// sub-módulos (asistente_comercial = manager_comercial + manager_clientes).
// Coincide con require_any_module() del backend en api/auth.py.
const PATH_MODULES: [string, string[]][] = [
  ["/manager", ["manager", "manager_comercial", "manager_clientes", "manager_clientes_bulk", "manager_titulos"]],
  ["/api/manager", ["manager", "manager_comercial", "manager_clientes", "manager_clientes_bulk", "manager_titulos"]],
  // /operar (DOLAR MEP, órdenes vivas, saldo) — módulo `operar`
  ["/operar", ["operar"]],
  ["/api/ordenes", ["operar"]],
  ["/api/operativa", ["operar"]],
  ["/api/operar", ["operar"]],
  ["/api/risk", ["operar"]],
  // /operaciones (movimientos, depósitos, intraday) + /operadores (ex comercial)
  // + /contrapartes (contrapartes + flujo vs aum) — todas módulo `operaciones`
  ["/operaciones", ["operaciones"]],
  ["/operadores", ["operaciones"]],
  ["/referidos", ["operaciones"]],
  ["/contrapartes", ["operaciones"]],
  ["/api/operaciones", ["operaciones"]],
  ["/api/cuentas", ["operaciones"]],
  ["/aum", ["portfolios"]],
  ["/valuaciones", ["portfolios"]],
  ["/api/portfolio", ["portfolios"]],
  ["/api/titulos", ["portfolios"]],
  ["/back-office", ["back-office"]],
  // /renta-variable (Scanner: CEDEARs + métricas quant sobre Trading.PreciosAcciones)
  ["/renta-variable", ["renta-variable"]],
  ["/api/scanner",    ["renta-variable"]],
];

function modulesForPath(path: string): string[] | null {
  for (const [prefix, mods] of PATH_MODULES) {
    if (path === prefix || path.startsWith(prefix + "/")) return mods;
  }
  return null;
}

// Cache en memoria de /api/me por email (TTL corto). El middleware corría un
// fetch bloqueante al backend en CADA navegación → lag al cambiar de vista.
// Con esto, navegaciones seguidas del mismo user reusan el resultado. Costo:
// un cambio de permisos tarda hasta TTL en reflejarse (aceptable).
const ME_TTL_MS = 30_000;
const meCache = new Map<string, { modules: string[]; exp: number }>();

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Email de confianza: con validación CF activa sale del sello firmado
  // (no spoofeable); si no, del header de texto plano. Ver lib/cf-access.ts.
  const email = (await trustedEmail((n) => request.headers.get(n))).toLowerCase();
  // Portal invitado (www): el aud del sello firmado de CF identifica al invitado.
  // Sin esto, /api/me devolvería el rol del email (sales) → un invitado tipeando
  // /back-office entraría (sales lo tiene). Con el header, /api/me da `invitado`
  // (sin back-office) → lo redirige a home.
  const guest = await isGuestRequest((n) => request.headers.get(n));

  // Sanitización: borramos cualquier email que venga en el request entrante
  // (spoofeado si alguien saltea Cloudflare) y seteamos SOLO el verificado. Así
  // TODO route handler aguas abajo (catch-alls /api/manager, /api/ordenes, etc.)
  // lee la identidad de confianza desde estos headers, no la del atacante.
  const fwd = new Headers(request.headers);
  fwd.delete("cf-access-authenticated-user-email");
  fwd.delete("x-acaquant-user-email");
  if (email) {
    fwd.set("cf-access-authenticated-user-email", email);
    fwd.set("x-acaquant-user-email", email);
  }
  const pass = () => NextResponse.next({ request: { headers: fwd } });

  const requiredModules = modulesForPath(path);
  if (!requiredModules) return pass();

  // Dev (sin CF Access activo): dejar pasar todo
  if (!email && !process.env.API_URL) return pass();

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
  if (guest) headers["x-acaquant-portal"] = "guest";

  // En prod (API_URL definido) si el fetch a /api/me falla cerramos por
  // defecto: redirigimos al home en vez de dejar pasar. El comentario
  // viejo decía "no es agujero porque el backend tiene su gate" — eso
  // sigue siendo cierto para los endpoints /api/* (el backend devuelve
  // 403 igual), pero el HTML de las pages restringidas (/manager, etc.)
  // quedaba accesible visualmente por unos segundos antes de que los
  // fetches fallaran. Un trader llegando vía URL directa veía la página
  // por un instante. Fail-closed evita ese flash.
  try {
    // Cache hit: evita el round-trip al backend en navegaciones seguidas.
    // Key separada por portal: el mismo email vía www (invitado) y vía trading
    // (su rol real) no debe compartir módulos cacheados.
    const meKey = guest ? `guest:${email}` : email;
    const cached = meKey ? meCache.get(meKey) : undefined;
    let modules: string[];
    if (cached && cached.exp > Date.now()) {
      modules = cached.modules;
    } else {
      const res = await fetch(`${apiUrl}/api/me`, { headers, cache: "no-store" });
      if (!res.ok) {
        return path.startsWith("/api/")
          ? NextResponse.json({ error: "auth_failed" }, { status: 502 })
          : NextResponse.redirect(new URL("/", request.url));
      }
      const me = (await res.json()) as { modules: string[] };
      modules = me.modules ?? [];
      if (meKey) meCache.set(meKey, { modules, exp: Date.now() + ME_TTL_MS });
    }
    const ok = requiredModules.some((m) => modules.includes(m));
    if (!ok) {
      if (path.startsWith("/api/")) {
        return NextResponse.json(
          { error: "forbidden", modules: requiredModules },
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

  return pass();
}

export const config = {
  matcher: [
    "/manager/:path*",
    "/operaciones/:path*",
    "/operadores/:path*",
    "/referidos/:path*",
    "/contrapartes/:path*",
    "/operar/:path*",
    "/aum/:path*",
    "/valuaciones/:path*",
    "/back-office/:path*",
    "/api/manager/:path*",
    "/api/operaciones/:path*",
    "/api/ordenes/:path*",
    "/api/operativa/:path*",
    "/api/operar/:path*",
    "/api/risk/:path*",
    "/api/cuentas/:path*",
    "/api/portfolio/:path*",
    "/api/titulos/:path*",
  ],
};
