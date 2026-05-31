"use client";

import { useState } from "react";
import { CashFlowView } from "./cashflow-view";
import { IntradayView } from "./intraday-view";
import { NegocioView } from "./negocio-view";

// /operaciones: movimientos (ex NEGOCIO) · depósitos & extracciones (ex CASH FLOW)
// · intraday. COMERCIAL → /operadores y CONTRAPARTES + FLUJO vs AUM → /contrapartes
// se separaron en rutas propias (dropdown NEGOCIO de la nav).
type Tab = "movimientos" | "depositos" | "intraday";

export function OperacionesView() {
  const [tab, setTab] = useState<Tab>("movimientos");

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] bg-[var(--t-panel)] shrink-0">
        <TabBtn active={tab === "movimientos"} onClick={() => setTab("movimientos")}>
          MOVIMIENTOS
        </TabBtn>
        <TabBtn active={tab === "depositos"} onClick={() => setTab("depositos")}>
          DEPÓSITOS & EXTRACCIONES
        </TabBtn>
        <TabBtn active={tab === "intraday"} onClick={() => setTab("intraday")}>
          INTRADAY
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "movimientos" ? (
          <NegocioView />
        ) : tab === "depositos" ? (
          <CashFlowView />
        ) : (
          <IntradayView />
        )}
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
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
