"use client";

import { useState } from "react";

/**
 * HelpTooltip — `?` chiquito con tooltip propio (no usa `title` nativo).
 *
 * El `title` HTML tiene delay browser-dependent (1-2s) y a veces no se
 * dispara sobre elementos custom. Este componente maneja su propio
 * estado de hover y posiciona el tooltip con CSS absoluto — aparece
 * instantáneo y se ve igual en todos los browsers.
 *
 * Uso:
 *   <HelpTooltip text="Beta = covarianza(activo, bench) / varianza(bench)" />
 *
 * Por defecto el tooltip aparece encima del icono. Si se está cerca del
 * borde superior de la pantalla, se puede pasar `position="bottom"` para
 * que aparezca abajo.
 */
export function HelpTooltip({
  text,
  position = "top",
}: {
  text: string;
  position?: "top" | "bottom";
}) {
  const [show, setShow] = useState(false);
  const verticalClass =
    position === "top" ? "bottom-full mb-1" : "top-full mt-1";

  return (
    <span
      className="relative inline-block ml-0.5"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <sup className="text-[#555555] cursor-help select-none text-[9px]">?</sup>
      {show && (
        <span
          className={`absolute z-50 ${verticalClass} left-1/2 -translate-x-1/2 px-2 py-1 bg-[#1a1a1a] border border-[#2a2a2a] text-[10px] text-[#d0d0d0] whitespace-normal max-w-[280px] w-max pointer-events-none normal-case tracking-normal text-left font-normal leading-tight`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
