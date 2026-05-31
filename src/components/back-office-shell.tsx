"use client";

import { useState } from "react";
import { TitulosMercadoView } from "./titulos-mercado-view";

// Tabs del Back Office. Por ahora solo Títulos / Mercado; cuando vengan
// nuevas (conciliación, archivo a enviar, etc.) se suman acá.
type Tab = "titulos_mercado";

export function BackOfficeShell() {
  const [tab, setTab] = useState<Tab>("titulos_mercado");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[var(--t-border)] bg-[var(--t-panel)] px-3 flex items-center gap-1 shrink-0">
        <TabBtn
          active={tab === "titulos_mercado"}
          onClick={() => setTab("titulos_mercado")}
        >
          Títulos / Mercado
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0">
        {tab === "titulos_mercado" && <TitulosMercadoView />}
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
          ? "text-[#ff9900] border-[#ff9900]"
          : "text-[var(--t-text-dim)] border-transparent hover:text-[var(--t-text)]"
      }`}
    >
      {children}
    </button>
  );
}
