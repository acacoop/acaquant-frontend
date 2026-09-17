import { NextResponse } from "next/server";
import { isGuestRequest, trustedEmail } from "./cf-access";

/**
 * EL ÚNICO camino de un route handler (`src/app/api/** /route.ts`) hacia el
 * backend FastAPI. Antes cada handler armaba a mano el bearer, el service
 * token de Cloudflare, la identidad del usuario y el manejo de errores — 26 de
 * una forma, 51 de otra, ninguno con techo de tiempo. Cuando uno se escribía
 * distinto no fallaba nada: la pantalla cargaba y el backend auditaba al
 * usuario como anónimo, o un 403 llegaba disfrazado de 502.
 *
 * Contrato (el mismo para los 77 handlers):
 *  - **Auth hacia el backend**: `Authorization: Bearer API_KEY` + service token
 *    de CF Access (`CF-Access-Client-Id/Secret`).
 *  - **Identidad de CONFIANZA**: `trustedEmail` (con CF activo sale del sello
 *    firmado, el header de texto plano se ignora → no spoofeable). Se manda en
 *    `x-acaquant-user-email` (CF lo deja pasar) y en
 *    `cf-access-authenticated-user-email` (CF lo estripa con service token; va
 *    por compat). Sin identidad el backend ve `service:<cn>` y niega todo
 *    módulo restringido.
 *  - **Portal invitado** (REGLA #8): `x-acaquant-portal: guest` cuando el sello
 *    firmado trae el `aud` de www. Sin la marca el backend resolvería el rol
 *    por email (default `sales`) y un invitado vería el negocio de la mesa.
 *  - **Status y cuerpo del backend TAL CUAL** (bytes crudos: el JSON pasa igual
 *    y un .xlsx o un PDF llegan intactos; `content-disposition` se conserva).
 *    Un 403 del gate llega como 403, un 404 como 404: nunca disfrazados de 502.
 *  - **Fallo de red → 502 JSON `{error}`**. **Techo vencido → 504 JSON**.
 *    Un handler que tira rompe la vista con un error sin mensaje.
 *  - **Techo de tiempo SOLO en lecturas** (GET/HEAD, default 20 s). Abortar
 *    una escritura no deshace lo que el backend ya escribió y deja la pantalla
 *    sin saber si pasó — peor que esperar (misma regla que `conTecho` del
 *    cliente). Las escrituras las corta `maxDuration` de Vercel.
 *  - **`Cache-Control: no-store`** hacia el navegador y `cache: "no-store"`
 *    hacia el backend, salvo que el handler pida otra cosa.
 *
 * Lo que NO hace: `export const dynamic / revalidate / maxDuration` son config
 * del segmento y Next las lee del archivo de la ruta, no de un import. Cada
 * route.ts las declara.
 *
 * El trinquete: un route.ts que lea `process.env` o llame `fetch` no pasa el
 * lint (regla en eslint.config.mjs). Así el próximo handler no vuelve a armar
 * las credenciales a mano.
 */

const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

/** Techo por defecto de una LECTURA hacia el backend (mismo que `usePoll`). */
export const TECHO_LECTURA_MS = 20_000;

export type GetHeader = (name: string) => string | null | undefined;

/**
 * Headers hacia el backend: auth + identidad de confianza + marca de invitado.
 * Recibe un lector de headers para servir tanto a un route handler (`req.headers`)
 * como a SSR (`next/headers`). Es la ÚNICA implementación: `lib/api.ts` (SSR) y
 * `lib/me.ts` la reusan.
 */
export async function backendHeaders(getHeader: GetHeader): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
  }
  const email = await trustedEmail(getHeader);
  if (email) {
    headers["cf-access-authenticated-user-email"] = email;
    headers["x-acaquant-user-email"] = email;
  }
  if (await isGuestRequest(getHeader)) {
    headers["x-acaquant-portal"] = "guest";
  }
  return headers;
}

/** URL absoluta del backend para un path (`/api/...`, con query si va). */
export function backendUrl(path: string): string {
  return `${API_URL}${path}`;
}

/** La query string del request entrante (`?a=1&b=2` o vacío), para reenviarla. */
export function queryDe(req: Request): string {
  return new URL(req.url).search;
}

