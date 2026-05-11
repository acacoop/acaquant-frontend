"use client";

import { useState } from "react";
import {
  DerivadosAgroPizarra,
  type AgroResp,
} from "./derivados-agro-pizarra";
import { DerivadosAgroEstrategias } from "./derivados-agro-estrategias";

type Commodity = "TRIGO" | "MAIZ" | "SOJA";
type SubTab = "pizarra" | "estrategias";

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

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[#1a1a1a] bg-[#080808] px-3 flex items-center gap-1 shrink-0">
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

      <div className="flex-1 min-h-0">
        {subTab === "pizarra" ? (
          <DerivadosAgroPizarra
            initial={initial}
            canEdit={canEdit}
            commodity={commodity}
            setCommodity={setCommodity}
          />
        ) : (
          <DerivadosAgroEstrategias
            commodity={commodity}
            setCommodity={setCommodity}
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
