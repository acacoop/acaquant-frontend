import { ValuacionesView } from "@/components/valuaciones-view";

export const dynamic = "force-dynamic";

// MVP: id_cuenta hardcoded a 805. En Phase 2 se agregará selector.
const ID_CUENTA_MVP = "805";

export default function ValuacionesPage() {
  return (
    <main className="h-full">
      <ValuacionesView idCuenta={ID_CUENTA_MVP} />
    </main>
  );
}