export interface ProxyOpts {
  /** Path del backend, con query incluida si corresponde. Ej: `/api/news?limit=5`. */
  path: string;
  /** Método hacia el backend. Default: el del request. */
  method?: string;
  /** Body explícito. Default: el del request (para todo método que no sea GET/HEAD). */
  body?: BodyInit | null;
  /** Techo en ms de una LECTURA (GET/HEAD). Default 20 s. 0 = sin techo. */
  timeoutMs?: number;
  /**
   * Techo en ms de una ESCRITURA. Default 0 = sin techo (la corta `maxDuration`
   * de Vercel): abortar un POST que escribió no deshace nada. Ponerlo SOLO para
   * un POST que únicamente calcula (un preview), donde abortar no pierde nada.
   */
  timeoutEscrituraMs?: number;
  /** Cache de Next hacia el backend, en segundos (solo GET). Default 0 = `no-store`. */
  revalidate?: number;
  /** `Cache-Control` hacia el navegador. Default `no-store`. */
  cacheControl?: string;
  /** Headers extra hacia el backend (pisan a los del contrato). */
  headers?: Record<string, string>;
  /**
   * Envuelve el JSON de una respuesta 2xx en `{ [envolverEn]: data }`. Para los
   * pocos endpoints donde el backend devuelve una lista y el cliente espera un
   * objeto con clave (`{serie}`, `{docs}`, `{cuentas}`, `{ops}`). No deriva nada.
   */
  envolverEn?: string;
}

export async function proxyBackend(req: Request, opts: ProxyOpts): Promise<NextResponse> {
  const method = (opts.method ?? req.method).toUpperCase();
  const esLectura = method === "GET" || method === "HEAD";
  const timeoutMs = esLectura ? (opts.timeoutMs ?? TECHO_LECTURA_MS) : (opts.timeoutEscrituraMs ?? 0);
  const cacheControl = opts.cacheControl ?? "no-store";

  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const headers = await backendHeaders((n) => req.headers.get(n));

    let body: BodyInit | null | undefined = opts.body;
    if (body === undefined && !esLectura) {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("multipart/form-data")) {
        // FormData INTACTO y sin Content-Type a mano: el boundary lo genera
        // fetch, y leerlo como texto convierte el archivo en un string ilegible.
        body = await req.formData();
      } else {
        const buf = await req.arrayBuffer();
        if (buf.byteLength > 0) {
          body = buf;
          // Un cliente que manda JSON sin declararlo (o como text/plain, que es
          // lo que pone el navegador por default) sigue llegando como JSON.
          headers["content-type"] = ct && !ct.startsWith("text/plain") ? ct : "application/json";
        }
      }
    }
    if (opts.headers) Object.assign(headers, opts.headers);

    const revalidate = esLectura && opts.revalidate && opts.revalidate > 0 ? opts.revalidate : 0;
    const init: RequestInit & { next?: { revalidate: number } } = {
      method,
      headers,
      signal: controller?.signal,
      ...(body !== undefined && body !== null ? { body } : {}),
      ...(revalidate > 0 ? { next: { revalidate } } : { cache: "no-store" as const }),
    };

    const res = await fetch(backendUrl(opts.path), init);
    const out = new Headers({
      "content-type": res.headers.get("content-type") || "application/json",
      "cache-control": cacheControl,
    });
    const disp = res.headers.get("content-disposition");
    if (disp) out.set("content-disposition", disp);

    if (opts.envolverEn && res.ok) {
      const data: unknown = await res.json();
      return NextResponse.json({ [opts.envolverEn]: data }, { status: res.status, headers: out });
    }
    const buf = await res.arrayBuffer();
    // 204/304 no admiten cuerpo: `new Response(body, {status: 204})` tira.
    const sinCuerpo = res.status === 204 || res.status === 304 || buf.byteLength === 0;
    return new NextResponse(sinCuerpo ? null : buf, { status: res.status, headers: out });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return NextResponse.json(
        { error: `backend sin respuesta en ${Math.round(timeoutMs / 1000)} s: ${opts.path}` },
        { status: 504 },
      );
    }
    return NextResponse.json({ error: String(e) }, { status: 502 });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type CtxCatchAll = { params: Promise<{ path?: string[] }> };

/**
 * Handler listo para un catch-all (`[...path]` o `[[...path]]`): reenvía
 * `prefix/<segmentos>?<query>` al backend con el contrato de `proxyBackend`.
 *
 *   const h = proxyCatchAll("/api/manager", { timeoutMs: 85_000 });
 *   export const GET = h; export const POST = h; ...
 */
export function proxyCatchAll(prefix: string, opts: Omit<ProxyOpts, "path"> = {}) {
  return async (req: Request, ctx: CtxCatchAll): Promise<NextResponse> => {
    const path = (await ctx.params).path ?? [];
    const sub = path.length ? `/${path.map(encodeURIComponent).join("/")}` : "";
    return proxyBackend(req, { ...opts, path: `${prefix}${sub}${queryDe(req)}` });
  };
}
