/**
 * Cliente HTTP para la API de TradingAV.
 *
 * En el servidor (SSR) usa la API_URL + API_KEY del entorno.
 * En el cliente (browser) pasa por /api/proxy de Next.js.
 */

const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";

export async function apiFetch<T>(path: string): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return res.json();
}
