import { NextResponse } from "next/server";

// Proxy a /api/mm/* del backend FastAPI.
// Sin cache: el live es ~1Hz, el tape ~2s, los agregados ya cachean
// del lado backend.
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
    const target = `${API_URL}/api/mm${suffix ? "/" + suffix : ""}${qs}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    // Propagar identidad del user para que el gate `_MM` (require_module)
    // resuelva el rol correcto. CF Access estripa
    // cf-access-authenticated-user-email cuando entra por service token;
    // x-acaquant-user-email lo deja pasar y el backend lo lee con prioridad.
    const userEmail = req.headers.get("cf-access-authenticated-user-email");
    if (userEmail) {
      headers["cf-access-authenticated-user-email"] = userEmail;
      headers["x-acaquant-user-email"] = userEmail;
    }

    const res = await fetch(target, { method: "GET", headers, cache: "no-store" });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
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
