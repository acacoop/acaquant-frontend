import { proxyBackend } from "@/lib/proxy-backend";

// PATCH de un cereal de la Cámara de Bahía — body {precio_usd?}. Audit y validación en el backend.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ cereal: string }> },
) {
  const { cereal } = await params;
  return proxyBackend(req, { path: `/api/derivados/agro/camara-bahia/${encodeURIComponent(cereal)}` });
}
