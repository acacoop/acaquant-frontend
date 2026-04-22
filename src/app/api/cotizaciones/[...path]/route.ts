import { NextResponse } from "next/server";

// Proxy read-only a /api/cotizaciones/* del backend FastAPI.
//
// Solo GET: evita exponer accidentalmente mutaciones (p.ej. PUT
// /api/cotizaciones/opciones/tasa). Si hiciera falta otro método, se
// agrega explícito.
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const url = new URL(req.url);
    const target = `${API_URL}/api/cotizaciones/${path.join("/")}${url.search}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }

    const res = await fetch(target, { headers, cache: "no-store" });
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
