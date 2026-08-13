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
// Peticiones EN VUELO, compartidas por URL entre TODOS los componentes.
//
// Por qué: varias vistas montan dos componentes que pollean el MISMO endpoint
// (agro es el caso testigo: `derivados-agro-futuros` y `derivados-agro-pizarra`
// piden `/api/derivados-agro` cada 5s). Como montan juntos, sus timers quedan
// alineados y disparan casi en el mismo instante → dos requests idénticos al
// endpoint más caro de la plataforma, y el backend calcula todo dos veces.
//
// Esto NO es un cache: no guarda respuestas ni sirve nada viejo. Si cuando
// llega un pedido ya hay otro EN CURSO para la misma URL, se cuelga de ese y
// los dos reciben exactamente la misma respuesta fresca. Si no hay ninguno en
// curso, sale un request normal. Cada componente conserva su propio intervalo,
// su propio estado y su propio manejo de error.
const _enVuelo = new Map<string, Promise<string>>();

async function _traerCrudo(endpoint: string): Promise<string> {
  const yaEnCurso = _enVuelo.get(endpoint);
  if (yaEnCurso) return yaEnCurso;
  const pedido = (async () => {
    const r = await fetch(endpoint, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  })();
  _enVuelo.set(endpoint, pedido);
  try {
    return await pedido;
  } finally {
    // Se limpia SIEMPRE (también si falló): el próximo tick tiene que poder
    // reintentar de verdad, no quedar pegado a una promesa rechazada.
    _enVuelo.delete(endpoint);
  }
}

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
        // Comparte el request si otro componente ya está pidiendo esta misma
        // URL en este instante. Un !r.ok viaja como excepción `HTTP <status>`
        // y lo atrapa el catch de abajo — mismo mensaje de error que antes.
        const raw = await _traerCrudo(endpoint);
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
