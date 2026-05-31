// Tooltip explicativo `?` reutilizable.
//
// Comportamiento:
//   - Hover: aparece como vista rápida (CSS group-hover, pointer-events-none).
//     Sirve para echar un vistazo sin comprometerse.
//   - Click en el `?`: ancla el tooltip abierto. Ahora es interactivo
//     (pointer-events-auto), tiene scroll interno (max-h-[60vh] overflow-y-auto)
//     y borde naranja para distinguirlo del modo hover.
//   - Cierre del modo anclado: click en el `×`, click fuera del tooltip,
//     o tecla Escape.
//
// Uso:
//   <InfoIcon tip="Texto corto." />
//   <InfoIcon tip={<><p>Párrafo 1.</p><p>Párrafo 2.</p></>} width="380px" />
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  tip: ReactNode;
  // Default 300px. Subilo a 380-420 para tooltips multi-sección.
  width?: string;
  // Anclaje horizontal: 'left' (default) extiende a la derecha del `?`;
  // 'right' extiende a la izquierda. Usar 'right' cuando el `?` está
  // cerca del borde derecho del contenedor.
  align?: "left" | "right";
}

export function InfoIcon({ tip, width = "300px", align = "left" }: Props) {
  const [pinned, setPinned] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const posClass = align === "right" ? "right-0" : "left-0";

  // Click fuera y Escape para cerrar — solo cuando está anclado.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setPinned(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <span
      ref={wrapperRef}
      className="relative inline-block group cursor-help align-middle"
    >
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setPinned((p) => !p);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setPinned((p) => !p);
          }
        }}
        className={`text-[8px] border rounded-full px-[3px] leading-[1.2] font-mono select-none ${
          pinned
            ? "text-[#ff9900] border-[#ff9900]"
            : "text-[var(--t-text-muted)] hover:text-[#ff9900] border-[#333]"
        }`}
      >
        ?
      </span>
      <span
        className={`absolute ${posClass} top-full mt-1 z-50 ${
          pinned
            ? "block pointer-events-auto"
            : "hidden group-hover:block pointer-events-none"
        } bg-black border ${
          pinned ? "border-[#ff9900]" : "border-[var(--t-border-2)]"
        } p-3 ${pinned ? "pr-6" : ""} text-[10px] text-[var(--t-text)] leading-relaxed shadow-xl normal-case tracking-normal whitespace-normal max-h-[60vh] overflow-y-auto [&_p]:mb-2 [&_p:last-child]:mb-0 [&_h4]:text-[10px] [&_h4]:text-[#ff9900] [&_h4]:font-semibold [&_h4]:tracking-wider [&_h4]:mb-1 [&_h4]:mt-2 [&_h4:first-child]:mt-0 [&_ul]:my-2 [&_ul]:pl-3 [&_li]:mb-1 [&_strong]:text-[#ff9900] [&_strong]:font-semibold [&_code]:text-[#3fbf6f] [&_code]:font-mono [&_code]:bg-[#0a0a0a] [&_code]:px-1`}
        style={{ width }}
      >
        {pinned && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPinned(false);
            }}
            className="absolute top-1 right-1 text-[var(--t-text-muted)] hover:text-[#ff9900] text-[12px] leading-none"
            aria-label="cerrar"
          >
            ×
          </button>
        )}
        {tip}
      </span>
    </span>
  );
}
