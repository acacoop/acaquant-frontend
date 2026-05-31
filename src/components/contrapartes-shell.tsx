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
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
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
          ? "bg-[var(--t-accent)] text-black border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
