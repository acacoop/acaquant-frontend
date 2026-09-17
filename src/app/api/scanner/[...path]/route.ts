import { proxyCatchAll } from "@/lib/proxy-backend";

// Proxy read-only a /api/scanner/*. Datos live del motor (mercado.cedears_snapshot
// se actualiza cada 1s): no-store en todas las capas.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/scanner");
export const GET = h;
