// Tooltip explicativo `?` reutilizable. CSS-only con group:hover, sin
// estado React. Acepta JSX en `tip` para que las explicaciones largas
// puedan estructurarse con párrafos, secciones y bullets en lugar de
// una pared de texto. Para tips cortos, sigue funcionando con string.
//
// Uso:
//   <InfoIcon tip="Texto corto." />
//   <InfoIcon tip={<><p>Párrafo 1.</p><p>Párrafo 2.</p></>} />

import type { ReactNode } from "react";

interface Props {
  tip: ReactNode;
  // Default 280px. Subilo a 380-420 para tooltips multi-sección.
  width?: string;
  // Anclaje horizontal: 'left' (default) extiende la caja a la derecha
  // del `?`; 'right' la extiende a la izquierda. Usar 'right' cuando
  // el `?` está cerca del borde derecho del contenedor.
  align?: "left" | "right";
}

export function InfoIcon({ tip, width = "300px", align = "left" }: Props) {
  const posClass = align === "right" ? "right-0" : "left-0";
  return (
    <span className="relative inline-block group cursor-help align-middle">
      <span className="text-[8px] text-[#555] hover:text-[#ff9900] border border-[#333] rounded-full px-[3px] leading-[1.2] font-mono">
        ?
      </span>
      <span
        className={`absolute ${posClass} top-full mt-1 z-50 hidden group-hover:block bg-black border border-[#2a2a2a] p-3 text-[10px] text-[#d0d0d0] leading-relaxed shadow-xl normal-case tracking-normal whitespace-normal pointer-events-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_h4]:text-[10px] [&_h4]:text-[#ff9900] [&_h4]:font-semibold [&_h4]:tracking-wider [&_h4]:mb-1 [&_h4]:mt-2 [&_h4:first-child]:mt-0 [&_ul]:my-2 [&_ul]:pl-3 [&_li]:mb-1 [&_strong]:text-[#ff9900] [&_strong]:font-semibold [&_code]:text-[#3fbf6f] [&_code]:font-mono [&_code]:bg-[#0a0a0a] [&_code]:px-1`}
        style={{ width }}
      >
        {tip}
      </span>
    </span>
  );
}
