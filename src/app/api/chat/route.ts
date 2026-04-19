import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// El endpoint /api/chat puede tardar: prompt grande (~15K tokens) + varias
// tool calls + Gemini latency. Cada turno ~5-8s, modelo puede encadenar 5-6
// turnos en preguntas estratégicas. maxDuration 300s (máx Vercel Pro).
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const data = await apiFetch("/api/chat", {
      method: "POST",
      revalidate: 0,
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
