import { safeFetch } from "@/lib/api";
import { FciView } from "@/components/fci-view";
import type { FciTabla } from "@/lib/types-fci";

export const dynamic = "force-dynamic";

const VACIA: FciTabla = { fondos: [], categorias: [], gerentes: [], monedas: [], fecha_max: null, n: 0 };

export default async function FciPage() {
  // SSR con la tabla entera: el VCP cambia una vez por día, así que 60 s de
  // revalidate en el server es de sobra. El cliente pollea lento (5 min) solo
  // para que una pestaña abierta vea el VCP nuevo cuando el job lo baja.
  const tabla = await safeFetch<FciTabla>("/api/fci/tabla", VACIA, 60);
  return <FciView initial={tabla} />;
}
