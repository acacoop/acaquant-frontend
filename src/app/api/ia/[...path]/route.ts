import { proxyCatchAll } from "@/lib/proxy-backend";

// Catch-all de /api/ia/* (módulo IA — QuantAI): briefing, observabilidad,
// copiloto + feedback. ⚠️ `revalidate = 0` no es opcional: sin él Next se quedó
// con un error de deploy y el AV AGENT desapareció de la barra hasta que alguien
// volvió a preguntar. `maxDuration` porque `vista()` es el endpoint más lento.

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const h = proxyCatchAll("/api/ia", { timeoutMs: 28_000 });
export const GET = h;
export const POST = h;
