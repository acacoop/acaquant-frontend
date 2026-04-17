import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

interface Flujo {
  boleto?: string;
  cuenta?: string;
  concertacion: string;
  informacion?: string;
  bruto: number;
  unidad: string;
}

interface Accionista {
  cuenta: string;
  nombre: string;
  grupo: string;
}

export async function GET() {
  try {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear() - 2, hoy.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const hasta = hoy.toISOString().slice(0, 10);

    const [flujos, accionistas] = await Promise.all([
      apiFetch<Flujo[]>(
        `/api/operaciones/flujos?desde=${desde}&hasta=${hasta}`
      ),
      apiFetch<Accionista[]>(`/api/cuentas/accionistas`),
    ]);

    return NextResponse.json({ flujos, accionistas });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
