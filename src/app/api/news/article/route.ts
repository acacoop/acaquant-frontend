import { NextResponse } from "next/server";
import { proxyBackend } from "@/lib/proxy-backend";

// Lectura de un artículo (el backend lo baja y lo limpia): tarda más que un
// endpoint de datos, por eso `maxDuration`.

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

export function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("url");
  if (!target) return NextResponse.json({ ok: false, error: "url requerida" }, { status: 400 });
  return proxyBackend(req, {
    path: `/api/news/article?url=${encodeURIComponent(target)}`,
    timeoutMs: 28_000,
  });
}
