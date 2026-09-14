import { NextResponse } from "next/server";

// Proxy de /api/back-office/custodia/*  — LA TENENCIA SEGÚN LA CAJA DE VALORES (CVSA).
//
// SOLO GET. El backend no expone una sola escritura en este prefijo y acá
// tampoco: `POST`/`PUT`/`DELETE` no existen como handlers, así que Next
// devuelve 405 sin que haya nada que revisar.
//
// Hacia BYMA hay un método que se pide por POST (`transactionsbyreference`),
// pero es una CONSULTA —manda la lista de referencias en el cuerpo porque no
// entra en una query string—. Nuestro endpoint para eso es un GET, así que este
// proxy no necesita abrirse: mantener la superficie de escritura en CERO es
// gratis y no hay que revisarla nunca.
//
// Es catch-all `[[...path]]` a propósito: hoy cuelgan `/tenencias` y
// `/movimientos`, y mañana van a colgar más. Con una ruta por path, el próximo
// endpoint daría 404 de Next — que el componente se traga en silencio y parece
// "no hay datos".
//
// El gate real es el backend (`require_module("back-office")`); acá se propaga
// la identidad para que ese gate pueda decidir.
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

type P = { params: Promise<{ path?: string[] }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request, { params }: P) {
  try {
    const url = new URL(req.url);
    const suffix = ((await params).path || []).join("/");
    const target = `${API_URL}/api/back-office/custodia${suffix ? `/${suffix}` : ""}${url.search}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    const userEmail = req.headers.get("cf-access-authenticated-user-email");
    if (userEmail) {
      headers["cf-access-authenticated-user-email"] = userEmail;
      headers["x-acaquant-user-email"] = userEmail;
    }

    const res = await fetch(target, { method: "GET", headers, cache: "no-store" });
    const text = await res.text();
    // Se reenvía status y cuerpo TAL CUAL: un 403 del gate tiene que llegar como
    // 403 y no disfrazado de error genérico.
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    // Un fallo de red se mapea a 502 JSON. Si esto tirara, la vista rompería con
    // un error sin mensaje.
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
