import { proxyCatchAll } from "@/lib/proxy-backend";

// Proxy de Manager. JSON y multipart/form-data (el helper reenvía el FormData
// intacto). La identidad viaja para que Manager.RoleAudit registre el actor
// real. `maxDuration` 90: los bulks tardan más que el default de Vercel.

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 90;

const h = proxyCatchAll("/api/manager", { timeoutMs: 88_000 });
export const GET = h;
export const POST = h;
export const PATCH = h;
export const PUT = h;
export const DELETE = h;
