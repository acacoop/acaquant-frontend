import { proxyCatchAll } from "@/lib/proxy-backend";

// Tenencia Valorizada (cuentas propias 100/255/256). Cubre la serie diaria,
// /posiciones?fecha=..., y los POST /precio y /alquiler (sin el handler POST el
// front mostraba "error de red" por un 405).

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/back-office/tenencia-hd");
export const GET = h;
export const POST = h;
