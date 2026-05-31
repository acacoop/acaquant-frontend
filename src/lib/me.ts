import { cache } from "react";
import { headers } from "next/headers";

export type Me = {
  email: string;
  role: string;
  modules: string[];
  is_admin: boolean;
};

/**
 * Lee /api/me del backend propagando la identidad del user
 * (cf-access-authenticated-user-email) + auth del frontend al backend
 * (Bearer + CF service token).
 *
 * Devuelve null si falla el fetch o si el backend no respondió OK —
 * el caller decide cómo manejarlo (típicamente: mostrar todos los
 * links en dev, ocultar todos los admin en prod sin me).
 */
// Envuelto en React.cache(): layout + page suelen llamar getMe() en el mismo
// render (ej. /manager, /derivados) → sin esto son 2 round-trips a /api/me.
// cache() los deduplica dentro del mismo request server.
export const getMe = cache(async function getMe(): Promise<Me | null> {
  const API_URL = process.env.API_URL || "https://api.acaquant.com";
  const API_KEY = process.env.API_KEY || "";
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID || "";
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

  const hdrs = await headers();
  const email = hdrs.get("cf-access-authenticated-user-email") ?? "";

  const authHeaders: Record<string, string> = {};
  // CF Access estripa cf-access-authenticated-user-email cuando el origin
  // recibe el request autenticado por service token (Vercel SSR →
  // api.acaquant.com). x-acaquant-user-email no es CF-controlled, pasa
  // intacto y el backend lo lee con prioridad. Mandamos los dos por compat.
  if (email) {
    authHeaders["cf-access-authenticated-user-email"] = email;
    authHeaders["x-acaquant-user-email"] = email;
  }
  if (API_KEY) authHeaders["Authorization"] = `Bearer ${API_KEY}`;
  if (CF_ID && CF_SECRET) {
    authHeaders["CF-Access-Client-Id"] = CF_ID;
    authHeaders["CF-Access-Client-Secret"] = CF_SECRET;
  }

  try {
    const res = await fetch(`${API_URL}/api/me`, {
      headers: authHeaders,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Me;
  } catch {
    return null;
  }
});
