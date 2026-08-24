import { NextResponse } from "next/server";

// Proxy a /api/ap5/* del backend FastAPI (POSICIONES Y DIFERENCIAS — la
// posición de futuros que informa la CÁMARA, A3/ACyRSA).
//
// Router propio y no un sufijo de `operaciones` porque la FUENTE es otra: aquel
// lee nuestro registro de boletos y este lo que la cámara liquidó. Mezclarlos
// haría que en un incidente nadie sepa cuál de los dos números manda.
//
// `revalidate = 0` + `cache: "no-store"`: la vista cambia todos los días cuando
// corre el job de las 9:00 ART, y una respuesta cacheada mostraría la posición
// de ayer sin que nada falle.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

async function proxy(req: Request, path: string[]) {
  try {
    const url = new URL(req.url);
    const suffix = path.join("/");
    const target = `${API_URL}/api/ap5${suffix ? "/" + suffix : ""}${url.search}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    // Con service token, CF ESTRIPA el header de email → se manda el nuestro en
    // paralelo (el backend lo lee con prioridad). Sin esto, las escrituras
    // quedarían sin autor: `grupo_por` y `cargado_por` guardarían vacío.
    const userEmail = req.headers.get("cf-access-authenticated-user-email");
    if (userEmail) {
      headers["cf-access-authenticated-user-email"] = userEmail;
      headers["x-acaquant-user-email"] = userEmail;
    }

    const init: RequestInit = { method: req.method, headers, cache: "no-store" };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await req.text();
      const ct = req.headers.get("content-type");
      if (ct) headers["content-type"] = ct;
    }

    const res = await fetch(target, init);
    const text = await res.text();
    // El error del backend se reenvía TAL CUAL (status + cuerpo). Un handler que
    // tira rompe la vista con un error sin mensaje.
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return proxy(req, (await params).path ?? []);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  return proxy(req, (await params).path ?? []);
}
