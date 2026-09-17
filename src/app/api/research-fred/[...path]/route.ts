import { proxyCatchAll } from "@/lib/proxy-backend";

// Tab Datos Internacionales / FRED de la vista Research (módulo `research`).

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/research-fred");
export const GET = h;
