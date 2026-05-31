"use client";

import { useState } from "react";
import { ContrapartesView } from "./contrapartes-view";
import { FlujoVsAumView } from "./flujo-vs-aum-view";

// /contrapartes: junta CONTRAPARTES + FLUJO vs AUM (eran tabs sueltas de
// /operaciones) en dos tabs de una misma vista.
type Tab = "contrapartes" | "flujo-vs-aum";

export function ContrapartesShell() {
  const [tab, setTab] = useState<Tab>("contrapartes");

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
        <TabBtn active={tab === "contrapartes"} onClick={() => setTab("contrapartes")}>
          CONTRAPARTES
        </TabBtn>
        <TabBtn active={tab === "flujo-vs-aum"} onClick={() => setTab("flujo-vs-aum")}>
          FLUJO vs AUM
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "contrapartes" ? <ContrapartesView /> : <FlujoVsAumView />}
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
