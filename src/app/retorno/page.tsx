import { getMe } from "@/lib/me";
import { RetornoTotalView } from "@/components/retorno-total-view";

export const dynamic = "force-dynamic";

export default async function RetornoPage() {
  // La boleta de operar del TRADE LAB es SOLO para quien tiene el módulo
  // `operar` (admin-only en la matriz). El gate real está en el backend
  // (/api/ordenes y /api/operar exigen el módulo); esto decide qué se
  // RENDERIZA — un sales o un invitado no ven ni el panel.
  const me = await getMe();
  const puedeOperar = me?.modules?.includes("operar") ?? false;
  return <RetornoTotalView puedeOperar={puedeOperar} />;
}
