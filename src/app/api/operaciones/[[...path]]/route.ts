import { proxyCatchAll } from "@/lib/proxy-backend";

// Proxy a /api/operaciones/*. POST: la vista Intraday manda el CSV (el helper
// conserva el content-type). El .xlsx de /ops/aranceles/export llega intacto
// (bytes crudos). PUT/DELETE: la tab DATOS de la calculadora de FINANCIAMIENTO.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/operaciones", { cacheControl: "no-store, no-cache, must-revalidate" });
export const GET = h;
export const POST = h;
export const PUT = h;
export const DELETE = h;
