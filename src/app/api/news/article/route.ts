import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const maxDuration = 30;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");
    if (!target) {
      return NextResponse.json({ ok: false, error: "url requerida" }, { status: 400 });
    }
    const data = await apiFetch(`/api/news/article?url=${encodeURIComponent(target)}`, {
      revalidate: 0,
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 502 });
  }
}
