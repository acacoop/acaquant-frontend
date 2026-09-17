import { proxyBackend } from "@/lib/proxy-backend";

// Titulares Reuters (feed Eikon de oficina) — tab NOTICIAS de la watchlist HOME.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/market/eikon-news" });
}
