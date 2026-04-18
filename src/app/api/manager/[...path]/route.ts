import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

async function proxy(req: Request, path: string[]) {
  try {
    const url = new URL(req.url);
    const suffix = path.join("/");
    const qs = url.search;
    const apiPath = `/api/manager/${suffix}${qs}`;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const data = await apiFetch(apiPath, { revalidate: 0, method: "POST", body: JSON.stringify(body) });
      return NextResponse.json(data);
    }

    const data = await apiFetch(apiPath, { revalidate: 0 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
