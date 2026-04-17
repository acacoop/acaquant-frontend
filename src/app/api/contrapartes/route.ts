import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

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

const CACHE_HEADERS = {
  "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
};

export async function GET() {
  try {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear() - 2, hoy.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const hasta = hoy.toISOString().slice(0, 10);

    const [flujos, contrapartes] = await Promise.all([
      apiFetch<FlujoDoc[]>(
        `/api/operaciones/flujo?desde=${desde}&hasta=${hasta}`,
        { revalidate: 300 }
      ),
      apiFetch<ContraparteDoc[]>(`/api/cuentas/contrapartes`, {
        revalidate: 3600,
      }),
    ]);

    return NextResponse.json(
      { flujos, contrapartes },
      { headers: CACHE_HEADERS }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
