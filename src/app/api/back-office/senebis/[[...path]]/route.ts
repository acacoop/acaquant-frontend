import { NextResponse } from "next/server";

// Proxy catch-all de SENEBIS (Back Office → SENEBIS) hacia
// /api/back-office/senebis/* del backend: /ops (+/{id}, /{id}/estado),
// /opciones, /comitentes, /agentes, /excel (espejo JSON) y /export (.xlsx
// BINARIO — por eso este proxy pasa bytes crudos, no texto: un res.text()
// corrompería el archivo). Mismo patrón de auth que /api/mesa-dinero:
// bearer + service token CF + propagación de la identidad del user (el
// backend audita cada cambio con el actor real en operaciones.senebis_audit
// y usa el email para la presencia de la vista).
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

async function proxy(req: Request, path: string[] | undefined) {
  try {
    const url = new URL(req.url);
    const sub = path?.length ? `/${path.join("/")}` : "";
    const target = `${API_URL}/api/back-office/senebis${sub}${url.search}`;

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
    // Bytes crudos siempre: JSON pasa igual y el .xlsx de /export llega intacto.
    const body = await res.arrayBuffer();
    const out = new Headers({
      "content-type": res.headers.get("content-type") || "application/json",
      "cache-control": "no-store",
    });
    const disp = res.headers.get("content-disposition");
    if (disp) out.set("content-disposition", disp);
    return new NextResponse(body, { status: res.status, headers: out });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  return proxy(req, (await params).path);
}

export async function POST(req: Request, { params }: Ctx) {
  return proxy(req, (await params).path);
}

export async function PATCH(req: Request, { params }: Ctx) {
  return proxy(req, (await params).path);
}

export async function PUT(req: Request, { params }: Ctx) {
  return proxy(req, (await params).path);
}

export async function DELETE(req: Request, { params }: Ctx) {
  return proxy(req, (await params).path);
}
