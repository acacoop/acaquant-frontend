"use client";

import { useState } from "react";
import { DerivadosView } from "./derivados-view";
import { DerivadosAgroView } from "./derivados-agro-view";
import { DerivadosSinteticosView } from "./derivados-sinteticos-view";
import type { OpcionDoc } from "@/lib/estrategias";

interface OpcionesMeta {
  tasa: number;
  vr_local: number;
  vr_adr: number;
  updated_at?: string;
}

interface AgroResp {
  oficial: { value: number | null; ts: string | null; source: string };
  ts: string;
  bloques: {
    commodity: "TRIGO" | "MAIZ" | "SOJA";
    rows: {
      tipo: "pizarra" | "dispo" | "futuro";
      ticker?: string;
      vencimiento: string | null;
      posicion: string;
      us: number | null;
      pase: number | null;
      ars: number | null;
      tnav_us: number | null;
    }[];
  }[];
}

type Tab = "opciones" | "agro" | "sinteticos";

export function DerivadosShell({
  opcionesDocs,
  opcionesMeta,
  isAdmin,
  agroInitial,
  canEditAgro,
  showAgroTab,
}: {
  opcionesDocs: OpcionDoc[];
  opcionesMeta: OpcionesMeta;
  isAdmin: boolean;
  agroInitial: AgroResp | null;
  canEditAgro: boolean;
  showAgroTab: boolean;
}) {
  const [tab, setTab] = useState<Tab>("opciones");

  // Si por alguna razón el state queda en "agro" pero el user no tiene
  // permiso, forzamos el fallback a "opciones".
  const activeTab: Tab = tab === "agro" && !showAgroTab ? "opciones" : tab;

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[#1a1a1a] bg-[#080808] px-3 flex items-center gap-1 shrink-0">
        <TabBtn active={activeTab === "opciones"} onClick={() => setTab("opciones")}>
          Opciones
        </TabBtn>
        {showAgroTab ? (
          <TabBtn active={activeTab === "agro"} onClick={() => setTab("agro")}>
            Agro
          </TabBtn>
        ) : null}
        <TabBtn active={activeTab === "sinteticos"} onClick={() => setTab("sinteticos")}>
          Sintéticos
        </TabBtn>
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === "sinteticos" ? (
          <DerivadosSinteticosView />
        ) : activeTab === "agro" && agroInitial ? (
          <DerivadosAgroView initial={agroInitial} canEdit={canEditAgro} />
        ) : (
          <DerivadosView
            docs={opcionesDocs}
            metaInicial={opcionesMeta}
            isAdmin={isAdmin}
          />
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
      className={`text-[11px] tracking-wide uppercase px-3 py-2 border-b-2 ${
        active
          ? "text-[#ff9900] border-[#ff9900]"
          : "text-[#808080] border-transparent hover:text-[#d0d0d0]"
      }`}
    >
      {children}
    </button>
  );
}
