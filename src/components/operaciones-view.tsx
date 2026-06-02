"use client";

import { useState } from "react";
import { AgroView } from "./agro-view";
import { ArancelesView } from "./aranceles-view";
import { CashFlowView } from "./cashflow-view";
import { IntradayView } from "./intraday-view";
import { OpsView } from "./ops-view";

// /operaciones: OPERACIONES · ARANCELES · AGRO · depósitos & extracciones ·
// intraday. MOVIMIENTOS (ex NEGOCIO) se movió a Manager.
//
// Keep-alive: cada tab se monta la PRIMERA vez que se abre y luego se oculta con
// CSS (no se desmonta). Así no re-fetchea fechas/segmentos/data al volver — cambiar
// de tab es instantáneo después del primer load. El gráfico (recharts) re-mide solo
// al volver a mostrarse (ResizeObserver del ResponsiveContainer).
type Tab = "operaciones" | "aranceles" | "agro" | "depositos" | "intraday";

export function OperacionesView() {
  const [tab, setTab] = useState<Tab>("operaciones");
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>(["operaciones"]));

  const open = (t: Tab) => {
    setTab(t);
    setVisited((v) => (v.has(t) ? v : new Set(v).add(t)));
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <TabBtn active={tab === "operaciones"} onClick={() => open("operaciones")}>OPERACIONES</TabBtn>
        <TabBtn active={tab === "aranceles"} onClick={() => open("aranceles")}>ARANCELES</TabBtn>
        <TabBtn active={tab === "agro"} onClick={() => open("agro")}>AGRO</TabBtn>
        <TabBtn active={tab === "depositos"} onClick={() => open("depositos")}>DEPÓSITOS & EXTRACCIONES</TabBtn>
        <TabBtn active={tab === "intraday"} onClick={() => open("intraday")}>INTRADAY</TabBtn>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        {visited.has("operaciones") && <Pane active={tab === "operaciones"}><OpsView /></Pane>}
        {visited.has("aranceles") && <Pane active={tab === "aranceles"}><ArancelesView /></Pane>}
        {visited.has("agro") && <Pane active={tab === "agro"}><AgroView /></Pane>}
        {visited.has("depositos") && <Pane active={tab === "depositos"}><CashFlowView /></Pane>}
        {visited.has("intraday") && <Pane active={tab === "intraday"}><IntradayView /></Pane>}
      </div>
    </div>
  );
}

function Pane({ active, children }: { active: boolean; children: React.ReactNode }) {
  // Oculto = display:none (mantiene estado + DOM, sin ocupar layout).
  return <div className={active ? "h-full w-full" : "hidden"}>{children}</div>;
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
