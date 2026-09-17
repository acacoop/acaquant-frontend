import { proxyCatchAll } from "@/lib/proxy-backend";

// Proxy /api/risk (datos de cuenta — módulo `operar` en proxy.ts y backend).

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const h = proxyCatchAll("/api/risk", { timeoutMs: 28_000 });
export const GET = h;
export const POST = h;
export const DELETE = h;
