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
  const initialRef = useRef(initial);

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

  // Si initial cambia de verdad (navigate + SSR otra vez), resetear.
  useEffect(() => {
    if (initial !== initialRef.current) {
      initialRef.current = initial;
      setData(initial);
      setLastAt(Date.now());
    }
  }, [initial]);

  return { data, lastAt };
}
