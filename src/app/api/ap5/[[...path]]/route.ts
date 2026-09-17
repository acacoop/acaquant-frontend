import { proxyCatchAll } from "@/lib/proxy-backend";

// Proxy a /api/ap5/* (POSICIONES Y DIFERENCIAS — la posición de futuros que
// informa la CÁMARA, A3/ACyRSA). Router propio y no un sufijo de `operaciones`
// porque la FUENTE es otra: aquel lee nuestro registro de boletos y este lo que
// la cámara liquidó. Sin cache: la vista cambia cada día cuando corre el job de
// las 9:00 ART. Las escrituras llevan autor (`grupo_por`, `cargado_por`) gracias
// a la identidad que propaga el helper.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/ap5", { cacheControl: "no-store, no-cache, must-revalidate" });
export const GET = h;
export const POST = h;
