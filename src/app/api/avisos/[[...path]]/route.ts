import { proxyCatchAll } from "@/lib/proxy-backend";

// Proxy de /api/avisos/* — LO QUE EL AGENTE LE DEJÓ A CADA PERSONA.
//
// ⚠️ Esta ruta no existía y por eso `MisAvisos` nunca funcionó (el fetch daba
// 404 de Next y el componente se lo tragaba). Es catch-all a propósito: cubre
// `/api/avisos`, `/hecho` e `/item`; con una ruta por path el próximo endpoint
// volvería a dar 404 en silencio. SIN GATE DE MÓDULO, igual que el backend: el
// filtro es el email propio y lo aplica el backend — acá solo viaja la identidad.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/avisos");
export const GET = h;
export const POST = h;
