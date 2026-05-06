import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

interface CuentaDoc {
  id_cuenta: string;
  cuenta: string;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const cuentas = await apiFetch<CuentaDoc[]>(
      `/api/portfolio/cuentas`,
      { revalidate: 0 }
    );
    return NextResponse.json({ cuentas }, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
