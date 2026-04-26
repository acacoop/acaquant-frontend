import { NextResponse } from "next/server";

// Proxy del flow estructurado de cartera. Mismo patrón que /api/chat:
// preserva status + body del backend, propaga el email de Cloudflare,
// no se comprime con timeouts internos del default fetch.
//
// El backend (api/agent/structured/cartera.py) puede tardar 10-30s
// porque corre el loop ReAct completo más el último step forzado a
// `responder_cartera`. maxDuration=300s para no cortar antes que Vercel.

export const maxDuration = 300;

const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export async function POST(req: Request) {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    const email = req.headers.get("cf-access-authenticated-user-email");
    if (email) headers["cf-access-authenticated-user-email"] = email;

    const body = await req.text();

    const res = await fetch(`${API_URL}/api/chat/structured/cartera`, {
      method: "POST",
      headers,
      body,
      cache: "no-store",
    });

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
