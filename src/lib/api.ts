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
}

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

  const init: RequestInit & { next?: { revalidate: number } } =
    opts.revalidate && opts.revalidate > 0
      ? { headers, next: { revalidate: opts.revalidate } }
      : { headers, cache: "no-store" };

  const res = await fetch(url, init);

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return res.json();
}
