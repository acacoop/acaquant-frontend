import { proxyCatchAll } from "@/lib/proxy-backend";

// Documentos manuales de REPORTES FINANCIEROS (módulo `research`). Pasa BINARIO
// (el PDF embebido): el helper reenvía bytes crudos y el content-disposition.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/research-docs");
export const GET = h;
