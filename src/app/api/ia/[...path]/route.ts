import { NextResponse } from "next/server";

// Catch-all proxy de /api/ia/* → backend (módulo IA — QuantAI). GET only por
// ahora (briefing y observabilidad son read-only); si algún endpoint futuro
// necesita POST (ej. feedback 👍/👎), agregar el handler acá. Mismo patrón que
// /api/manager/[...path]: propaga la identidad para que el RBAC del backend
// (require_module("ia")) decida por USER, no por service token.
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const url = new URL(req.url);
    const suffix = (await params).path.join("/");
    const target = `${API_URL}/api/ia/${suffix}${url.search}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    // CF Access estripa cf-access-authenticated-user-email con service token →
    // se manda también x-acaquant-user-email (pasa tal cual).
    const userEmail = req.headers.get("cf-access-authenticated-user-email");
    if (userEmail) {
      headers["cf-access-authenticated-user-email"] = userEmail;
      headers["x-acaquant-user-email"] = userEmail;
    }

    const res = await fetch(target, { headers, cache: "no-store" });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
