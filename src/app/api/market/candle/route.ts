import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// yfinance puede tardar 5-15s. Default Vercel Hobby es 10s → bumpeamos a 60.
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const qs = url.search;
    const data = await apiFetch(`/api/market/candle${qs}`, { revalidate: 0 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
