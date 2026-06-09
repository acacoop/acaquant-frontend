import { createRemoteJWKSet, jwtVerify } from "jose";

// Validación del sello firmado de Cloudflare Access (header Cf-Access-Jwt-Assertion).
// El email en texto plano (cf-access-authenticated-user-email) es FALSIFICABLE si
// alguien llega al origin salteando Cloudflare (ej. la URL *.vercel.app). El sello
// firmado NO se puede falsificar (lo firma CF con su clave privada), así que la
// identidad de confianza sale de validar ese sello.
//
// Se activa SOLO si están las 2 env vars → el deploy del código queda INERTE hasta
// que las agregues en Vercel, y borrar una revierte al instante (sin tocar código):
//   CF_ACCESS_TEAM_DOMAIN = acaquant.cloudflareaccess.com
//   CF_ACCESS_AUD         = <AUD tag de la app de Access que cubre trading.acaquant.com>
// .trim() defensivo: un espacio al pegar la env var en Vercel rompía el match
// exacto de iss/aud y rechazaba sellos legítimos.
const TEAM = (process.env.CF_ACCESS_TEAM_DOMAIN || "").trim();
const AUD = (process.env.CF_ACCESS_AUD || "").trim();
// AUD de la app de Access del PORTAL DE INVITADOS (www.acaquant.com). Si está
// seteada, un JWT con ese aud identifica a un invitado de forma NO spoofeable
// (lo firma CF). El deploy queda inerte hasta agregarla en Vercel:
//   CF_ACCESS_AUD_GUEST = <AUD tag de la app de Access de www.acaquant.com>
const AUD_GUEST = (process.env.CF_ACCESS_AUD_GUEST || "").trim();

export function cfAccessEnforced(): boolean {
  return Boolean(TEAM && AUD);
}

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function jwks() {
  if (!_jwks) {
    _jwks = createRemoteJWKSet(new URL(`https://${TEAM}/cdn-cgi/access/certs`));
  }
  return _jwks;
}

// Verifica el sello contra CUALQUIERA de los aud conocidos (trading + invitado),
// así el mismo código valida usuarios de los dos portales.
function verifyAnyAud(jwt: string) {
  const auds = [AUD, AUD_GUEST].filter(Boolean);
  return jwtVerify(jwt, jwks(), {
    issuer: `https://${TEAM}`,
    ...(auds.length ? { audience: auds } : {}),
  });
}

/** Email verificado desde el sello firmado de CF, o null si falta / no valida. */
export async function verifiedEmailFromJwt(jwt: string | null | undefined): Promise<string | null> {
  if (!jwt) return null;
  try {
    const { payload } = await verifyAnyAud(jwt);
    const email = typeof payload.email === "string" ? payload.email : "";
    return email ? email.toLowerCase().trim() : null;
  } catch {
    return null;
  }
}

/**
 * True si el request entró por la app de Access del portal de invitados (www) —
 * el `aud` del sello firmado coincide con CF_ACCESS_AUD_GUEST. No spoofeable: lo
 * firma Cloudflare. Inerte (siempre false) hasta que se configure el aud de www.
 * Lo usan getMe() y proxyToBackend() para mandar `x-acaquant-portal: guest`.
 */
export async function isGuestRequest(
  getHeader: (name: string) => string | null | undefined,
): Promise<boolean> {
  if (!AUD_GUEST || !TEAM) return false;
  const jwt = getHeader("cf-access-jwt-assertion");
  if (!jwt) return false;
  try {
    const { payload } = await verifyAnyAud(jwt);
    const aud = payload.aud;
    const list = Array.isArray(aud) ? aud : aud ? [aud] : [];
    return list.includes(AUD_GUEST);
  } catch {
    return false;
  }
}

/**
 * Email de confianza para el request actual.
 * - Validación CF activa  → SOLO el email del sello firmado (el header de texto
 *   plano se ignora → no spoofeable).
 * - Validación CF inactiva (dev local sin CF) → cae al header de texto plano.
 */
export async function trustedEmail(
  getHeader: (name: string) => string | null | undefined,
): Promise<string> {
  if (cfAccessEnforced()) {
    return (await verifiedEmailFromJwt(getHeader("cf-access-jwt-assertion"))) ?? "";
  }
  return getHeader("cf-access-authenticated-user-email") ?? "";
}
