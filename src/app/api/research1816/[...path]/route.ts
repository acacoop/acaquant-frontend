import { NextResponse } from "next/server";

// Catch-all proxy de /api/research1816/* → backend (vista RESEARCH — módulo
// `research`). Cubre los fetches del browser: /universo /series /spread /mails
// /mails/buscar. Mismo patrón que /api/ia/[...path]: propaga la identidad para
// que el RBAC del backend (require_module("research")) decida por USER.
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
    const target = `${API_URL}/api/research1816/${suffix}${url.search}`;
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
