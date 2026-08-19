import { NextRequest, NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Serie ya agregada que arma el backend (`/api/operaciones/flujos/serie`): una
// fila por periodo con el neto de cada moneda, más los totales, las opciones
// del selector y los bounds del calendario.
//
// ANTES bajaba el GRANO (día × cuenta × unidad) de 2 años y el browser hacía
// todo el filtrado y la agrupación: 20.559 filas y 2.512 KB en cada apertura de
// la tab, medido con scripts/diag_peso_operaciones el 2026-08-19. Lo que el
// gráfico dibuja son ~500 barras (o 24 en mensual) con dos números cada una.
interface SerieRow {
  periodo: string;
  ARS: number;
  USD: number;
}

interface Resp {
  agg: string;
  filtro: string;
  serie: SerieRow[];
  totales: Record<string, { entradas: number; salidas: number }>;
  opciones: string[];
  bounds: { min: string; max: string };
}

// PII de clientes (nombres de cuenta en `opciones`) → NO se cachea en el CDN
// compartido de Vercel. El backend ya cachea 300s, así que el ahorro a la DB
// se mantiene.
const CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
};

// La ventana sigue siendo de 2 años: ahora que viaja agregada, no cuesta.
function ventanaPorDefecto(): { desde: string; hasta: string } {
  const hoy = new Date();
  return {
    desde: new Date(hoy.getFullYear() - 2, hoy.getMonth(), 1)
      .toISOString()
      .slice(0, 10),
    hasta: hoy.toISOString().slice(0, 10),
  };
}

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const def = ventanaPorDefecto();
    const params = new URLSearchParams({
      desde: q.get("desde") || def.desde,
      hasta: q.get("hasta") || def.hasta,
      agg: q.get("agg") || "DIARIO",
      filtro: q.get("filtro") || "todas",
      // La lista del selector son 1.021 cuentas / 44 KB y dependen SOLO de
      // `filtro`: la vista la pide en su propio fetch y el resto de las veces
      // manda con_opciones=0. Default true para no romper a un cliente viejo.
      con_opciones: q.get("con_opciones") === "0" ? "false" : "true",
    });
    const seleccion = q.get("seleccion");
    if (seleccion && seleccion !== "__TODAS__") params.set("seleccion", seleccion);

    const data = await apiFetch<Resp>(
      `/api/operaciones/flujos/serie?${params.toString()}`,
      { revalidate: 300 }
    );

    return NextResponse.json(data, { headers: CACHE_HEADERS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
