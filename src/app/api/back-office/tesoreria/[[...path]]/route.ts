import { proxyCatchAll } from "@/lib/proxy-backend";

// Tesorería (Back Office): live contra Aunesa + carga manual del saldo inicial
// + alta/edición/baja de cheques. El DELETE no lleva body: su clave viaja en la
// query, que el helper reenvía.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/back-office/tesoreria");
export const GET = h;
export const PUT = h;
export const POST = h;
export const DELETE = h;
