import { proxyCatchAll } from "@/lib/proxy-backend";

// ABM de cuentas OCULTAS del control de saldos. Ruta propia y no adentro de
// /titulos-negativos porque esa es un GET pelado: un PUT ahí choca con un 405.
// La LECTURA de la lista viaja dentro de /titulos-negativos.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/back-office/saldos");
export const PUT = h;
export const DELETE = h;
