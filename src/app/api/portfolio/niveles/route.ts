import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

// Combos (operador_email, nivel_1, nivel_2, nivel_3, nivel_5) de las cuentas activas.
// Pueblan y CRUZAN los filtros madre de la vista NEGOCIO · AUM: cada nivel ofrece
// solo lo que convive con lo elegido en los otros. Reemplazó a `/niveles-1`, que
// devolvía una lista suelta y no permitía cruzar.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const data = await apiFetch("/api/portfolio/niveles", { revalidate: 0 });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
