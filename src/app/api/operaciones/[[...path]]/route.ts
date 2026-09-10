import { NextResponse } from "next/server";

// Proxy a /api/operaciones/* del backend FastAPI.
// Forward auth headers + identidad del user.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

async function proxy(req: Request, path: string[]) {
  try {
    const url = new URL(req.url);
    const suffix = path.join("/");
    const qs = url.search;
    const target = `${API_URL}/api/operaciones${suffix ? "/" + suffix : ""}${qs}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    const userEmail = req.headers.get("cf-access-authenticated-user-email");
    if (userEmail) {
      headers["cf-access-authenticated-user-email"] = userEmail;
      headers["x-acaquant-user-email"] = userEmail;
    }

    // POST: forward el body + content-type (la vista Intraday manda el CSV).
    const init: RequestInit = { method: req.method, headers, cache: "no-store" };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await req.text();
      const ct = req.headers.get("content-type");
      if (ct) headers["content-type"] = ct;
    }

    const res = await fetch(target, init);
    // Bytes crudos siempre: el JSON pasa igual y el .xlsx de /ops/aranceles/export
    // llega intacto (un res.text() lo corrompía). Mismo patrón que el proxy de SENEBIS.
    const body = await res.arrayBuffer();
    const out = new Headers({
      "content-type": res.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    const disp = res.headers.get("content-disposition");
    if (disp) out.set("content-disposition", disp);
    return new NextResponse(body, { status: res.status, headers: out });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return proxy(req, (await params).path ?? []);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return proxy(req, (await params).path ?? []);
}

// PUT/DELETE: los usa la tab DATOS de la calculadora de FINANCIAMIENTO
// (catálogo de SGRs + aranceles). `proxy` ya es agnóstico del método y
// forwardea el body — esto es solo exponerlos.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return proxy(req, (await params).path ?? []);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return proxy(req, (await params).path ?? []);
}
