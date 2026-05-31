import { NextResponse } from "next/server";
import { decodeJwt } from "jose";

// DIAGNÓSTICO TEMPORAL — borrar tras resolver la validación de CF Access.
// Muestra qué headers/claims te manda Cloudflare cuando entrás por
// trading.acaquant.com, para comparar contra lo que espera la validación.
// No verifica firma (solo decodifica) y solo expone los claims del propio
// caller — no filtra datos de otros usuarios.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const jwt = req.headers.get("cf-access-jwt-assertion");
  const emailHeader = req.headers.get("cf-access-authenticated-user-email");

  let claims: Record<string, unknown> | null = null;
  let decodeErr = "";
  if (jwt) {
    try {
      const c = decodeJwt(jwt);
      claims = { iss: c.iss, aud: c.aud, email: c.email, exp: c.exp };
    } catch (e) {
      decodeErr = String(e);
    }
  }

  return NextResponse.json({
    hasJwt: Boolean(jwt),
    jwtLen: jwt?.length ?? 0,
    emailHeaderPresent: Boolean(emailHeader),
    claims,
    decodeErr,
    expectedIss: `https://${process.env.CF_ACCESS_TEAM_DOMAIN || ""}`,
    expectedAud: process.env.CF_ACCESS_AUD || "",
    enforced: Boolean(process.env.CF_ACCESS_TEAM_DOMAIN && process.env.CF_ACCESS_AUD),
  });
}
