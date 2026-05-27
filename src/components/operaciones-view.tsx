"use client";

import { useEffect, useState } from "react";
import { CashFlowView } from "./cashflow-view";
import { ComercialOperacionesView, type Operador } from "./comercial-operaciones-view";
import { ContrapartesView } from "./contrapartes-view";
import { FlujoVsAumView } from "./flujo-vs-aum-view";
import { IntradayView } from "./intraday-view";
import { NegocioView } from "./negocio-view";

type Tab = "negocio" | "comercial" | "cashflow" | "contrapartes" | "flujo-vs-aum" | "intraday";

export function OperacionesView() {
  const [tab, setTab] = useState<Tab>("negocio");
  // Selector de operador de la vista COMERCIAL — vive acá (en la barra de tabs)
  // para no ocupar espacio dentro del panel. Se pasa como prop a la vista.
  const [operadores, setOperadores] = useState<Operador[]>([]);
  const [operador, setOperador] = useState<string>("");
  const [moneda, setMoneda] = useState<"ARS" | "USD">("ARS");

  useEffect(() => {
    if (tab !== "comercial" || operadores.length > 0) return;
    void (async () => {
      try {
        const r = await fetch("/api/operaciones/comercial/operadores", { cache: "no-store" });
        if (!r.ok) return;
        const d: Operador[] = await r.json();
        setOperadores(d);
        setOperador((s) => s || (d[0]?.operador_email ?? ""));
      } catch {
        // silencioso — la vista muestra su propio estado de error/vacío.
      }
    })();
  }, [tab, operadores.length]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
        <TabBtn active={tab === "negocio"} onClick={() => setTab("negocio")}>
          NEGOCIO
        </TabBtn>
        <TabBtn active={tab === "comercial"} onClick={() => setTab("comercial")}>
          COMERCIAL
        </TabBtn>
        <TabBtn active={tab === "cashflow"} onClick={() => setTab("cashflow")}>
          CASH FLOW
        </TabBtn>
        <TabBtn
          active={tab === "contrapartes"}
          onClick={() => setTab("contrapartes")}
        >
          CONTRAPARTES
        </TabBtn>
        <TabBtn
          active={tab === "flujo-vs-aum"}
          onClick={() => setTab("flujo-vs-aum")}
        >
          FLUJO vs AUM
        </TabBtn>
        <TabBtn active={tab === "intraday"} onClick={() => setTab("intraday")}>
          INTRADAY
        </TabBtn>

        {/* Selector de operador (solo en COMERCIAL), al margen superior derecho. */}
        {tab === "comercial" && operadores.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[9px] text-[#666] tracking-widest">OPERADOR</span>
            <select
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none max-w-[280px]"
            >
              <option value="__todos__">— Todos los operadores —</option>
              {operadores.map((o) => (
                <option key={o.operador_email} value={o.operador_email}>
                  {(o.operador_nombre || o.operador_email)} ({o.n_cuentas})
                </option>
              ))}
            </select>
            <div className="inline-flex items-stretch border border-[#2a2a2a] divide-x divide-[#2a2a2a]">
              {(["ARS", "USD"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMoneda(m)}
                  className={
                    "px-2 py-1 text-[10px] font-semibold " +
                    (moneda === m ? "bg-[#ff9900] text-black" : "bg-[#0e0e0e] text-[#888] hover:text-[#ff9900]")
                  }
                >{m}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "negocio" ? (
          <NegocioView />
        ) : tab === "comercial" ? (
          <ComercialOperacionesView operador={operador} moneda={moneda} />
        ) : tab === "cashflow" ? (
          <CashFlowView />
        ) : tab === "contrapartes" ? (
          <ContrapartesView />
        ) : tab === "flujo-vs-aum" ? (
          <FlujoVsAumView />
        ) : (
          <IntradayView />
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
      className={`px-3 py-1 text-[11px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
