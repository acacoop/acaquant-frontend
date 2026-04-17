"use client";

import { useState } from "react";
import { ForwardMatrix } from "./forward-matrix";
import { fmtTs } from "./ui";

interface ForwardDoc {
  curva: string;
  tickers?: string[];
  matrix?: Record<string, Record<string, number>>;
  updated_at?: string;
}

type Curva = "tasa_fija" | "cer";

export function ForwardsPanel({ forwards }: { forwards: ForwardDoc[] }) {
  const [curva, setCurva] = useState<Curva>("tasa_fija");

  const fw = forwards.find((f) => f.curva === curva);
  const hasData = !!fw?.matrix && !!fw?.tickers && fw.tickers.length >= 2;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <FilterBtn
          active={curva === "tasa_fija"}
          onClick={() => setCurva("tasa_fija")}
        >
          TASA FIJA
        </FilterBtn>
        <FilterBtn active={curva === "cer"} onClick={() => setCurva("cer")}>
          CER
        </FilterBtn>
        {fw?.updated_at && (
          <span className="ml-auto text-[10px] text-[#555555]">
            {fmtTs(fw.updated_at)}
          </span>
        )}
      </div>

      {hasData ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <ForwardMatrix tickers={fw!.tickers!} matrix={fw!.matrix!} />
        </div>
      ) : (
        <p className="text-[#555555] text-xs py-4 text-center">
          SIN DATOS — MERCADO CERRADO
        </p>
      )}
    </div>
  );
}

function FilterBtn({
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
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
