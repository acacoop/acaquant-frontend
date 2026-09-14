"use client";

/**
 * Los pedacitos de UI que comparten las dos tabs de CUSTODIA.
 *
 * Viven en su propio archivo y no en `custodia-view.tsx` por una razón concreta:
 * si la tab de tenencias exportara los helpers Y importara la de movimientos, el
 * import quedaría CIRCULAR. Con los bundlers eso no siempre revienta — a veces
 * deja un `undefined` en tiempo de render, que es peor que un error de build.
 */

export type SubTab = "tenencias" | "movimientos";

/** La barra de las dos tabs. Vive acá para que las dos la dibujen igual: si cada
 *  una tuviera la suya, saltarían un píxel al cambiar y nadie sabría por qué. */
export function SubTabs({ sub, setSub }: { sub: SubTab; setSub: (s: SubTab) => void }) {
  return (
    <>
      {(["tenencias", "movimientos"] as const).map((t) => (
        <button key={t} onClick={() => setSub(t)}
          className={`py-1.5 font-semibold border-b-2 -mb-px ${
            sub === t
              ? "border-[var(--t-accent)] text-[var(--t-text)]"
              : "border-transparent text-[var(--t-text-dim)] hover:text-[var(--t-text)]"}`}>
          {t.toUpperCase()}
        </button>
      ))}
    </>
  );
}

export function Chip({ activo, onClick, children, alerta }: {
  activo: boolean; onClick: () => void; children: React.ReactNode; alerta?: boolean;
}) {
  const estilo = activo
    ? "bg-[var(--t-accent)] text-[var(--t-bg)] border-[var(--t-accent)]"
    : alerta
      ? "border-[var(--t-danger,#f87171)] text-[var(--t-danger,#f87171)]"
      : "border-[var(--t-border)] text-[var(--t-text-dim)]";
  return (
    <button onClick={onClick} className={`px-2 py-0.5 rounded text-[10px] border ${estilo}`}>
      {children}
    </button>
  );
}

export function Th({ children, className = "" }: {
  children: React.ReactNode; className?: string;
}) {
  return <th className={`px-2 py-1.5 font-semibold ${className}`}>{children}</th>;
}

export function Td({ children, className = "", title }: {
  children: React.ReactNode; className?: string; title?: string;
}) {
  return <td className={`px-2 py-1 ${className}`} title={title}>{children}</td>;
}
