import { proxyToBackend } from "@/lib/proxy-backend";

// GET /api/simulaciones/tickers — universo de tickers para el autocomplete.
// Sin caché propio acá: el universo es estático dentro de un día pero a
// veces se agregan instrumentos. Si el componente lo necesita cacheado,
// lo hace en cliente con useMemo o similar.
export async function GET(req: Request) {
  return proxyToBackend(req, { path: "/api/simulaciones/tickers" });
}
