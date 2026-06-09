"use client";

import { useState } from "react";
import {
  DerivadosAgroView,
  type AgroResp,
} from "./derivados-agro-view";
import { AgroMejorasDispo } from "./agro-mejoras-dispo";
import { AgroDatos } from "./agro-datos";
import { useIsGuest } from "@/lib/use-is-guest";

type Tab = "mercado" | "mejoras" | "datos";

export function AgroShell({ agroInitial }: { agroInitial: AgroResp | null }) {
  const [tab, setTab] = useState<Tab>("mercado");
  // El invitado (portal www) NO ve la sub-sección Datos (cámara de cereales).
  const isGuest = useIsGuest();
  // Si por algún estado quedó en "datos" y es invitado, lo forzamos a mercado.
  const activeTab: Tab = isGuest && tab === "datos" ? "mercado" : tab;

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[var(--t-border)] bg-[var(--t-panel)] px-3 flex items-center gap-1 shrink-0">
        <TabBtn active={activeTab === "mercado"} onClick={() => setTab("mercado")}>
          Mercado
        </TabBtn>
        <TabBtn active={activeTab === "mejoras"} onClick={() => setTab("mejoras")}>
          Mejoras Precio Dispo
        </TabBtn>
        {!isGuest && (
          <TabBtn active={activeTab === "datos"} onClick={() => setTab("datos")}>
            Datos
          </TabBtn>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === "mercado" ? (
          agroInitial ? (
            // Vista actual sin tocar — futuros + cadena opciones + pizarra.
            // canEdit en true porque la pizarra ahora abre a los 3 roles.
            <DerivadosAgroView initial={agroInitial} canEdit />
          ) : (
            <div className="p-6 text-center text-[var(--t-text-muted)] text-xs">
              Sin data del mercado — backend no responde
            </div>
          )
        ) : activeTab === "mejoras" ? (
          <AgroMejorasDispo />
        ) : (
          <AgroDatos />
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
          ? "text-[var(--t-accent)] border-[var(--t-accent)]"
          : "text-[var(--t-text-dim)] border-transparent hover:text-[var(--t-text)]"
      }`}
    >
      {children}
    </button>
  );
}
