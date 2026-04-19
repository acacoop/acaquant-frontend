import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// El endpoint /api/chat puede tardar (hasta ~30s con varias tool calls).
// Next.js route handlers default a 15s en Vercel; subimos el límite.
export const maxDuration = 60;

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
