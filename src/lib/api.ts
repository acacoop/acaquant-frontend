/**
 * Cliente HTTP para la API de TradingAV.
 *
 * Headers enviados en cada request:
 * - Authorization: Bearer <API_KEY>          → auth de la API FastAPI
 * - CF-Access-Client-Id / Secret             → bypass Cloudflare Access (Service Token)
 *
 * Opciones:
 * - revalidate: segundos que Next cachea la respuesta del upstream. Omitir o
 *               pasar 0 → no-store (siempre fresh, como antes). Por defecto
 *               no cachea para evitar cambios no deseados en rutas viejas.
 */

const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

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
      throw new Error(`API error ${res.status}: ${res.statusText}`);
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
