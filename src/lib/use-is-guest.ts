"use client";

import { useEffect, useState } from "react";

// Hook client-side: true si el usuario es invitado (portal www, rol `invitado`).
// Lo usan las vistas de mercado para esconder/deshabilitar partes puntuales
// (ej. AGRO→Datos oculto, tasa R read-only en derivados). El gate de seguridad
// real vive en el backend (default-deny) — esto es solo UX.
//
// Cachea el resultado a nivel módulo: /api/me se consulta una sola vez por carga
// de página aunque varios componentes usen el hook.
let _cache: boolean | null = null;

export function useIsGuest(): boolean {
  const [guest, setGuest] = useState<boolean>(_cache ?? false);

  useEffect(() => {
    if (_cache !== null) {
      setGuest(_cache);
      return;
    }
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { role?: string } | null) => {
        _cache = m?.role === "invitado";
        if (!cancelled) setGuest(_cache);
      })
      .catch(() => {
        /* dejá guest=false ante error → no rompe la vista */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return guest;
}
