import { proxyCatchAll } from "@/lib/proxy-backend";

// Vista FONDOS COMUNES DE INVERSIÓN (docs/FCI.md del backend). Solo GET: la
// vista no escribe nada. Un fondo que no existe viaja como 404 tal cual: la
// ficha tiene que poder decir «no está en el universo» y no «backend caído».

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/fci");
export const GET = h;
