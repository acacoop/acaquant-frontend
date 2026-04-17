import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

interface FlujoDoc {
  boleto?: number | string;
  concertacion: string;
  tipoOperacion?: string;
  cuenta?: string;
  denominacion?: string;
  unidad?: string;
  bruto: number;
  segmento?: string;
  contraparte?: string;
  moneda?: string;
}

interface ContraparteDoc {
  cuenta?: string;
  id_cuenta?: string;
  nombre?: string;
  grupo?: string;
}

export async function GET() {
  try {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear() - 2, hoy.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const hasta = hoy.toISOString().slice(0, 10);

    const [flujos, contrapartes] = await Promise.all([
      apiFetch<FlujoDoc[]>(
        `/api/operaciones/flujo?desde=${desde}&hasta=${hasta}`
      ),
      apiFetch<ContraparteDoc[]>(`/api/cuentas/contrapartes`),
    ]);

    return NextResponse.json({ flujos, contrapartes });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
