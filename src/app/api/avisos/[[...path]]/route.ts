import { NextResponse } from "next/server";

// Proxy de /api/avisos/* — LO QUE EL AGENTE LE DEJÓ A CADA PERSONA.
//
// ⚠️ **ESTA RUTA NO EXISTÍA, y por eso `MisAvisos` nunca funcionó** (bug
// 2026-08-19). El componente estaba montado en el layout, el endpoint existía en
// el backend, y el fetch daba **404 de Next** — que el `catch` del componente se
// tragaba en silencio («403 del portal invitado o backend caído: la barra sigue
// andando»). Resultado: el agente mandaba mensajes a un lugar que nadie podía
// leer, y no fallaba nada.
//
// El user lo encontró dos veces sin que ninguno de los dos viéramos la causa:
// primero con el aviso de `comitentes_sin_nivel1` («al usuario que puse el mail
// no le apareció nada») y después con los saldos («visualmente nada»).
//
// Es catch-all `[[...path]]` a propósito: cubre `/api/avisos` (la lista),
// `/api/avisos/hecho` y `/api/avisos/item`. Con una ruta por path, el próximo
// endpoint volvería a dar 404 en silencio.
//
// SIN GATE DE MÓDULO, igual que el backend: el AV AGENT es admin-only pero lo
// que MANDA le llega a cualquiera. El filtro es el email propio y lo aplica el
// backend — acá solo se propaga la identidad.
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

async function proxy(req: Request, path: string[] | undefined) {
  try {
    const url = new URL(req.url);
    const suffix = (path || []).join("/");
    const target = `${API_URL}/api/avisos${suffix ? `/${suffix}` : ""}${url.search}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    // **La identidad es todo acá**: el backend filtra los avisos por el email
    // del que pregunta. Sin propagarla, la lista vuelve vacía para todos.
    const userEmail = req.headers.get("cf-access-authenticated-user-email");
    if (userEmail) {
      headers["cf-access-authenticated-user-email"] = userEmail;
      headers["x-acaquant-user-email"] = userEmail;
    }

    const method = req.method.toUpperCase();
    const init: RequestInit = { method, headers, cache: "no-store" };
    if (method !== "GET" && method !== "DELETE") {
      const text = await req.text();
      if (text) {
        headers["Content-Type"] = "application/json";
        init.body = text;
      }
    }

    const res = await fetch(target, init);
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
        // Es una lista de tareas del día: cachearla mostraría avisos ya cerrados.
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

type P = { params: Promise<{ path?: string[] }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request, { params }: P) {
  return proxy(req, (await params).path);
}

export async function POST(req: Request, { params }: P) {
  return proxy(req, (await params).path);
}
