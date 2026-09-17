import { proxyBackend } from "@/lib/proxy-backend";

// Tab CHICAGO (futuros CBOT del feed Eikon de oficina).

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return proxyBackend(req, { path: "/api/derivados/agro/chicago" });
}
