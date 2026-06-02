"use client";

import { useState } from "react";
import { CashFlowView } from "./cashflow-view";
import { IntradayView } from "./intraday-view";
import { OpsView } from "./ops-view";

// /operaciones: OPERACIONES (sobre CashFlow.Operaciones) · depósitos &
// extracciones · intraday. MOVIMIENTOS (ex NEGOCIO, consolidados) se movió a
// Manager (es la vieja, queda solo para la mesa interna).
type Tab = "operaciones" | "depositos" | "intraday";

export function OperacionesView() {
  const [tab, setTab] = useState<Tab>("operaciones");

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <TabBtn active={tab === "operaciones"} onClick={() => setTab("operaciones")}>
          OPERACIONES
        </TabBtn>
        <TabBtn active={tab === "depositos"} onClick={() => setTab("depositos")}>
          DEPÓSITOS & EXTRACCIONES
        </TabBtn>
        <TabBtn active={tab === "intraday"} onClick={() => setTab("intraday")}>
          INTRADAY
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "operaciones" && <OpsView />}
        {tab === "depositos" && <CashFlowView />}
        {tab === "intraday" && <IntradayView />}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[11px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
