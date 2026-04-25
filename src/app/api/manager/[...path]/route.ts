import { NextResponse } from "next/server";

// Soporta GET / POST / PATCH / DELETE y tanto JSON como multipart/form-data
// (genérico — el branch de multipart queda por si algún endpoint futuro lo necesita).
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export const maxDuration = 90;

async function proxy(req: Request, path: string[]) {
  try {
    const url = new URL(req.url);
    const suffix = path.join("/");
    const qs = url.search;
    const target = `${API_URL}/api/manager/${suffix}${qs}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    // Propagar la identidad del user para que el backend loguee el actor
    // real en Manager.RoleAudit (sin esto el audit diría "service:...").
    const userEmail = req.headers.get("cf-access-authenticated-user-email");
    if (userEmail) headers["cf-access-authenticated-user-email"] = userEmail;

    const method = req.method.toUpperCase();
    const init: RequestInit = { method, headers, cache: "no-store" };

    if (method !== "GET" && method !== "DELETE") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("multipart/form-data")) {
        // Reenviamos el FormData intacto (fetch maneja el boundary).
        init.body = await req.formData();
        // IMPORTANT: no setear Content-Type manualmente.
      } else {
        const text = await req.text();
        if (text) {
          headers["Content-Type"] = "application/json";
          init.body = text;
        }
      }
    }

    const res = await fetch(target, init);
    const text = await res.text();
    if (!res.ok) {
      return new NextResponse(text, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") || "application/json" },
      });
    }
    return new NextResponse(text, {
      status: 200,
      headers: { "content-type": res.headers.get("content-type") || "application/json" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function PUT(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
