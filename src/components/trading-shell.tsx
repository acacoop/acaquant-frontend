"use client";

import { useState } from "react";

import { usePersistedState } from "@/lib/use-persisted-state";
import { IntradayView } from "./intraday-view";
import { MonitorView } from "./monitor-view";
import { TradingView } from "./trading-view";

// Módulo TRADING con sub-pestañas:
//   PIVOTS        → panel de pivots del CEDEAR + chart/tape/volumen (la señal
//                   ESTRATEGIA vive AHÍ, como tab del radar — no acá).
//   MONITOR       → volumen operado POR PRECIO (POC + área de valor), con el
//                   filtro madre renta fija / renta variable. 2026-09-04.
//   INTRADAY      → monitor intradía FIFO (migrado de Operaciones).
// (REUTERS se movió a /research → tab RENTA VARIABLE INTERNACIONAL, 2026-07-18.
//  PNL HISTÓRICO se borró entera —front y back— el 2026-09-04: era la única
//  escritura de toda la vista, que ahora es 100 % read-only.)
// Keep-alive: cada tab se monta la primera vez y luego se oculta con CSS (mismo
// patrón que operaciones-view) → cambiar de tab no re-fetchea ni pierde estado.
type Tab = "pivots" | "monitor" | "intraday";

const TABS: Tab[] = ["pivots", "monitor", "intraday"];

export function TradingShell() {
  const [tabRaw, setTab] = usePersistedState<string>("trading.tab", "pivots");
  // Usuarios con una tab persistida que ya no existe ("reuters", "pnl") caen a
  // pivots — por eso la lista se valida en vez de castear derecho.
  const tab: Tab = TABS.includes(tabRaw as Tab) ? (tabRaw as Tab) : "pivots";
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>([tab]));
  if (!visited.has(tab)) setVisited(new Set(visited).add(tab));

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <TabBtn active={tab === "pivots"} onClick={() => setTab("pivots")}>PIVOTS</TabBtn>
        <TabBtn active={tab === "monitor"} onClick={() => setTab("monitor")}>MONITOR</TabBtn>
        <TabBtn active={tab === "intraday"} onClick={() => setTab("intraday")}>INTRADAY</TabBtn>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {visited.has("pivots") && (
          <Pane active={tab === "pivots"}>
            <TradingView />
          </Pane>
        )}
        {visited.has("monitor") && (
          <Pane active={tab === "monitor"}>
            <MonitorView />
          </Pane>
        )}
        {visited.has("intraday") && (
          <Pane active={tab === "intraday"}>
            <IntradayView />
          </Pane>
        )}
      </div>
    </div>
  );
}

function Pane({ active, children }: { active: boolean; children: React.ReactNode }) {
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
