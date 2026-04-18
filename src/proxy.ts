import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const managerEmails = (process.env.MANAGER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  // Dev: sin emails configurados → acceso libre
  if (managerEmails.length === 0) return NextResponse.next();

  const email = request.headers.get("cf-access-authenticated-user-email") ?? "";
  if (!managerEmails.includes(email)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/manager/:path*"],
};
