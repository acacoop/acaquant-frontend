import { proxyBackend } from "@/lib/proxy-backend";

// El backend devuelve la lista; el cliente espera `{serie}` (mismo shape que
// /api/aum-total/serie). Sin cache: el usuario edita CARTERA durante el día.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const q = new URLSearchParams();
  for (const k of ["desde", "hasta", "cuenta_filter", "operador"]) {
    const v = sp.get(k);
    if (v) q.set(k, v);
  }
  const suffix = q.toString() ? `?${q}` : "";
  return proxyBackend(req, { path: `/api/portfolio/fci-serie${suffix}`, envolverEn: "serie" });
}
