import { NextResponse } from "next/server";

export async function GET() {
  const API_URL = process.env.API_URL || "(not set)";
  const API_KEY = process.env.API_KEY ? "set" : "(not set)";
  const CF_ID = process.env.CF_ACCESS_CLIENT_ID ? "set" : "(not set)";
  const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET ? "set" : "(not set)";

  let healthResult = "";
  let mepResult = "";

  try {
    const headers: Record<string, string> = {};
    if (process.env.API_KEY) {
      headers["Authorization"] = `Bearer ${process.env.API_KEY}`;
    }
    if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
    }

    const healthRes = await fetch(`${process.env.API_URL}/api/health`, { headers, cache: "no-store" });
    healthResult = `${healthRes.status} - ${await healthRes.text()}`;

    const mepRes = await fetch(`${process.env.API_URL}/api/cotizaciones/mep`, { headers, cache: "no-store" });
    mepResult = `${mepRes.status} - ${await mepRes.text()}`;
  } catch (e) {
    healthResult = `error: ${e}`;
  }

  return NextResponse.json({
    env: { API_URL, API_KEY, CF_ID, CF_SECRET },
    healthResult,
    mepResult,
  });
}
