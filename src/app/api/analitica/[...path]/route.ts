import { proxyCatchAll } from "@/lib/proxy-backend";

// Proxy a /api/analitica/* del backend. Sin cache: las analíticas cambian al
// ritmo de los trades.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/analitica");
export const GET = h;
export const POST = h;
