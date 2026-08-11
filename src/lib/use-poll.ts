"use client";

import { useEffect, useRef, useState } from "react";

import { contar, midiendo, registrarMs } from "./perf";

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
 *   error          → motivo del último poll FALLIDO (null si viene bien).
 *
 * `error` existe porque tragarse el fallo en silencio hacía que un panel roto
 * (404 del proxy, 403 de RBAC, 502 del backend) se viera idéntico a uno
 * legítimamente vacío — así se perdió una semana la tab ESTRATEGIA.
 */
export function usePoll<T>(
  endpoint: string,
  initial: T,
  intervalMs: number,
  options: { fetchOnMount?: boolean } = {},
): { data: T; lastAt: number; error: string | null } {
  const { fetchOnMount = false } = options;
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  // 0 = "todavía no hubo fetch"; se setea al timestamp real en el primer
  // poll exitoso. Evita llamar Date.now() dentro del render
  // (react-hooks/purity).
  const [lastAt, setLastAt] = useState<number>(0);
  const endpointRef = useRef(endpoint);
  // Texto crudo del último payload aplicado. Si el poll trae EXACTAMENTE lo
  // mismo (muy común fuera de rueda o entre trades), NO hacemos setData: la
  // identidad de `data` se preserva y los useMemo/tablas de los consumidores
  // no recomputan ni re-diffean nada. Solo se actualiza `lastAt`.
  const lastRawRef = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function tick() {
      try {
        const r = await fetch(endpoint, { cache: "no-store" });
        if (!r.ok) {
          if (alive) setError(`HTTP ${r.status}`);
          return;
        }
        const raw = await r.text();
        if (!alive) return;
        if (raw !== lastRawRef.current) {
          lastRawRef.current = raw;
          // Instrumentación (apagada por default, ver lib/perf.ts). El TIEMPO
          // DE RED y el TAMAÑO ya los mide el interceptor global de `fetch`;
          // acá solo va lo que ese interceptor no puede ver: el costo de
          // JSON.parse (CPU del browser) y cuántos polls traen exactamente lo
          // mismo. Es la distinción que decide qué se ataca: si el parse es
          // despreciable, mover cálculo al backend no mejora nada.
          const t1 = midiendo() ? performance.now() : 0;
          const parsed = JSON.parse(raw) as T;
          if (midiendo()) registrarMs(`parse ${endpoint}`, performance.now() - t1);
          setData(parsed);
        } else {
          // Payload idéntico al anterior: no hay parse ni re-render.
          contar(`sin cambios ${endpoint}`);
        }
        setLastAt(Date.now());
        setError(null);
      } catch (e) {
        // mantener data vieja si falló un poll puntual
        if (alive) setError(e instanceof Error ? e.message : "error de red");
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
    lastRawRef.current = null;
    setData(initial);
    setLastAt(0);
    setError(null);
  }, [endpoint, initial]);

  return { data, lastAt, error };
}
