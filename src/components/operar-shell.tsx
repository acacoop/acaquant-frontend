"use client";

import { useEffect, useState } from "react";
import { DolarMepShell } from "./dolar-mep-shell";
import { OperarDashboardView } from "./operar-dashboard-view";
import { OperarFciView } from "./operar-fci-view";

type Tab = "dashboard" | "fci" | "dolar-mep";

export function OperarShell() {
  const [tab, setTab] = useState<Tab>("dashboard");

  // Deep-link desde Valuaciones: ?tab=fci abre la tab correcta en mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "fci" || t === "dolar-mep" || t === "dashboard") {
      setTab(t as Tab);
    }
  }, []);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] bg-[var(--t-panel)] shrink-0">
        <TabBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
          DASHBOARD
        </TabBtn>
        <TabBtn active={tab === "fci"} onClick={() => setTab("fci")}>
          FCI
        </TabBtn>
        <TabBtn active={tab === "dolar-mep"} onClick={() => setTab("dolar-mep")}>
          DOLAR MEP
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "dashboard" ? (
          <OperarDashboardView />
        ) : tab === "fci" ? (
          <OperarFciView />
        ) : (
          <DolarMepShell />
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
