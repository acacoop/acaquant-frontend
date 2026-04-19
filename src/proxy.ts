import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy (Next.js 16+) — antes se llamaba middleware.
 *
 * Restringe rutas admin (/manager, /asistente, /api/chat) a los emails
 * listados en MANAGER_EMAILS. El email viene del header de Cloudflare Access
 * (`cf-access-authenticated-user-email`).
 *
 * Si MANAGER_EMAILS está vacío (modo dev), deja pasar todo.
 */
const ADMIN_MATCH = ["/manager", "/asistente", "/api/chat"];

export function proxy(request: NextRequest) {
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
