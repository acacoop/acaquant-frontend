"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  DerivadosAgroPizarra,
  type AgroResp,
} from "./derivados-agro-pizarra";
import { DerivadosAgroEstrategias } from "./derivados-agro-estrategias";
import { AgroFuturos } from "./derivados-agro-futuros";
import { AgroOpcionesChain } from "./derivados-agro-opciones";

type Commodity = "TRIGO" | "MAIZ" | "SOJA";

export type { AgroResp };

export function DerivadosAgroView({
  initial,
  canEdit,
}: {
  initial: AgroResp;
  canEdit: boolean;
}) {
  // Selector único de commodity: las tabs de FUTUROS lo manejan y la cadena
  // de OPCIONES de abajo lo sigue.
  const [commodity, setCommodity] = useState<Commodity>("TRIGO");
  // La pizarra (sin tocar) inyecta acá su info global (dólar oficial + LIVE).
  const [headerExtras, setHeaderExtras] = useState<ReactNode>(null);
  const [simOpen, setSimOpen] = useState(false);

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Barra slim — info global de la pizarra (dólar oficial + frescura). */}
      <div className="border-b border-[#1a1a1a] bg-[#080808] px-3 flex items-center gap-2 shrink-0 min-h-[33px]">
        <span className="text-[10px] text-[#808080] uppercase tracking-wide">
          Pase Agro
        </span>
        <div className="flex items-center gap-2 ml-auto">{headerExtras}</div>
      </div>

      <div className="flex-1 min-h-0 flex">
        {/* IZQUIERDA 50% — futuros (arriba) + cadena de opciones (abajo). */}
        <div className="w-1/2 min-w-0 flex flex-col border-r border-[#1a1a1a]">
          <div className="h-1/2 min-h-0 border-b border-[#1a1a1a]">
            <AgroFuturos
              initial={initial}
              commodity={commodity}
              setCommodity={setCommodity}
            />
          </div>
          <div className="h-1/2 min-h-0">
            <AgroOpcionesChain
              commodity={commodity}
              onOpenSimulador={() => setSimOpen(true)}
            />
          </div>
        </div>

        {/* DERECHA 50% — pizarra. */}
        <div className="w-1/2 min-w-0">
          <DerivadosAgroPizarra
            initial={initial}
            canEdit={canEdit}
            setHeaderExtras={setHeaderExtras}
          />
        </div>
      </div>

      {simOpen && (
        <SimuladorModal
          commodity={commodity}
          onClose={() => setSimOpen(false)}
        />
      )}
    </div>
  );
}

/** Simulador de estrategias en overlay full-screen — reusa el componente
 *  Estrategias completo (cadena + simulador + gráficos), con su propio
 *  polling. La cadena de la izquierda queda para consulta rápida. */
function SimuladorModal({
  commodity,
  onClose,
}: {
  commodity: Commodity;
  onClose: () => void;
}) {
  const [extras, setExtras] = useState<ReactNode>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#080808] border border-[#2a2a2a]"
      style={{ margin: "12px" }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
        <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
          Simulador de Estrategias — {commodity}
        </span>
        <div className="flex items-center gap-2 ml-auto">{extras}</div>
        <button
          onClick={onClose}
          className="text-[#808080] hover:text-[#ff9900] transition-colors text-[13px] px-1 ml-2"
          title="Cerrar (Esc)"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 min-h-0">
        <DerivadosAgroEstrategias
          commodity={commodity}
          setHeaderExtras={setExtras}
        />
      </div>
    </div>,
    document.body,
  );
}
