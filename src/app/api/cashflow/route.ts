import { proxyBackend } from "@/lib/proxy-backend";

// Serie ya agregada que arma el backend (`/api/operaciones/flujos/serie`): una
// fila por periodo con el neto de cada moneda, más totales, opciones y bounds.
// ANTES bajaba el GRANO de 2 años (20.559 filas, 2.512 KB por apertura de la
// tab) y el browser agrupaba. PII de clientes en `opciones` → `private,
// no-store` hacia el navegador; hacia el backend se reusa 300s (Next data
// cache), como el backend mismo cachea.

function ventanaPorDefecto(): { desde: string; hasta: string } {
  const hoy = new Date();
  return {
    desde: new Date(hoy.getFullYear() - 2, hoy.getMonth(), 1).toISOString().slice(0, 10),
    hasta: hoy.toISOString().slice(0, 10),
  };
}

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const def = ventanaPorDefecto();
  const params = new URLSearchParams({
    desde: q.get("desde") || def.desde,
    hasta: q.get("hasta") || def.hasta,
    agg: q.get("agg") || "DIARIO",
    filtro: q.get("filtro") || "todas",
    // La lista del selector (1.021 cuentas / 44 KB) depende SOLO de `filtro`: la
    // vista la pide en su propio fetch y el resto de las veces manda
    // con_opciones=0. Default true para no romper a un cliente viejo.
    con_opciones: q.get("con_opciones") === "0" ? "false" : "true",
  });
  const seleccion = q.get("seleccion");
  if (seleccion && seleccion !== "__TODAS__") params.set("seleccion", seleccion);
  return proxyBackend(req, {
    path: `/api/operaciones/flujos/serie?${params}`,
    revalidate: 300,
    cacheControl: "private, no-store",
  });
}
