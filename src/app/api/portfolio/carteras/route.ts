import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Carteras presentes en el AuM (última foto) — opciones del filtro CARTERA de
// NEGOCIO · AUM. Reenvía operador + niveles porque el endpoint pasa por
// `scope_aum`: así la lista se achica con el scope puesto y no ofrece una
// cartera que, con esos filtros, no puede devolver ninguna fila.
// OJO: NO se reenvía `cartera` — sería pedir las opciones filtradas por la
// selección, y el desplegable se quedaría sólo con lo ya tildado.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NIVELES = ["nivel_1", "nivel_2", "nivel_3", "nivel_5"] as const;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = new URLSearchParams();
    const operador = url.searchParams.get("operador");
    if (operador) q.set("operador", operador);
    for (const n of NIVELES) for (const v of url.searchParams.getAll(n)) q.append(n, v);
    const suffix = q.toString() ? `?${q}` : "";

    const data = await apiFetch(`/api/portfolio/carteras${suffix}`, { revalidate: 0 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
