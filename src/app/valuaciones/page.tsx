import { ValuacionesShell } from "@/components/valuaciones-shell";
import { getMe } from "@/lib/me";

export const dynamic = "force-dynamic";

export default async function ValuacionesPage() {
  // `esAdmin` se resuelve ACÁ, en el servidor, con la identidad ya resuelta —
  // `getMe` está cacheada por request, así que el layout y esta página comparten
  // la misma llamada y no cuesta un viaje extra.
  //
  // Gobierna las DOS acciones de la barra inferior (AJUSTES y TOTALES). Sin
  // admin no se renderizan, y como los dos componentes entran por `next/dynamic`
  // eso significa que su JavaScript NO se descarga: no es esconder un botón, es
  // que el código no llega al navegador. La mayoría de la gente que abre esta
  // vista nunca las va a usar, así que pagarlas en cada carga es puro costo.
  //
  // El gate REAL de la escritura sigue siendo el backend (`require_admin` sobre
  // los ajustes de PnL); esto es defensa en profundidad, igual que el AV AGENT
  // en el layout. `modules === null` (dev sin backend) muestra todo, como el nav.
  const me = await getMe();
  const isProd = !!process.env.API_URL;
  const modules = me?.modules ?? (isProd ? [] : null);
  const esAdmin = modules === null || modules.includes("manager");
  return <ValuacionesShell esAdmin={esAdmin} />;
}
