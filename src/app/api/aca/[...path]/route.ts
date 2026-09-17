import { proxyCatchAll } from "@/lib/proxy-backend";

// Proxy catch-all de ACA (RESUMEN EJECUTIVO de la cartera propia → /aca).
// El backend audita cada escritura con el actor real (aca.audit), gatea la
// LECTURA con el módulo `aca` ∪ la allowlist de la mesa y la ESCRITURA con esa
// allowlist: acá solo viaja la identidad de confianza.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/aca");
export const GET = h;
export const POST = h;
export const PATCH = h;
export const PUT = h;
export const DELETE = h;
