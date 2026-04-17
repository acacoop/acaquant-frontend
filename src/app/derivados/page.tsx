import { apiFetch } from "@/lib/api";
import { Panel } from "@/components/ui";
import { OpcionesTable, type OpcionDoc } from "@/components/opciones-table";

async function safeFetch<T>(
  path: string,
  fallback: T,
  revalidate = 0
): Promise<T> {
  try {
    return await apiFetch<T>(path, { revalidate });
  } catch {
    return fallback;
  }
}

export default async function DerivadosPage() {
  const opciones = await safeFetch<OpcionDoc[]>(
    "/api/cotizaciones/opciones",
    [],
    10
  );

  return (
    <div className="h-full min-h-0 p-3">
      <Panel title="OPCIONES GGAL" count={opciones.length}>
        <OpcionesTable data={opciones} />
      </Panel>
    </div>
  );
}
