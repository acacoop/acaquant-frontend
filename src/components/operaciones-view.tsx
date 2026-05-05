"use client";

import { useState } from "react";
import { CashFlowView } from "./cashflow-view";
import { ContrapartesView } from "./contrapartes-view";
import { FlujoVsAumView } from "./flujo-vs-aum-view";
import { IntradayView } from "./intraday-view";
import { NegocioView } from "./negocio-view";

type Tab = "negocio" | "cashflow" | "contrapartes" | "flujo-vs-aum" | "intraday";

export function OperacionesView() {
  const [tab, setTab] = useState<Tab>("negocio");

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
        <TabBtn active={tab === "negocio"} onClick={() => setTab("negocio")}>
          NEGOCIO
        </TabBtn>
        <TabBtn active={tab === "cashflow"} onClick={() => setTab("cashflow")}>
          CASH FLOW
        </TabBtn>
        <TabBtn
          active={tab === "contrapartes"}
          onClick={() => setTab("contrapartes")}
        >
          CONTRAPARTES
        </TabBtn>
        <TabBtn
          active={tab === "flujo-vs-aum"}
          onClick={() => setTab("flujo-vs-aum")}
        >
          FLUJO vs AUM
        </TabBtn>
        <TabBtn active={tab === "intraday"} onClick={() => setTab("intraday")}>
          INTRADAY
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "negocio" ? (
          <NegocioView />
        ) : tab === "cashflow" ? (
          <CashFlowView />
        ) : tab === "contrapartes" ? (
          <ContrapartesView />
        ) : tab === "flujo-vs-aum" ? (
          <FlujoVsAumView />
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
