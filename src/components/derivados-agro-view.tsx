"use client";

import { useState, type ReactNode } from "react";
import {
  DerivadosAgroPizarra,
  type AgroResp,
} from "./derivados-agro-pizarra";
import { DerivadosAgroEstrategias } from "./derivados-agro-estrategias";

type Commodity = "TRIGO" | "MAIZ" | "SOJA";
type SubTab = "pizarra" | "estrategias";
const COMMODITIES: Commodity[] = ["TRIGO", "MAIZ", "SOJA"];

export type { AgroResp };

export function DerivadosAgroView({
  initial,
  canEdit,
}: {
  initial: AgroResp;
  canEdit: boolean;
}) {
  const [subTab, setSubTab] = useState<SubTab>("pizarra");
  const [commodity, setCommodity] = useState<Commodity>("TRIGO");
  // Cada sub-tab inyecta sus extras (VTO, futuro, dólar oficial, últ. act)
  // en la misma fila que los tabs para no comer espacio vertical.
  const [headerExtras, setHeaderExtras] = useState<ReactNode>(null);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[#1a1a1a] bg-[#080808] px-3 flex flex-wrap items-center gap-2 shrink-0">
        <div className="flex items-center">
          <SubTabBtn
            active={subTab === "pizarra"}
            onClick={() => setSubTab("pizarra")}
          >
            Pizarra
          </SubTabBtn>
          <SubTabBtn
            active={subTab === "estrategias"}
            onClick={() => setSubTab("estrategias")}
          >
            Estrategias
          </SubTabBtn>
        </div>

        {/* La Pizarra muestra los 3 commodities juntos — el selector de
            commodity solo aplica a Estrategias. */}
        {subTab === "estrategias" && (
          <div className="flex items-center gap-0.5 ml-2">
            {COMMODITIES.map((c) => (
              <CommodityBtn
                key={c}
                active={c === commodity}
                onClick={() => setCommodity(c)}
              >
                {c}
              </CommodityBtn>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">{headerExtras}</div>
      </div>

      <div className="flex-1 min-h-0">
        {subTab === "pizarra" ? (
          <DerivadosAgroPizarra
            initial={initial}
            canEdit={canEdit}
            setHeaderExtras={setHeaderExtras}
          />
        ) : (
          <DerivadosAgroEstrategias
            commodity={commodity}
            setHeaderExtras={setHeaderExtras}
          />
        )}
      </div>
    </div>
  );
}

function SubTabBtn({
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
      className={`text-[10px] tracking-wide uppercase px-2.5 py-1.5 border-b-2 ${
        active
          ? "text-[#ff9900] border-[#ff9900]"
          : "text-[#808080] border-transparent hover:text-[#d0d0d0]"
      }`}
    >
      {children}
    </button>
  );
}

function CommodityBtn({
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
      className={`text-[10px] tracking-wide uppercase px-2 py-1 border ${
        active
          ? "bg-[#ff9900]/10 text-[#ff9900] border-[#ff9900]"
          : "text-[#808080] border-[#2a2a2a] hover:text-[#d0d0d0] hover:border-[#3a3a3a]"
      }`}
    >
      {children}
    </button>
  );
}
