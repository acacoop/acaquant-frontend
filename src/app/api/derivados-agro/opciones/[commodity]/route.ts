import { proxyBackend } from "@/lib/proxy-backend";

// Panel de opciones agro, live (bid/offer/last cada 5s).

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ commodity: string }> },
) {
  const { commodity } = await params;
  return proxyBackend(req, { path: `/api/derivados/agro/opciones/${encodeURIComponent(commodity)}` });
}
