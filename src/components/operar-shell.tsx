"use client";

import { useEffect, useState } from "react";
import { DolarMepShell } from "./dolar-mep-shell";
import { OperarTitulosFciView } from "./operar-titulos-fci-view";

// OPERAR arranca en DÓLAR MEP (lo primero que se ve al entrar — decisión user
// 2026-07-23). El resto (títulos + FCI) quedó consolidado en UNA vista.
type Tab = "dolar-mep" | "titulos-fci";

export function OperarShell() {
  const [tab, setTab] = useState<Tab>("dolar-mep");

  // Deep-link desde Valuaciones. Se aceptan los alias viejos (?tab=fci /
  // ?tab=dashboard) para no romper links guardados: ambos caen en la vista
  // consolidada, que además lee ?ticker= / ?fci= para abrir en el modo correcto.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "dolar-mep") setTab("dolar-mep");
    else if (t === "fci" || t === "dashboard" || t === "titulos-fci") setTab("titulos-fci");
  }, []);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <TabBtn active={tab === "dolar-mep"} onClick={() => setTab("dolar-mep")}>
          DÓLAR MEP
        </TabBtn>
        <TabBtn active={tab === "titulos-fci"} onClick={() => setTab("titulos-fci")}>
          TÍTULOS Y FCI
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "dolar-mep" ? <DolarMepShell /> : <OperarTitulosFciView />}
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
