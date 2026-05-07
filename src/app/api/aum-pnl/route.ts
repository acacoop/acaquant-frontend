import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

interface PnLRow {
  ticker: string;
  unidad: string;
  cantidad_actual: number;
  valor_actual: number;
  cash_pagado: number;
  cash_cobrado_venta: number;
  cash_cobrado_pasivo: number;
  breakdown_pasivo: Record<string, number>;
  pnl_total: number;
  pnl_pct: number | null;
  completeness: "completa" | "parcial" | "sin_boletos";
  moneda_mixta: boolean;
  n_movimientos: number;
  fechas_sin_mep: string[];
}

interface BackendResp {
  id_cuenta: string;
  fecha_actual: string | null;
  rows: PnLRow[];
  totales: {
    cash_pagado:         number;
    cash_cobrado_venta:  number;
    cash_cobrado_pasivo: number;
    valor_actual:        number;
    pnl_total:           number;
    pnl_pct:             number | null;
  };
  n_tickers: number;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id_cuenta = url.searchParams.get("id_cuenta");
    if (!id_cuenta) {
      return NextResponse.json({ error: "id_cuenta requerido" }, { status: 400 });
    }
    const data = await apiFetch<BackendResp>(
      `/api/portfolio/pnl?id_cuenta=${encodeURIComponent(id_cuenta)}`,
      { revalidate: 0 }
    );
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
