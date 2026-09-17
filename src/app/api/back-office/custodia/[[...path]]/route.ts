import { proxyCatchAll } from "@/lib/proxy-backend";

// LA TENENCIA SEGÚN LA CAJA DE VALORES (CVSA). SOLO GET: el backend no expone
// una sola escritura en este prefijo y acá tampoco — la superficie de escritura
// queda en CERO y no hay que revisarla nunca. Catch-all porque hoy cuelgan
// `/tenencias` y `/movimientos` y mañana van a colgar más.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/back-office/custodia");
export const GET = h;
