"use client";

import { useState } from "react";

/**
 * TableHelp — un solo `?` en una esquina de la tabla. Al hover muestra
 * UN popover con el glosario completo de todas las columnas/conceptos
 * de esa tabla. Reemplaza el patrón de `?` por cada header (que era
 * ruidoso visualmente).
 *
 * Uso:
 *   <TableHelp entries={[
 *     { label: "INTRA", text: "% intradía..." },
 *     { label: "1D",    text: "Variación vs cierre anterior..." },
 *   ]} />
 */
export function TableHelp({
  entries,
  align = "right",
}: {
  entries: { label: string; text: string }[];
  align?: "left" | "right";
}) {
  const [show, setShow] = useState(false);
  const horizontal = align === "right" ? "right-0" : "left-0";
  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className="text-[#888888] hover:text-[#ff9900] cursor-help select-none text-[11px] border border-[#2a2a2a] rounded-full w-4 h-4 inline-flex items-center justify-center font-semibold">
        ?
      </span>
      {show && (
        <div
          className={`absolute z-50 top-full ${horizontal} mt-1 p-3 bg-[#1a1a1a] border border-[#2a2a2a] text-[10px] text-[#d0d0d0] w-[340px] pointer-events-none normal-case tracking-normal text-left font-normal leading-snug shadow-lg`}
        >
          <table className="w-full">
            <tbody>
              {entries.map((e) => (
                <tr key={e.label} className="align-top">
                  <td className="text-[#ff9900] font-semibold pr-2 py-0.5 whitespace-nowrap">
                    {e.label}
                  </td>
                  <td className="py-0.5">{e.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </span>
  );
}

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
