import { proxyCatchAll } from "@/lib/proxy-backend";

// MESA DE DINERO (vista NEGOCIO → /mesa-dinero). El backend audita cada
// escritura con el actor real y aplica el gate per-usuario. La importación del
// Excel (POST /retorno/import) es multipart: el helper lo reenvía intacto.
// `maxDuration` 90: parsear el informe + reemplazar el mes tarda.

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 90;

const h = proxyCatchAll("/api/mesa-dinero", { timeoutMs: 88_000 });
export const GET = h;
export const POST = h;
export const PATCH = h;
export const PUT = h;
export const DELETE = h;
