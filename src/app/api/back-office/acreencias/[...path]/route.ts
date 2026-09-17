import { proxyCatchAll } from "@/lib/proxy-backend";

// Acreencias (cobros futuros por cliente). Sin cache: refleja el último precompute.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/back-office/acreencias");
export const GET = h;
