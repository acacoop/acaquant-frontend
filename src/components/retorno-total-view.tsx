"use client";

import { usePersistedState } from "@/lib/use-persisted-state";
import { SensibilidadTable } from "./sensibilidad-table";
import { DescomposicionTab } from "./descomposicion-tab";
import { CompararInversionView } from "./comparar-inversion-view";
import { CoberturasView } from "./coberturas-view";

// Vista ESTRATEGIA (MERCADOS → Estrategia). Tabs:
//   COBERTURAS   — riesgo de un trade puntual + buscador de coberturas
//                  por correlación (/api/scanner/trade-analysis).
//   Herramientas RF: COMPARAR INVERSIÓN · ANÁLISIS SENSIBILIDAD · DESCOMPOSICIÓN.
// "RETORNO TOTAL" y "CANJE" se migraron a la HOME. BOOK & RIESGO se eliminó
// (2026-06-10). TRADE LAB se sacó de acá (2026-06-11) → vista propia /trade-lab,
// admin-only (estaba expuesto a roles no-admin).
type EstrategiaTab =
  | "coberturas"
  | "comparar"
  | "sensibilidad"
  | "descomposicion";

const TABS: { key: EstrategiaTab; label: string }[] = [
  { key: "coberturas",     label: "COBERTURAS" },
  { key: "comparar",       label: "COMPARAR INVERSIÓN" },
  { key: "sensibilidad",   label: "ANÁLISIS SENSIBILIDAD" },
  { key: "descomposicion", label: "DESCOMPOSICIÓN" },
];

export function RetornoTotalView() {
  const [tabRaw, setTab] = usePersistedState<EstrategiaTab>("estrategia.tab", "coberturas");
  // Valores persistidos de tabs eliminadas (tradelab/book/correlaciones) → default.
  const tab: EstrategiaTab = TABS.some((t) => t.key === tabRaw) ? tabRaw : "coberturas";

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest mr-3">
          ESTRATEGIA
        </span>
        {TABS.map((t, i) => (
          <span key={t.key} className="flex items-center gap-1">
            {i === 1 && <span className="h-4 w-px bg-[var(--t-border-2)] mx-1.5" />}
            <TabPill label={t.label} active={tab === t.key} onClick={() => setTab(t.key)} />
          </span>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "coberturas" && <CoberturasView />}
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
