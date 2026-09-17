import { proxyCatchAll } from "@/lib/proxy-backend";

// AJUSTES DE PnL (vista CARTERAS/VALUACIONES → modal AJUSTES). El backend
// audita con el actor real y la escritura es SOLO admin, server-side. Status y
// body van tal cual para no perder el `detail` de FastAPI (400 / 403).

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/portfolio/pnl-ajustes");
export const GET = h;
export const POST = h;
export const PUT = h;
export const DELETE = h;
