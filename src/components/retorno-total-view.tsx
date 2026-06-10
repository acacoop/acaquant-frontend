"use client";

import { usePersistedState } from "@/lib/use-persisted-state";
import { SensibilidadTable } from "./sensibilidad-table";
import { DescomposicionTab } from "./descomposicion-tab";
import { CompararInversionView } from "./comparar-inversion-view";
import { TradeLabView } from "./trade-lab-view";
import { BookLabView } from "./book-lab-view";
import { CorrelacionesView } from "./correlaciones-view";

// Vista ESTRATEGIA (MERCADOS → Estrategia). Dos familias de tabs:
//   Mesa de Estrategia RV: TRADE LAB · BOOK & RIESGO · CORRELACIONES
//     (caracterización de riesgo, hedge-finder, exposición de book, matriz ρ
//      — backend api/services/rv_motor.py vía /api/scanner/*).
//   Herramientas RF: COMPARAR INVERSIÓN · ANÁLISIS SENSIBILIDAD · DESCOMPOSICIÓN.
// "RETORNO TOTAL" y "CANJE" se migraron a la HOME.
type EstrategiaTab =
  | "tradelab"
  | "book"
  | "correlaciones"
  | "comparar"
  | "sensibilidad"
  | "descomposicion";

export function RetornoTotalView() {
  const [tab, setTab] = usePersistedState<EstrategiaTab>("estrategia.tab", "tradelab");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest mr-3">
          ESTRATEGIA
        </span>
        <TabPill
          label="TRADE LAB"
          active={tab === "tradelab"}
          onClick={() => setTab("tradelab")}
        />
        <TabPill
          label="BOOK & RIESGO"
          active={tab === "book"}
          onClick={() => setTab("book")}
        />
        <TabPill
          label="CORRELACIONES"
          active={tab === "correlaciones"}
          onClick={() => setTab("correlaciones")}
        />
        <span className="h-4 w-px bg-[var(--t-border-2)] mx-1.5" />
        <TabPill
          label="COMPARAR INVERSIÓN"
          active={tab === "comparar"}
          onClick={() => setTab("comparar")}
        />
        <TabPill
          label="ANÁLISIS SENSIBILIDAD"
          active={tab === "sensibilidad"}
          onClick={() => setTab("sensibilidad")}
        />
        <TabPill
          label="DESCOMPOSICIÓN"
          active={tab === "descomposicion"}
          onClick={() => setTab("descomposicion")}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "tradelab" && <TradeLabView />}
        {tab === "book" && <BookLabView />}
        {tab === "correlaciones" && <CorrelacionesView />}
        {tab === "comparar" && <CompararInversionView />}
        {/* Sensibilidad sin el panel de cálculos/explicación (se migra a Manager → Debug). */}
        {tab === "sensibilidad" && <SensibilidadTable compact />}
        {tab === "descomposicion" && <DescomposicionTab />}
      </div>
    </div>
  );
}

function TabPill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[11px] font-semibold tracking-wide border ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {label}
    </button>
  );
}
