import { NextResponse } from "next/server";

// El endpoint /api/chat puede tardar: prompt grande (~15K tokens) + varias
// tool calls + Claude latency. Cada turno ~5-8s, modelo puede encadenar 5-6
// turnos en preguntas estratégicas. maxDuration 300s (máx Vercel Pro).
//
// Implementación propia (sin apiFetch) para:
// 1. No comernos el DEFAULT_TIMEOUT_MS=15s de apiFetch — el chat es largo
//    por diseño. Si apiFetch aborta a los 15s, el backend sigue procesando,
//    loggea OK, pero el usuario ve error: desfase clásico logs-OK/user-error.
// 2. Preservar status + body del backend tal cual. Cuando el backend tira
//    429/503/500 con {detail: {code, message, retryable}}, queremos que el
//    front reciba el shape completo para mostrar el mensaje específico.

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
    // Propagar el email de Cloudflare Access para auditar en AsistenteLogs.
    // CF Access estripa cf-access-authenticated-user-email cuando entra
    // por service token; x-acaquant-user-email lo deja pasar.
    const email = req.headers.get("cf-access-authenticated-user-email");
    if (email) {
      headers["cf-access-authenticated-user-email"] = email;
      headers["x-acaquant-user-email"] = email;
    }

    const body = await req.text();

    const res = await fetch(`${API_URL}/api/chat`, {
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
