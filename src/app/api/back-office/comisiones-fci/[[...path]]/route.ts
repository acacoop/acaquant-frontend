import { NextResponse } from "next/server";
import { isGuestRequest, trustedEmail } from "@/lib/cf-access";

// Proxy de la tab COMISIONES FCI (Back Office) hacia
// /api/back-office/comisiones-fci/* del backend: raíz, /detalle, /serie,
// /meses, /fees.
//
// SOLO LECTURA, y no por casualidad: esta vista no tiene ABM. El arancel sale de
// `portafolio.tenencia` (la misma foto que AuM) y del `fee_admin` que la mesa
// carga en Manager → TÍTULOS. El cálculo entero vive en el backend
// (`api/services/comisiones_fci.py`) — acá no se deriva NADA: si el front
// recalculara el ÷2 o el ÷365 por su cuenta habría dos fórmulas para la misma
// plata, y el día que se separen las dos pantallas van a estar seguras de
// números distintos sin que falle nada.
//
// Mismo patrón de auth que contabilidad/interbanking: bearer + service token de
// CF + propagación de la identidad verificada + marca de portal invitado
// (REGLA #8: back-office jamás llega al invitado).
const API_URL = process.env.API_URL || "https://api.acaquant.com";
const API_KEY = process.env.API_KEY || "";
const CF_CLIENT_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_CLIENT_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ path?: string[] }> };

async function proxy(req: Request, params: Ctx["params"]) {
  try {
    const { path } = await params;
    const url = new URL(req.url);
    const sub = path?.length ? `/${path.join("/")}` : "";
    const target = `${API_URL}/api/back-office/comisiones-fci${sub}${url.search}`;

    const headers: Record<string, string> = {};
    if (API_KEY) headers["Authorization"] = `Bearer ${API_KEY}`;
    if (CF_CLIENT_ID && CF_CLIENT_SECRET) {
      headers["CF-Access-Client-Id"] = CF_CLIENT_ID;
      headers["CF-Access-Client-Secret"] = CF_CLIENT_SECRET;
    }
    const userEmail = await trustedEmail((n) => req.headers.get(n));
    if (userEmail) {
      headers["cf-access-authenticated-user-email"] = userEmail;
      headers["x-acaquant-user-email"] = userEmail;
    }
    if (await isGuestRequest((n) => req.headers.get(n))) {
      headers["x-acaquant-portal"] = "guest";
    }

    const res = await fetch(target, { method: "GET", headers, cache: "no-store" });
    const texto = await res.text();
    return new NextResponse(texto, {
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

export const GET = (req: Request, ctx: Ctx) => proxy(req, ctx.params);
