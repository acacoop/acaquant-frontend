"use client";

import { useEffect } from "react";

import { arrancarPerf } from "@/lib/perf";

/**
 * Monta el medidor de performance (`lib/perf.ts`) en TODAS las vistas.
 *
 * Sin esto, `__acaperf()` solo existía en las pantallas que importaban algo
 * instrumentado: parado en cualquier otra vista, escribirlo en la consola
 * tiraba "ReferenceError" y parecía que la medición estaba rota. Ahora la
 * función existe siempre y contesta qué está pasando.
 *
 * No renderiza nada y, con la medición apagada (el default), no hace más que
 * definir una función global. Va en el layout raíz.
 */
export function PerfBoot() {
  useEffect(() => {
    arrancarPerf();
  }, []);
  return null;
}
