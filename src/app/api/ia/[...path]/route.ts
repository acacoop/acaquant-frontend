import { NextResponse } from "next/server";

// ⚠️⚠️ **ESTA RUTA NO PUEDE CACHEARSE, Y NO LO DECLARABA** (2026-08-24).
//
// El AV AGENT desapareció de la barra y no volvió. El backend andaba —los dos
// endpoints verificados contra producción, 143 hallazgos— pero el botón se
// esconde con UNA condición: que `/vista` falle (`av-agent-modal.tsx`).
//
// Y este proxy tenía el `cache: "no-store"` en el `fetch` pero **le faltaba
// `revalidate = 0` en la ruta**, que es la mitad que le habla a Next. El
// CLAUDE.md del repo lo pide desde siempre: *«route handlers que proxean data
// live: `revalidate = 0` + `cache: "no-store"`»*. Con solo la mitad, Next puede
// quedarse con una respuesta vieja — y si la que quedó guardada fue un error
// (por ejemplo los segundos en que la API se reinicia durante un deploy),
// **el botón no vuelve nunca**: nadie vuelve a preguntar.
//
// HIPÓTESIS, no hecho verificado: no pude reproducirlo desde acá y la causa
// definitiva sale del Network del navegador. Pero la ruta violaba una regla
// escrita del repo, el síntoma encaja, y el arreglo es correcto igual.
//
// `maxDuration` por la misma razón que Manager: `vista()` mide **1.706 ms** en
// el Droplet (medido hoy) y es el endpoint más lento de la app. El default de
// Vercel corta antes de que un backend lento conteste, y ese corte se ve
// exactamente igual que esto.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

// Catch-all proxy de /api/ia/* → backend (módulo IA — QuantAI). GET (briefing,
// observabilidad, copiloto/vistas) + POST (copiloto + feedback 👍/👎). Mismo
// patrón que /api/manager/[...path]: propaga la identidad para que el RBAC del
// backend (require_module("ia")) decida por USER, no por service token.
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

function buildHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
  if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
  }
  // CF Access estripa cf-access-authenticated-user-email con service token →
  // se manda también x-acaquant-user-email (pasa tal cual).
  const userEmail = req.headers.get("cf-access-authenticated-user-email");
  if (userEmail) {
    headers["cf-access-authenticated-user-email"] = userEmail;
    headers["x-acaquant-user-email"] = userEmail;
  }
  return headers;
}

async function proxy(
  req: Request,
  params: Promise<{ path: string[] }>,
  init?: RequestInit,
) {
  try {
    const url = new URL(req.url);
    const suffix = (await params).path.join("/");
    const target = `${API_URL}/api/ia/${suffix}${url.search}`;

    const res = await fetch(target, {
      ...init,
      headers: { ...buildHeaders(req), ...(init?.headers as Record<string, string>) },
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, params);
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const body = await req.text();
  return proxy(req, params, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}
