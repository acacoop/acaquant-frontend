import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

interface DiffRow {
  id_cuenta: string;
  cuenta: string;
  saldo_actual: number | null;
  saldo_anterior: number | null;
  diff: number;
  es_nueva: boolean;
  es_cerrada: boolean;
}

interface BackendResp {
  fecha_actual_pedida:     string;
  fecha_anterior_pedida:   string;
  fecha_actual_resuelta:   string;
  fecha_anterior_resuelta: string;
  moneda:                  "ARS" | "USD";
  mep_actual:              number | null;
  mep_anterior:            number | null;
  mep_missing_actual:      boolean;
  mep_missing_anterior:    boolean;
  filas:                   DiffRow[];
  total_diff:              number;
  n_total:                 number;
  n_nuevas:                number;
  n_cerradas:              number;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const fa = url.searchParams.get("fecha_actual");
    const fp = url.searchParams.get("fecha_anterior");
    if (!fa || !fp) {
      return NextResponse.json({ error: "fecha_actual y fecha_anterior requeridos" }, { status: 400 });
    }
    const cf = url.searchParams.get("cuenta_filter");
    const moneda = url.searchParams.get("moneda");
    const q = new URLSearchParams({ fecha_actual: fa, fecha_anterior: fp });
    if (cf) q.set("cuenta_filter", cf);
    if (moneda) q.set("moneda", moneda);
    const operador = url.searchParams.get("operador");
    if (operador) q.set("operador", operador);

    const data = await apiFetch<BackendResp>(`/api/portfolio/diff?${q}`, { revalidate: 0 });
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
