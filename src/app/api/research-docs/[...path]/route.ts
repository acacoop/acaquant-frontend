import { NextResponse } from "next/server";

// Catch-all proxy de /api/research-docs/* → backend (documentos manuales de la vista
// REPORTES FINANCIEROS, módulo `research`). A diferencia de los otros proxies de
// research, este pasa BINARIO (el PDF embebido) → usamos arrayBuffer, no text().
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

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const url = new URL(req.url);
    const suffix = (await params).path.join("/");
    const target = `${API_URL}/api/research-docs/${suffix}${url.search}`;
    const res = await fetch(target, { headers: buildHeaders(req), cache: "no-store" });
    const buf = await res.arrayBuffer();
    const headers: Record<string, string> = {
      "content-type": res.headers.get("content-type") || "application/octet-stream",
      "Cache-Control": "no-store",
    };
    const cd = res.headers.get("content-disposition");
    if (cd) headers["content-disposition"] = cd;
    return new NextResponse(buf, { status: res.status, headers });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
