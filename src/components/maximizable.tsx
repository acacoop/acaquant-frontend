"use client";

// Wrapper que agrega un botón MAXIMIZAR en la esquina superior derecha de un panel.
// Al maximizar, el panel ocupa toda la pantalla (position: fixed) — el contenido NO
// se desmonta (se preserva el estado interno del panel). Esc o click en el botón
// vuelve al tamaño normal. El botón aparece al pasar el mouse (hover) para no
// tapar los controles del header; cuando está maximizado queda siempre visible.
import { type ReactNode, useEffect, useState } from "react";

export function Maximizable({ children }: { children: ReactNode }) {
  const [max, setMax] = useState(false);

  useEffect(() => {
    if (!max) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMax(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [max]);

  return (
    <div className={max ? "fixed inset-0 z-[90] bg-[var(--t-panel)] p-3" : "group relative h-full w-full min-h-0"}>
      <button
        type="button"
        onClick={() => setMax((v) => !v)}
        title={max ? "Minimizar (Esc)" : "Maximizar"}
        aria-label={max ? "Minimizar" : "Maximizar"}
        className={`absolute top-1 right-1 z-[95] w-5 h-5 flex items-center justify-center rounded text-[12px] leading-none bg-[var(--t-panel)]/80 text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-opacity ${max ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        {max ? "⊡" : "⛶"}
      </button>
      <div className="h-full w-full min-h-0">{children}</div>
    </div>
  );
}
