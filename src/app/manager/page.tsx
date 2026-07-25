import { notFound } from "next/navigation";

import { ManagerView } from "@/components/manager-view";
import { getMe } from "@/lib/me";

// Server component: lee modules del backend y los pasa a ManagerView para
// que filtre tabs según RBAC. El umbrella `manager` (admin) o cualquier
// sub-módulo (`manager_comercial`, `manager_clientes`, `manager_clientes_bulk`)
// habilita el ingreso. Sin ninguno → 404 (defense in depth: el link del
// header ya está oculto, esto evita el bypass por URL directa).
export const dynamic = "force-dynamic";

const MANAGER_MODULES = [
  "manager",
  "manager_clientes",
  "manager_clientes_bulk",
];

export default async function ManagerPage() {
  const me = await getMe();
  // Si el backend no respondió (dev sin API_URL, o fetch falló en prod), modules
  // queda null → ManagerView muestra todas las tabs (permissive). En prod con
  // backend OK, sin manager* → 404.
  const isProd = !!process.env.API_URL;
  const modules = me?.modules ?? null;

  if (isProd && modules !== null && !MANAGER_MODULES.some((m) => modules.includes(m))) {
    notFound();
  }

  return <ManagerView modules={modules} />;
}
