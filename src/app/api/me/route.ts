import { NextResponse } from "next/server";
import { isGuestRequest, trustedEmail } from "@/lib/cf-access";

// Proxy a /api/me del backend FastAPI — identidad del caller
// (email + role + modules + is_admin). Consumido por el layout y por proxy.ts.
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export async function GET(req: Request) {
  try {
    // CF Access estripa cf-access-authenticated-user-email con service
    // token; mandamos x-acaquant-user-email también (el que el backend
    // mira con prioridad cuando el JWT es de service token).
    // Email de confianza desde el sello firmado de CF (no spoofeable). Ver cf-access.ts.
    const email = await trustedEmail((n) => req.headers.get(n));
    const headers: Record<string, string> = {};
    if (email) {
      headers["cf-access-authenticated-user-email"] = email;
      headers["x-acaquant-user-email"] = email;
    }
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    // Portal invitado (www): el backend devuelve rol `invitado` + nav de mercado.
    if (await isGuestRequest((n) => req.headers.get(n))) {
      headers["x-acaquant-portal"] = "guest";
    }
    const res = await fetch(`${API_URL}/api/me`, { headers, cache: "no-store" });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
