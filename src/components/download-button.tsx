"use client";

import { useState } from "react";

/**
 * Botón minimalista para descargar contenido (típicamente XLSX).
 * Icono download de ~12px, color #888 con hover naranja — match del
 * resto de los iconos de header de los Panels.
 *
 * Uso:
 *   <DownloadButton
 *     onClick={async () => await exportToXlsx(...)}
 *     title="Descargar Excel"
 *   />
 *
 * Maneja loading state mientras la promesa de export no termina (la
 * lib SheetJS es lazy-load, el primer click puede tardar ~200ms).
 */
export function DownloadButton({
  onClick,
  title = "Descargar Excel",
  className = "",
}: {
  onClick: () => Promise<void> | void;
  title?: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    try {
      await onClick();
    } catch (e) {
      console.error("DownloadButton: export failed", e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title={title}
      className={`text-[var(--t-text-dim)] hover:text-[#ff9900] transition-colors disabled:opacity-50 disabled:cursor-wait p-0.5 ${className}`}
      aria-label={title}
    >
      {/* Icon download — SVG inline, sin dep externa. */}
      <svg
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 1.5v6.5" />
        <path d="M3.5 5.5L6 8l2.5-2.5" />
        <path d="M2 10.5h8" />
      </svg>
    </button>
  );
}
