import { proxyBackend, queryDe } from "@/lib/proxy-backend";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: `/api/news${queryDe(req)}` });
}
