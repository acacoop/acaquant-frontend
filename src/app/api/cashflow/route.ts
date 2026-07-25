import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

interface ResumenRow {
  dia: string;
  cuenta: string;
  unidad: string;
  entradas: number;
  salidas: number;
  n: number;
}

interface Accionista {
  cuenta: string;
  nombre: string;
  grupo: string;
}

// PII de clientes (nombre/cuenta/grupo) → NO se cachea en el CDN compartido
// de Vercel. El backend ya cachea 300s, así que el ahorro a la DB se mantiene.
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

    // Agregado por (día, cuenta, unidad) que arma el backend — antes bajaban
    // 2 años de movimientos crudos y React agrupaba en el browser.
    const [resumen, accionistas] = await Promise.all([
      apiFetch<{ filas: ResumenRow[] }>(
        `/api/operaciones/flujos/resumen?desde=${desde}&hasta=${hasta}`,
        { revalidate: 300 }
      ),
      apiFetch<Accionista[]>(`/api/cuentas/accionistas`, { revalidate: 3600 }),
    ]);

    return NextResponse.json(
      { filas: resumen.filas, accionistas },
      { headers: CACHE_HEADERS }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
