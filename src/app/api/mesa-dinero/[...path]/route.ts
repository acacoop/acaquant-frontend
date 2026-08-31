import { NextResponse } from "next/server";

// Proxy catch-all de MESA DE DINERO (vista NEGOCIO → /mesa-dinero) hacia
// /api/mesa-dinero/* del backend. Mismo patrón que /api/manager: bearer +
// service token de CF + propagación de la identidad del user (el backend
// audita cada escritura con el actor real en operaciones.mesa_dinero_audit
// y aplica el gate de escritura per-usuario).
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

// Parsear el Excel del informe + reemplazar el mes tarda más que el default
// de Vercel. Mismo criterio que el proxy de Manager.
export const maxDuration = 90;

async function proxy(req: Request, path: string[]) {
  try {
    const url = new URL(req.url);
    const suffix = path.join("/");
    const qs = url.search;
    const target = `${API_URL}/api/mesa-dinero/${suffix}${qs}`;

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
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("multipart/form-data")) {
        // Importación del Excel de ACA VALORES (POST /retorno/import). Se
        // reenvía el FormData INTACTO y sin setear Content-Type a mano: el
        // boundary lo genera fetch y escribirlo nosotros lo rompe. Leerlo con
        // req.text() —lo que hacía este proxy para todo— convertía el archivo
        // en un string y el backend recibía un multipart ilegible.
        init.body = await req.formData();
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
    return new NextResponse(text, {
      status: res.status,
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
