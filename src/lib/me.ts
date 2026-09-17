import { cache } from "react";
import { headers } from "next/headers";
import { backendHeaders, backendUrl } from "./proxy-backend";

export type Me = {
  email: string;
  role: string;
  modules: string[];
  is_admin: boolean;
  control_comercial: boolean;
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
  const hdrs = await headers();
  // Auth + identidad de confianza + marca de invitado: la única implementación
  // (lib/proxy-backend.ts), la misma que usan los route handlers.
  const authHeaders = await backendHeaders((n) => hdrs.get(n));

  try {
    const res = await fetch(backendUrl("/api/me"), {
      headers: authHeaders,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Me;
  } catch {
    return null;
  }
});
