import { proxyCatchAll } from "@/lib/proxy-backend";

// Tab BCRA de la vista Research (módulo `research`).

export const dynamic = "force-dynamic";
export const revalidate = 0;

const h = proxyCatchAll("/api/research-bcra");
export const GET = h;
