"use client";

import { useState } from "react";
import { TitulosMercadoView } from "./titulos-mercado-view";
import { AcreenciasView } from "./acreencias-view";
import { TenenciaValorizadaView } from "./tenencia-valorizada-view";

// Tabs del Back Office. Por ahora Títulos / Mercado + Acreencias Clientes +
// Tenencia Valorizada; cuando vengan nuevas se suman acá.
type Tab = "titulos_mercado" | "acreencias" | "tenencia";

export function BackOfficeShell() {
  // Default = Tenencia Valorizada (primera en la barra).
  const [tab, setTab] = useState<Tab>("tenencia");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[var(--t-border)] bg-[var(--t-panel)] px-3 flex items-center gap-1 shrink-0">
        <TabBtn
          active={tab === "tenencia"}
          onClick={() => setTab("tenencia")}
        >
          Tenencia Valorizada
        </TabBtn>
        <TabBtn
          active={tab === "titulos_mercado"}
          onClick={() => setTab("titulos_mercado")}
        >
          Títulos / Mercado
        </TabBtn>
        <TabBtn
          active={tab === "acreencias"}
          onClick={() => setTab("acreencias")}
        >
          Acreencias Clientes
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "titulos_mercado" && <TitulosMercadoView />}
        {tab === "acreencias" && <AcreenciasView />}
        {tab === "tenencia" && <TenenciaValorizadaView />}
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
      className={`text-[11px] tracking-wide uppercase px-3 py-2 border-b-2 ${
        active
          ? "text-[var(--t-accent)] border-[var(--t-accent)]"
          : "text-[var(--t-text-dim)] border-transparent hover:text-[var(--t-text)]"
      }`}
    >
      {children}
    </button>
  );
}
