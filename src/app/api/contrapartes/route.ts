import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ResumenRow {
  dia: string;
  contraparte: string;
  grupo: string;
  moneda?: string;
  bruto: number;
  n: number;
}

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

// PII de contrapartes → NO al CDN compartido (el backend ya cachea 300s).
const CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(req: Request) {
  try {
    const dia = new URL(req.url).searchParams.get("dia");

    // Drill-down de un día puntual: operaciones individuales de ESE día
    // (el resumen agregado no las tiene — viaja solo cuando se pide).
    if (dia) {
      const ops = await apiFetch<FlujoDoc[]>(
        `/api/operaciones/flujo?desde=${dia}&hasta=${dia}`,
        { revalidate: 0 }
      );
      return NextResponse.json({ ops }, { headers: CACHE_HEADERS });
    }

    // Vista general: agregado por (día, contraparte, moneda) que arma el
    // backend — antes bajaban 2 años de operaciones crudas y React agrupaba.
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear() - 2, hoy.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const hasta = hoy.toISOString().slice(0, 10);

    const resumen = await apiFetch<{
      filas: ResumenRow[];
      grupos: string[];
      monedas: string[];
    }>(`/api/operaciones/flujo/resumen?desde=${desde}&hasta=${hasta}`, {
      revalidate: 0,
    });

    return NextResponse.json(resumen, { headers: CACHE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
