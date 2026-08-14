import { NextResponse } from "next/server";
import { isGuestRequest, trustedEmail } from "@/lib/cf-access";

// Proxy de la tab INTERBANKING (Back Office) hacia
// /api/back-office/interbanking/* del backend: /vista y /cuentas.
//
// ⚠️ SOLO EXPORTA **GET**, a propósito. Toda la integración con Interbanking es
// de lectura: los datos los trae `jobs/interbanking_sync` al esquema `bancos` y
// la vista los lee de Postgres. Si mañana alguien agrega un POST del lado del
// backend, este proxy NO lo deja pasar — es una segunda cerradura sobre la
// misma puerta, y la de acá es la que mira internet.
//
// Mismo patrón de auth que /api/back-office/senebis: bearer + service token de
// CF + propagación de la identidad real del usuario, que el backend necesita
// para auditar cada lectura en `bancos.audit_lecturas`.
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  try {
    const { path } = await params;
    const url = new URL(req.url);
    const sub = path?.length ? `/${path.join("/")}` : "";
    const target = `${API_URL}/api/back-office/interbanking${sub}${url.search}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    // Identidad de CONFIANZA: con CF activo sale del sello firmado (JWT), el
    // header de texto plano se ignora → no spoofeable. El backend la usa para
    // la auditoría de lectura, así que sin esto la auditoría diría "anónimo".
    const userEmail = await trustedEmail((n) => req.headers.get(n));
    if (userEmail) {
      headers["cf-access-authenticated-user-email"] = userEmail;
      headers["x-acaquant-user-email"] = userEmail;
    }
    // Portal invitado (www): REGLA #8. Sin esta marca el backend resolvería el
    // rol por email (default `sales`, que SÍ tiene back-office) y un invitado
    // vería los saldos bancarios de la casa. Con la marca fuerza rol invitado
    // (sin back-office) → 403.
    if (await isGuestRequest((n) => req.headers.get(n))) {
      headers["x-acaquant-portal"] = "guest";
    }

    const res = await fetch(target, { method: "GET", headers, cache: "no-store" });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
