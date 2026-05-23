"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Hook de polling que mantiene el initialData como fallback y además
 * expone `lastAt`: epoch ms del último fetch exitoso (browser time).
 *
 * Usado por las vistas que dependían del viejo AutoRefresh global para
 * mantener la data viva. El timestamp del browser evita depender del tz
 * del backend para el indicador de "última actualización".
 *
 *   lastAt === 0   → todavía no hubo ningún poll (solo SSR).
 *   lastAt > 0     → hora del último poll exitoso.
 */
export function usePoll<T>(
  endpoint: string,
  initial: T,
  intervalMs: number,
  options: { fetchOnMount?: boolean } = {},
): { data: T; lastAt: number } {
  const { fetchOnMount = false } = options;
  const [data, setData] = useState<T>(initial);
  // 0 = "todavía no hubo fetch"; se setea al timestamp real en el primer
  // poll exitoso. Evita llamar Date.now() dentro del render
  // (react-hooks/purity).
  const [lastAt, setLastAt] = useState<number>(0);
  const endpointRef = useRef(endpoint);

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const r = await fetch(endpoint, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as T;
        if (alive) {
          setData(j);
          setLastAt(Date.now());
        }
      } catch {
        // mantener data vieja si falló un poll puntual
      }
    }

    // Por defecto NO disparamos tick inmediato (asumimos initial reciente
    // del SSR). fetchOnMount=true para vistas que no tienen SSR previo —
    // así no quedan vacías hasta el primer interval.
    if (fetchOnMount) {
      void tick();
    }
    const id = setInterval(tick, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [endpoint, intervalMs, fetchOnMount]);

  // Resetear SOLO cuando cambia el ENDPOINT (navegación a otra data). Antes
  // se comparaba `initial` por referencia, pero casi todos los callers recrean
  // ese objeto en cada render del padre → el reset se disparaba de más y
  // pisaba la data fresca del poll con el `initial` (SSR viejo). Comparar por
  // endpoint evita el "salto" a un valor viejo en todo el frontend.
  useEffect(() => {
    if (endpoint === endpointRef.current) return;
    endpointRef.current = endpoint;
    setData(initial);
    setLastAt(0);
  }, [endpoint, initial]);

  return { data, lastAt };
}
