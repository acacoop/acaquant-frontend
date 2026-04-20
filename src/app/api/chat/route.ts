import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// El endpoint /api/chat puede tardar: prompt grande (~15K tokens) + varias
// tool calls + Gemini latency. Cada turno ~5-8s, modelo puede encadenar 5-6
// turnos en preguntas estratégicas. maxDuration 300s (máx Vercel Pro).
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    // Propagar el email de Cloudflare Access para que el backend pueda
    // auditar quién hizo la consulta (se guarda en Manager.AsistenteLogs).
    const email = req.headers.get("cf-access-authenticated-user-email");
    const extraHeaders: Record<string, string> = {};
    if (email) extraHeaders["cf-access-authenticated-user-email"] = email;

    const body = await req.json();
    const data = await apiFetch("/api/chat", {
      method: "POST",
      revalidate: 0,
      body: JSON.stringify(body),
      extraHeaders,
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
