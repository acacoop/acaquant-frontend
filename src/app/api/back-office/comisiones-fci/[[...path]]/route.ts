import { proxyCatchAll } from "@/lib/proxy-backend";

// Tab COMISIONES FCI (Back Office): raíz, /detalle, /serie, /meses, /fees.
// SOLO LECTURA, y no por casualidad: esta vista no tiene ABM. El cálculo entero
// vive en el backend (`api/services/comisiones_fci.py`) — acá no se deriva nada.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/back-office/comisiones-fci");
export const GET = h;
