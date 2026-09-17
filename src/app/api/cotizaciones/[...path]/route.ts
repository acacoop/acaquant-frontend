import { proxyCatchAll } from "@/lib/proxy-backend";

// Proxy read-only a /api/cotizaciones/*. Solo GET: evita exponer por accidente
// una mutación (ej. PUT /opciones/tasa). Otro método se agrega explícito.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/cotizaciones");
export const GET = h;
