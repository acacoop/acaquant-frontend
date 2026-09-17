import { proxyCatchAll } from "@/lib/proxy-backend";

// Catch-all proxy de /api/agente/* → backend. EL AV AGENT (docs/AGENT.md).
//
// ⚠️ `revalidate = 0` NO es opcional acá: el botón del agente se esconde
// cuando `/vista` falla, y si Next se guardaba la respuesta de los segundos en
// que la API se reinicia durante un deploy, nadie volvía a preguntar.
// `maxDuration` porque una pasada del agente a pedido puede tardar; el corte
// default de Vercel se ve igual que un backend caído.

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 30;

const h = proxyCatchAll("/api/agente", { timeoutMs: 28_000 });
export const GET = h;
export const POST = h;
