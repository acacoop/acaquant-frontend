import { NextResponse } from "next/server";

// Proxy a /api/analitica/* del backend FastAPI.
// Sin cache: las analíticas pueden cambiar al ritmo de los trades.
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (API_KEY) h["Authorization"] = `Bearer ${API_KEY}`;
  if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
    h["CF-Access-Client-Id"] = CF_CLIENT_ID;
    h["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
  }
  return h;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const url = new URL(req.url);
    const target = `${API_URL}/api/analitica/${path.join("/")}${url.search}`;
    const res = await fetch(target, { headers: authHeaders(), cache: "no-store" });
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const target = `${API_URL}/api/analitica/${path.join("/")}`;
    const body = await req.text();
    const headers = { ...authHeaders(), "content-type": "application/json" };
    const res = await fetch(target, { method: "POST", headers, body, cache: "no-store" });
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
