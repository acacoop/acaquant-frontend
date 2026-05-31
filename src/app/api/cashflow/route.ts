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

// PII de clientes (nombre/cuenta/grupo) → NO se cachea en el CDN compartido
// de Vercel. El backend ya cachea 300s, así que el ahorro a Mongo se mantiene.
const CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
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
