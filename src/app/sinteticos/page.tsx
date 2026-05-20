import { DerivadosSinteticosView } from "@/components/derivados-sinteticos-view";

export const dynamic = "force-dynamic";

export default function SinteticosPage() {
  // Vista top-level. La data se polleea client-side, no hace falta SSR fetch.
  return <DerivadosSinteticosView />;
}
