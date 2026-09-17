import { proxyCatchAll } from "@/lib/proxy-backend";

// Proxy /api/ordenes. La identidad viaja para que el audit log persista quién
// mandó/canceló cada orden.

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const h = proxyCatchAll("/api/ordenes", { timeoutMs: 28_000 });
export const GET = h;
export const POST = h;
export const DELETE = h;
