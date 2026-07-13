"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cartel de NOVEDAD — anuncio del Copiloto IA (QuantAI P3).
 *
 * Modal centrado tipo "noticia" que se muestra UNA SOLA VEZ a cada usuario con
 * acceso a la IA (módulo `ia`), apenas carga la app (sin esperar horario: es un
 * anuncio de feature, no data de mercado). A diferencia del briefing (que es
 * diario y reaparece cada mañana), una vez que el usuario lo cierra queda
 * marcado como visto y no vuelve. Si en el futuro hay una novedad nueva, se sube
 * la versión de la clave (NOTICIA_KEY) y el cartel reaparece para todos.
 *
 * Aparece aunque el usuario ya tuviera la sesión abierta: se re-chequea cada
 * minuto y al volver a la pestaña (mismo patrón que el briefing). Montado global
 * en el layout → aparece en cualquier página, no solo en HOME.
 *
 * El gate es el módulo `ia` (lo resuelve el layout con /api/me y lo pasa por
 * prop) — invitado y roles sin IA nunca lo ven. Cero llamadas al backend.
 */

// Subir la versión ("v1" → "v2") re-dispara el cartel para todos (novedad nueva).
const NOTICIA_KEY = "noticia.copiloto.v1";
const POLL_MS = 60_000;
const DESTINO = "/renta-variable"; // "Probar ahora" lleva acá

export function CopilotoNoticia({ hasIa }: { hasIa: boolean }) {
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false); // se muestra máx. 1 vez por carga

  useEffect(() => {
    if (!hasIa) return;
    const check = () => {
      if (shownRef.current) return;
      if (localStorage.getItem(NOTICIA_KEY)) return; // ya lo vio
      shownRef.current = true;
      setOpen(true);
    };
    check();
    const id = setInterval(check, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [hasIa]);

  // Cualquier cierre marca la novedad como vista → no vuelve.
  const cerrar = useCallback(() => {
    try {
      localStorage.setItem(NOTICIA_KEY, "1");
    } catch {
      /* localStorage no disponible: se mostrará de nuevo, no es crítico */
    }
    setOpen(false);
  }, []);

  const probar = useCallback(() => {
    cerrar();
    window.location.assign(DESTINO);
  }, [cerrar]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, cerrar]);

  if (!hasIa || !open) return null;

  return (
    <div
      onClick={cerrar}
      className="fixed inset-0 z-[60] bg-[var(--t-panel)]/70 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[var(--t-panel)] border border-[var(--t-accent)] shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header — badge NOVEDAD */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--t-border)] bg-[var(--t-surface-2)]">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--t-accent)] opacity-60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--t-accent)]" />
          </span>
          <span className="text-[11px] font-bold tracking-widest text-[var(--t-accent)]">
            ✦ NOVEDAD · COPILOTO IA
          </span>
          <button
            onClick={cerrar}
            className="ml-auto text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[14px] leading-none"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Cuerpo */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-[var(--t-text)]">
            Ya podés <span className="font-bold text-[var(--t-accent)]">consultarle a la IA</span>{" "}
            en <span className="font-semibold">Renta Fija</span> y{" "}
            <span className="font-semibold">Renta Variable</span>.
          </p>
          <p className="text-[12px] leading-relaxed text-[var(--t-text-muted)]">
            Preguntale por curvas, bonos, CEDEARs, señal contra la curva y más.
            Responde en lenguaje de mesa y solo con datos verificados de cada vista.
          </p>

          <div className="flex items-center gap-2 pt-1">
            <span className="px-2 py-0.5 text-[9px] font-bold tracking-widest text-[var(--t-accent)] border border-[var(--t-accent)]">
              RENTA FIJA
            </span>
            <span className="px-2 py-0.5 text-[9px] font-bold tracking-widest text-[var(--t-accent)] border border-[var(--t-accent)]">
              RENTA VARIABLE
            </span>
            <span className="ml-auto text-[10px] text-[var(--t-text-dim)]">
              botón <span className="font-semibold">Consultale a la IA</span> en el header
            </span>
          </div>
        </div>

        {/* Footer — acciones */}
        <div className="flex items-center gap-2 px-5 py-3 border-t border-[var(--t-border)]">
          <button
            onClick={probar}
            className="px-3 py-1.5 text-[11px] font-bold tracking-wide bg-[var(--t-accent)] text-[var(--t-panel)] hover:opacity-90 transition-opacity"
          >
            Probar ahora →
          </button>
          <button
            onClick={cerrar}
            className="ml-auto px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
