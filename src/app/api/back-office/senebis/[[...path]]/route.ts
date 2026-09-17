import { proxyCatchAll } from "@/lib/proxy-backend";

// SENEBIS (Back Office → SENEBIS): /ops (+/{id}, /{id}/estado, /{id}/mae-completada),
// /opciones, /comitentes, /agentes, /excel y /export (.xlsx BINARIO — el helper
// pasa bytes crudos, así el archivo llega intacto). El backend audita cada cambio
// con el actor real (operaciones.senebis_audit).

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/back-office/senebis");
export const GET = h;
export const POST = h;
export const PATCH = h;
export const PUT = h;
export const DELETE = h;
