import { NextResponse } from "next/server";

// Catch-all proxy de /api/agente/* → backend. EL AV AGENT (docs/AGENT_2.0.md).
//
// ⚠️ **`revalidate = 0` NO es opcional acá.** El agente viejo desapareció de la
// barra y no volvió: el botón se esconde cuando `/vista` falla, y este proxy
// tenía el `cache: "no-store"` del fetch pero le faltaba la mitad que le habla
// a Next. Con solo la mitad, Next puede quedarse con una respuesta vieja — y si
// la que quedó guardada fue el error de los segundos en que la API se reinicia
// durante un deploy, **nadie vuelve a preguntar**.
//
// `maxDuration` porque una pasada del agente a pedido puede tardar: el default
// de Vercel corta antes, y ese corte se ve exactamente igual que un backend
// caído.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

// Propaga la identidad para que el RBAC del backend (módulo `ia` +
// `require_admin` en cada ruta) decida por USER y no por el service token.
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

function buildHeaders(req: Request): Record<string, string> {
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
  return headers;
}

async function proxy(
  req: Request,
  params: Promise<{ path: string[] }>,
  init?: RequestInit,
) {
  try {
    const url = new URL(req.url);
    const suffix = (await params).path.join("/");
    const target = `${API_URL}/api/agente/${suffix}${url.search}`;

    const res = await fetch(target, {
      ...init,
      headers: { ...buildHeaders(req), ...(init?.headers as Record<string, string>) },
      cache: "no-store",
    });
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

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, params);
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const body = await req.text();
  return proxy(req, params, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}
