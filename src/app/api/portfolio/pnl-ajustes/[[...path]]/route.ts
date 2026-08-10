import { NextResponse } from "next/server";

// Proxy catch-all de AJUSTES DE PnL (vista CARTERAS/VALUACIONES → modal AJUSTES)
// hacia /api/portfolio/pnl-ajustes[/*] del backend. Mismo patrón que
// /api/mesa-dinero: bearer + service token de CF + propagación de la identidad
// del user (el backend audita cada escritura con el actor real en
// operaciones.pnl_ajustes_audit y la escritura es SOLO admin, server-side).
// Se re-emite status y body tal cual para no perder el `detail` de FastAPI
// (400 de validación, 403 sin permiso).
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function proxy(req: Request, path: string[] | undefined) {
  try {
    const url = new URL(req.url);
    const suffix = (path || []).join("/");
    const target = `${API_URL}/api/portfolio/pnl-ajustes${suffix ? `/${suffix}` : ""}${url.search}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    // CF Access estripa cf-access-authenticated-user-email con service token;
    // x-acaquant-user-email pasa intacto y el backend lo lee con prioridad.
    const userEmail = req.headers.get("cf-access-authenticated-user-email");
    if (userEmail) {
      headers["cf-access-authenticated-user-email"] = userEmail;
      headers["x-acaquant-user-email"] = userEmail;
    }

    const method = req.method.toUpperCase();
    const init: RequestInit = { method, headers, cache: "no-store" };

    if (method !== "GET" && method !== "DELETE") {
      const text = await req.text();
      if (text) {
        headers["Content-Type"] = "application/json";
        init.body = text;
      }
    }

    const res = await fetch(target, init);
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function POST(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function PUT(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, (await params).path);
}
