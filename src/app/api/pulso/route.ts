import { NextResponse } from "next/server";

// Proxy de POST /api/pulso → backend. EL PULSO DEL CLIENTE (AGENT.md §0.dg):
// una pantalla que lleva más de un minuto sin poder refrescar lo dice acá.
// Sin cache, y con identidad: el backend guarda quién estaba ciego.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 10;

const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

function buildHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
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

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const res = await fetch(`${API_URL}/api/pulso`, {
      method: "POST", body, headers: buildHeaders(req), cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
