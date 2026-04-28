import { NextResponse } from "next/server";

// Proxy genérico hacia /api/ordenes del backend FastAPI.
// Mismo patrón que api/manager/[...path]/route.ts.
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export const maxDuration = 30;

async function proxy(req: Request, path: string[]) {
  try {
    const url = new URL(req.url);
    const suffix = path.join("/");
    const qs = url.search;
    const target = `${API_URL}/api/ordenes${suffix ? "/" + suffix : ""}${qs}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    // Propagar identidad del user para que el audit log persista quien
    // mandó/canceló cada orden (sin esto el actor_email queda vacío).
    const userEmail = req.headers.get("cf-access-authenticated-user-email");
    if (userEmail) headers["cf-access-authenticated-user-email"] = userEmail;

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
  return proxy(req, (await params).path ?? []);
}

export async function POST(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, (await params).path ?? []);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  return proxy(req, (await params).path ?? []);
}
