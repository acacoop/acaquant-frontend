import { proxyBackend } from "@/lib/proxy-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id_cuenta: string }> },
) {
  const { id_cuenta } = await params;
  return proxyBackend(req, {
    path: `/api/valuaciones/${encodeURIComponent(id_cuenta)}/mensual`,
    cacheControl: "no-store, no-cache, must-revalidate",
  });
}
