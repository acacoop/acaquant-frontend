import { BackOfficeShell } from "@/components/back-office-shell";

export const dynamic = "force-dynamic";

export default function BackOfficePage() {
  // Top-level. Por ahora una sola tab (Títulos/Mercado); el shell deja
  // espacio para más sub-vistas que van a venir.
  return <BackOfficeShell />;
}
