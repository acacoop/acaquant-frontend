import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware de acceso admin.
 *
 * Restringe ciertas rutas (/manager, /asistente y su proxy /api/chat) a los
 * emails definidos en MANAGER_EMAILS (coma-separado). Si MANAGER_EMAILS está
 * vacío, estamos en modo dev y dejamos pasar todo.
 *
 * El email llega en el header `cf-access-authenticated-user-email`, que
 * Cloudflare Access inyecta cuando el usuario pasa el OTP.
 */
const ADMIN_MATCH = ["/manager", "/asistente", "/api/chat"];

export function middleware(request: NextRequest) {
  const managerEmails = (process.env.MANAGER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (managerEmails.length === 0) return NextResponse.next();

  const path = request.nextUrl.pathname;
  const isRestricted = ADMIN_MATCH.some(
    (p) => path === p || path.startsWith(p + "/"),
  );
  if (!isRestricted) return NextResponse.next();

  const email = (
    request.headers.get("cf-access-authenticated-user-email") ?? ""
  ).toLowerCase();

  if (!managerEmails.includes(email)) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/manager/:path*", "/asistente/:path*", "/api/chat/:path*"],
};
