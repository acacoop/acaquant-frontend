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

const normal = proxyCatchAll("/api/agente", { timeoutMs: 28_000 });
const stream = proxyCatchAll("/api/agente", { timeoutMs: 28_000, stream: true });

export async function GET(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
	const path = (await ctx.params).path ?? [];
	return path.at(-1) === "events" ? stream(req, ctx) : normal(req, ctx);
}

export const POST = normal;
