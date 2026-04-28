"use client";

import { useState } from "react";
import { DolarMepShell } from "./dolar-mep-shell";
import { OperarPruebaView } from "./operar-prueba-view";

type Tab = "dolar-mep" | "prueba";

export function OperarShell() {
  const [tab, setTab] = useState<Tab>("dolar-mep");

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
        <TabBtn active={tab === "dolar-mep"} onClick={() => setTab("dolar-mep")}>
          DOLAR MEP
        </TabBtn>
        <TabBtn active={tab === "prueba"} onClick={() => setTab("prueba")}>
          PRUEBA
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "dolar-mep" ? <DolarMepShell /> : <OperarPruebaView />}
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
