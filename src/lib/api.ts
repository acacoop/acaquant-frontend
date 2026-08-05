/**
 * Cliente HTTP para la API de TradingAV.
 *
 * Headers enviados en cada request:
 * - Authorization: Bearer <API_KEY>          → auth de la API FastAPI
 * - CF-Access-Client-Id / Secret             → bypass Cloudflare Access (Service Token)
 * - x-acaquant-user-email                    → email del user (para RBAC backend)
 * - cf-access-authenticated-user-email       → idem (CF Access lo estripa con service
 *                                              token, lo mandamos por compat)
 *
 * Identidad del user: leemos el header `cf-access-authenticated-user-email`
 * que CF inyecta al request del browser cuando atraviesa Cloudflare Access.
 * En SSR (page.tsx) y route handlers (route.ts) se accede vía
 * `next/headers::headers()`. Si no hay (dev / unauthenticated), seguimos sin
 * propagar y el backend cae en service:* → DEFAULT_ROLE.
 *
 * Opciones:
 * - revalidate: segundos que Next cachea la respuesta del upstream. Omitir o
 *               pasar 0 → no-store (siempre fresh, como antes). Por defecto
 *               no cachea para evitar cambios no deseados en rutas viejas.
 */
import { headers as nextHeaders } from "next/headers";
import { isGuestRequest, trustedEmail } from "./cf-access";

const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

async function _readUserEmail(): Promise<string | null> {
  // next/headers::headers() es async desde Next 15+. Falla silenciosa si
  // se llama fuera de contexto request (ej. al construir un módulo).
  try {
    const h = await nextHeaders();
    // Email de confianza: con validación CF activa sale del sello firmado, no del
    // header de texto plano (no spoofeable). Ver lib/cf-access.ts.
    return (await trustedEmail((n) => h.get(n))) || null;
  } catch {
    return null;
  }
}

async function _isGuest(): Promise<boolean> {
  // Portal invitado (www): el aud del sello firmado de CF identifica al invitado.
  // Cierra la única fuga del rol default `sales` (back-office) → el backend lo
  // fuerza a `invitado` cuando ve este header. Ver lib/cf-access.ts.
  try {
    const h = await nextHeaders();
    return await isGuestRequest((n) => h.get(n));
  } catch {
    return false;
  }
}

interface FetchOpts {
  revalidate?: number;
  method?: "GET" | "PUT" | "POST" | "DELETE" | "PATCH";
  body?: string;
  /** Timeout en ms. Default 15s. Pasá 0 para desactivar. */
  timeoutMs?: number;
  /** Headers adicionales a reenviar al backend (ej. cf-access-authenticated-user-email). */
  extraHeaders?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {};

  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }
  if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
  }
  // Propagar identidad del user — sin esto el backend ve `service:<cn>` y
  // rechaza con 403 cualquier endpoint con módulo restringido (portfolios,
  // operaciones, etc.). El header `x-acaquant-user-email` no es CF-controlled,
  // CF lo deja pasar tal cual (a diferencia de cf-access-authenticated-user-email
  // que CF estripa cuando entra service token).
  const userEmail = await _readUserEmail();
  if (userEmail) {
    headers["cf-access-authenticated-user-email"] = userEmail;
    headers["x-acaquant-user-email"] = userEmail;
  }
  if (await _isGuest()) {
    headers["x-acaquant-portal"] = "guest";
  }
  if (opts.body) {
    headers["Content-Type"] = "application/json";
  }
  if (opts.extraHeaders) {
    Object.assign(headers, opts.extraHeaders);
  }

  const method = opts.method || "GET";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  const init: RequestInit & { next?: { revalidate: number } } =
    method === "GET" && opts.revalidate && opts.revalidate > 0
      ? { method, headers, next: { revalidate: opts.revalidate }, signal: controller?.signal }
      : {
          method,
          headers,
          cache: "no-store",
          signal: controller?.signal,
          ...(opts.body ? { body: opts.body } : {}),
        };

  try {
    const res = await fetch(url, init);
    if (!res.ok) {
      // Intento leer detail del cuerpo de error (FastAPI emite {"detail": "..."})
      // y lo agrego al mensaje. Sin esto, un 400/404 con info útil se ve como
      // "API error 400: Bad Request" en el frontend.
      let detail = "";
      try {
        const j = await res.json();
        if (typeof j?.detail === "string") detail = ` — ${j.detail}`;
        else if (typeof j?.error === "string") detail = ` — ${j.error}`;
      } catch {
        /* body no era JSON, ignoramos */
      }
      throw new Error(`API error ${res.status}: ${res.statusText}${detail}`);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(`API timeout (${timeoutMs}ms): ${path}`);
    }
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}


// Wrapper SSR tolerante: fallback ante cualquier fallo (antes copiado idéntico
// en 6 pages). Para páginas que prefieren renderizar con datos vacíos antes
// que romper el SSR cuando el backend está caído.
export async function safeFetch<T>(path: string, fallback: T, revalidate = 0): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate });
  } catch {
    return fallback;
  }
}
