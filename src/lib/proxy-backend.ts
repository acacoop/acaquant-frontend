/**
 * Helper de proxy hacia el backend (api.acaquant.com).
 *
 * A diferencia de `apiFetch`, este helper:
 * - PROPAGA el status code y el body del backend tal cual (sin tirar error
 *   en 4xx/5xx). Necesario para CRUD donde un 404 del backend debe llegar
 *   al client como 404, no como 500 genérico.
 * - PROPAGA el email del user de Cloudflare Access automáticamente.
 *
 * Se usa para todos los métodos (GET / POST / PUT / DELETE) en route
 * handlers de Next que tienen que conservar la semántica HTTP del backend.
 */

import { isGuestRequest, trustedEmail } from "./cf-access";

const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

interface ProxyOpts {
  /** Path completo en el backend, ej. "/api/simulaciones/abc123". */
  path: string;
  /** Método HTTP. Si POST/PUT/PATCH también propaga el body. */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Body crudo (string JSON). Solo para POST/PUT/PATCH. */
  body?: string;
}

export async function proxyToBackend(
  req: Request,
  opts: ProxyOpts,
): Promise<Response> {
  const headers: Record<string, string> = {};

  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
  }

  // Email de confianza desde el sello firmado de CF (no spoofeable). Forwardeamos
  // x-acaquant-user-email (el que el backend lee con prioridad). Ver lib/cf-access.ts.
  const email = await trustedEmail((n) => req.headers.get(n));
  if (email) {
    headers["cf-access-authenticated-user-email"] = email;
    headers["x-acaquant-user-email"] = email;
  }

  // Portal invitado: si el sello firmado de CF tiene el aud de www, el backend
  // fuerza rol `invitado` (default-deny en todo lo gated). No spoofeable.
  if (await isGuestRequest((n) => req.headers.get(n))) {
    headers["x-acaquant-portal"] = "guest";
  }

  if (opts.body) headers["Content-Type"] = "application/json";

  const init: RequestInit = {
    method: opts.method || "GET",
    headers,
    cache: "no-store",
    ...(opts.body ? { body: opts.body } : {}),
  };

  const res = await fetch(`${API_URL}${opts.path}`, init);
  const text = await res.text();

  // 204 No Content no debe traer body.
  if (res.status === 204) {
    return new Response(null, { status: 204 });
  }

  return new Response(text, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") || "application/json",
    },
  });
}
