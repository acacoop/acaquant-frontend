import { apiFetch } from "@/lib/api";
import { MMShell } from "@/components/mm/shell";
import type { CurvaBond } from "@/components/mm/types";

export const dynamic = "force-dynamic";

async function safeFetch<T>(path: string, fallback: T): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate: 60 });
  } catch {
    return fallback;
  }
}

// Pre-cargamos solo soberanos (curva default) — el resto se carga vía
// fetch del client cuando el user cambia el dropdown.
export default async function MMPage() {
  const soberanos = await safeFetch<CurvaBond[]>(
    "/api/analitica/listar-curva?curva=soberanos",
    [],
  );
  return (
    <div className="h-screen overflow-hidden">
      <MMShell initialBondsByCurve={{ soberanos }} />
    </div>
  );
}
