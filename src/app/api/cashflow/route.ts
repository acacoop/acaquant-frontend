import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

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

// Cache-Control: Vercel Edge cachea 5 min y sirve stale hasta 10 min
// mientras revalida en background. El backend también cachea 300s, así
// que en el peor caso sólo se pega a Mongo 12×/hora.
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

    const [flujos, accionistas] = await Promise.all([
      apiFetch<Flujo[]>(
        `/api/operaciones/flujos?desde=${desde}&hasta=${hasta}`,
        { revalidate: 300 }
      ),
      apiFetch<Accionista[]>(`/api/cuentas/accionistas`, { revalidate: 3600 }),
    ]);

    return NextResponse.json({ flujos, accionistas }, { headers: CACHE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
