"use client";

import { useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { AgroView } from "./agro-view";
import { ArancelesView } from "./aranceles-view";
import { CashFlowView } from "./cashflow-view";
import { Ap5PosicionesView } from "./ap5-posiciones-view";
import { DolarFuturoView } from "./dolar-futuro-view";
import { FinanciamientoView } from "./financiamiento-view";
import { OpsView } from "./ops-view";

// /operaciones: OPERACIONES · ARANCELES · AGRO · DÓLAR FUTURO · POSICIONES Y DIFERENCIAS ·
// depósitos & extracciones · FINANCIAMIENTO.
// MOVIMIENTOS (ex NEGOCIO) se movió a Manager. INTRADAY se movió a Trading.
//
// Keep-alive: cada tab se monta la PRIMERA vez que se abre y luego se oculta con
// CSS (no se desmonta). Así no re-fetchea fechas/segmentos/data al volver — cambiar
// de tab es instantáneo después del primer load. El gráfico (recharts) re-mide solo
// al volver a mostrarse (ResizeObserver del ResponsiveContainer).
type Tab =
  | "operaciones" | "aranceles" | "agro" | "dolarfuturo" | "posiciones" | "depositos"
  | "financiamiento";

export function OperacionesView() {
  // tab persiste entre rutas (volvés a /operaciones → misma sub-pestaña).
  const [tab, setTab] = usePersistedState<Tab>("operaciones.tab", "operaciones");
  // Tabs que ya no existen y pueden estar guardadas en sessionStorage de una
  // sesión anterior. Sin esto, el que tenía abierta la vieja entra y no se monta
  // NINGUNA tab: pantalla en blanco, sin error.
  //   "intraday"    → se movió a Trading
  //   "diferencias" → DIFERENCIAS DIARIAS, reemplazada por POSICIONES Y DIFERENCIAS
  if ((tab as string) === "intraday") setTab("operaciones");
  if ((tab as string) === "diferencias") setTab("posiciones");
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>([tab]));

  // Asegura que la pestaña activa (incluso la restaurada por el hook al
  // rehidratar) esté montada. setState condicional DURANTE el render: patrón
  // recomendado por React para ajustar estado ante un cambio (no un effect →
  // converge sin re-render extra ni el warning set-state-in-effect).
  if (!visited.has(tab)) setVisited(new Set(visited).add(tab));

  const open = (t: Tab) => setTab(t);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <TabBtn active={tab === "operaciones"} onClick={() => open("operaciones")}>OPERACIONES</TabBtn>
        <TabBtn active={tab === "aranceles"} onClick={() => open("aranceles")}>ARANCELES</TabBtn>
        <TabBtn active={tab === "agro"} onClick={() => open("agro")}>AGRO</TabBtn>
        <TabBtn active={tab === "dolarfuturo"} onClick={() => open("dolarfuturo")}>DÓLAR FUTURO</TabBtn>
        <TabBtn active={tab === "posiciones"} onClick={() => open("posiciones")}>POSICIONES Y DIFERENCIAS</TabBtn>
        <TabBtn active={tab === "depositos"} onClick={() => open("depositos")}>DEPÓSITOS & EXTRACCIONES</TabBtn>
        <TabBtn active={tab === "financiamiento"} onClick={() => open("financiamiento")}>FINANCIAMIENTO</TabBtn>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        {visited.has("operaciones") && <Pane active={tab === "operaciones"}><OpsView /></Pane>}
        {visited.has("aranceles") && <Pane active={tab === "aranceles"}><ArancelesView /></Pane>}
        {visited.has("agro") && <Pane active={tab === "agro"}><AgroView /></Pane>}
        {visited.has("dolarfuturo") && <Pane active={tab === "dolarfuturo"}><DolarFuturoView /></Pane>}
        {visited.has("posiciones") && <Pane active={tab === "posiciones"}><Ap5PosicionesView /></Pane>}
        {visited.has("depositos") && <Pane active={tab === "depositos"}><CashFlowView /></Pane>}
        {visited.has("financiamiento") && <Pane active={tab === "financiamiento"}><FinanciamientoView /></Pane>}
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
