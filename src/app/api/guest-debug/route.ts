import { NextResponse } from "next/server";
import { isGuestRequest } from "@/lib/cf-access";

// TEMPORAL — diagnóstico del portal invitado. Muestra si la env var llegó, si el
// request trae el JWT firmado de CF y qué `aud` tiene, y si la detección de
// invitado dispara. Se borra apenas se resuelve. No expone secretos (solo si las
// envs están seteadas y el aud, que es semi-público).
export async function GET(req: Request) {
  const team = (process.env.CF_ACCESS_TEAM_DOMAIN || "").trim();
  const aud = (process.env.CF_ACCESS_AUD || "").trim();
  const audGuest = (process.env.CF_ACCESS_AUD_GUEST || "").trim();

  const jwt = req.headers.get("cf-access-jwt-assertion");
  let jwtAud: unknown = null;
  let decodeErr: string | null = null;
  if (jwt) {
    try {
      const payload = JSON.parse(
        Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"),
      );
      jwtAud = payload.aud;
    } catch (e) {
      decodeErr = String(e);
    }
  }

  const isGuest = await isGuestRequest((n) => req.headers.get(n));
  const audList = Array.isArray(jwtAud) ? jwtAud : jwtAud ? [jwtAud] : [];

  return NextResponse.json({
    env: {
      team_domain_set: Boolean(team),
      aud_trading_set: Boolean(aud),
      aud_guest_set: Boolean(audGuest),
      aud_guest_value_prefix: audGuest ? audGuest.slice(0, 14) + "…" : null,
    },
    request: {
      jwt_present: Boolean(jwt),
      jwt_aud: jwtAud,
      decode_error: decodeErr,
    },
    match: {
      aud_guest_in_jwt: audGuest ? audList.includes(audGuest) : false,
      is_guest_detected: isGuest,
    },
  });
}
