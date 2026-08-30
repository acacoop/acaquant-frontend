"use client";

import { useEffect, useState } from "react";

/**
 * TableHelp — `?` que abre un MODAL con el glosario completo de una
 * tabla. Click para abrir, click afuera o Escape para cerrar.
 *
 * Se renderiza con backdrop semi-transparente que dimea el resto de la
 * pantalla y un panel sólido centrado, scrolleable si el contenido es
 * largo. No tapa todo — ancho máx ~520px, altura máx 80vh.
 *
 * Uso:
 *   <TableHelp entries={[
 *     { label: "INTRA", text: "% intradía..." },
 *     { label: "1D",    text: "Variación vs cierre anterior..." },
 *   ]} />
 */
export function TableHelp({
  entries,
}: {
  entries: { label: string; text: string }[];
}) {
  const [open, setOpen] = useState(false);

  // Cerrar con Escape — pattern habitual de modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)] cursor-help select-none text-[11px] border border-[var(--t-border-2)] rounded-full w-4 h-4 inline-flex items-center justify-center font-semibold transition-colors"
        title="Ver referencia"
        type="button"
      >
        ?
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--t-panel)]/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] max-w-[720px] w-full max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header sticky con título + cerrar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--t-border)] sticky top-0 bg-[var(--t-surface)]">
              <span className="text-[11px] tracking-wide uppercase text-[var(--t-accent)] font-semibold">
                Referencia
              </span>
              <button
                onClick={() => setOpen(false)}
                className="text-[var(--t-text-dim)] hover:text-[#ffffff] text-[14px] leading-none px-1 transition-colors"
                aria-label="Cerrar"
                type="button"
              >
                ✕
              </button>
            </div>
            {/* Tabla del glosario */}
            <table className="w-full table-fixed text-[11px] text-[var(--t-text)] leading-relaxed">
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.label}
                    className="align-top border-b border-[var(--t-border)] last:border-b-0"
                  >
                    <td className="text-[var(--t-accent)] font-semibold pr-3 py-2 pl-4 w-[150px] align-top break-words">
                      {e.label}
                    </td>
                    <td className="py-2 pr-4 break-words">{e.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
