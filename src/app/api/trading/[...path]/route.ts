import { proxyCatchAll } from "@/lib/proxy-backend";

// Proxy read-only a /api/trading/* (pivots, monitor, universo). GET-ONLY: el
// router de trading no tiene una sola ruta que escriba.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/trading");
export const GET = h;
