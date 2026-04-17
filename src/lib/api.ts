/**
 * Cliente HTTP para la API de TradingAV.
 *
 * Headers enviados en cada request:
 * - Authorization: Bearer <API_KEY>          → auth de la API FastAPI
 * - CF-Access-Client-Id / Secret             → bypass Cloudflare Access (Service Token)
 */

const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export async function apiFetch<T>(path: string): Promise<T> {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {};

  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }
  if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
  }

  const res = await fetch(url, {
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return res.json();
}
