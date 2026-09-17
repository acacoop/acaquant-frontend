import { proxyBackend } from "@/lib/proxy-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  const filtro = new URL(req.url).searchParams.get("filtro_cuenta") || "todas";
  return proxyBackend(req, {
    path: `/api/portfolio/pnl-todas?filtro_cuenta=${encodeURIComponent(filtro)}`,
  });
}
