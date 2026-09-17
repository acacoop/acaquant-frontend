/**
 * Cliente HTTP para la API de AcaQuant desde SSR (page.tsx / layout.tsx).
 *
 * Los route handlers (`src/app/api/** /route.ts`) NO usan esto: van por
 * `lib/proxy-backend.ts::proxyBackend`, que reenvía status y cuerpo del backend
 * tal cual. `apiFetch` es para quien necesita el JSON parseado en el servidor
 * y tira ante un error (la page decide qué renderizar). Los headers (bearer +
 * service token + identidad de confianza + marca de invitado) salen de
 * `backendHeaders`, la única implementación.
 *
 * Opciones:
 * - revalidate: segundos que Next cachea la respuesta del upstream. Omitir o
 *               pasar 0 → no-store (siempre fresh, como antes). Por defecto
 *               no cachea para evitar cambios no deseados en rutas viejas.
 */
import { headers as nextHeaders } from "next/headers";
import { backendHeaders, backendUrl } from "./proxy-backend";

async function _headersSSR(): Promise<Record<string, string>> {
  // next/headers::headers() es async desde Next 15+. Falla silenciosa si se
  // llama fuera de contexto request (ej. al construir un módulo): sin identidad
  // el backend cae en service:* → DEFAULT_ROLE.
  let get: (n: string) => string | null = () => null;
  try {
    const h = await nextHeaders();
    get = (n) => h.get(n);
  } catch {
    /* fuera de un request */
  }
  return backendHeaders(get);
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
  const url = backendUrl(path);
  // Auth + identidad de confianza + marca de invitado: UNA implementación
  // (lib/proxy-backend.ts), la misma que usan los route handlers.
  const headers = await _headersSSR();
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
