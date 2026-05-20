import { ValuacionesShell } from "@/components/valuaciones-shell";

export const dynamic = "force-dynamic";

export default function ValuacionesPage() {
  // Top-level — todo el state vive en el shell (cuenta, sub-tab, fetches).
  return <ValuacionesShell />;
}
