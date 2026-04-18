import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export async function GET() {
  try {
    const data = await apiFetch("/api/portfolio/tasa-fija", { revalidate: 0 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
