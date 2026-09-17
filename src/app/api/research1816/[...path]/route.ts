import { proxyCatchAll } from "@/lib/proxy-backend";

// Vista RESEARCH (módulo `research`): /universo /series /spread /mails
// /mails/buscar.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/research1816");
export const GET = h;
export const POST = h;
