"use client";

import { useState } from "react";
import { SensibilidadTable } from "./sensibilidad-table";
import { CanjeTab } from "./canje-tab";
import { DescomposicionTab } from "./descomposicion-tab";
import { CompararInversionView } from "./comparar-inversion-view";

// La tab "RETORNO TOTAL" se migró a la HOME (retorno-total-mini.tsx) — acá quedan
// el resto de las herramientas de estrategia.
type EstrategiaTab = "sensibilidad" | "canje" | "descomposicion" | "comparar";

export function RetornoTotalView() {
  const [tab, setTab] = useState<EstrategiaTab>("comparar");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest mr-3">
          ESTRATEGIA
        </span>
        <TabPill
          label="ANÁLISIS SENSIBILIDAD"
          active={tab === "sensibilidad"}
          onClick={() => setTab("sensibilidad")}
        />
        <TabPill
          label="CANJE"
          active={tab === "canje"}
          onClick={() => setTab("canje")}
        />
        <TabPill
          label="DESCOMPOSICIÓN"
          active={tab === "descomposicion"}
          onClick={() => setTab("descomposicion")}
        />
        <TabPill
          label="COMPARAR INVERSIÓN"
          active={tab === "comparar"}
          onClick={() => setTab("comparar")}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "sensibilidad" && <SensibilidadTable />}
        {tab === "canje" && <CanjeTab />}
        {tab === "descomposicion" && <DescomposicionTab />}
        {tab === "comparar" && <CompararInversionView />}
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
