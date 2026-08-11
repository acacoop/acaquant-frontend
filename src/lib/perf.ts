"use client";

/**
 * perf.ts — cronómetro del BROWSER, apagado por default.
 *
 * Existe para responder con números una pregunta que hoy se contesta con
 * opinión: **¿conviene mover al backend la lógica de negocio que corre en el
 * cliente?** El backend ya mide su mitad (`scripts/diag_front_back_baseline.py`
 * en acaquant-backend: ms del servicio + bytes que viajan). Esta es la otra
 * mitad: cuánto tarda el browser en BAJAR, PARSEAR y CALCULAR.
 *
 * Sin las dos mitades no se puede decidir. Un cálculo de 0,3 ms en el cliente
 * no se porta al backend "por latencia" — se porta (o no) por tener UNA sola
 * fuente de la fórmula, que es otra discusión. Y al revés: un payload de
 * 200 KB polleado cada 2 segundos sí se ataca, y este archivo dice cuánto.
 *
 * ── Cómo se usa ──────────────────────────────────────────────────────────────
 *   1. En la consola del browser, en la vista a medir:
 *          localStorage.setItem('acaquant:perf', '1')
 *   2. Recargar la página (el flag se lee UNA vez, así apagado no cuesta nada).
 *   3. Usar la vista normalmente. Cada 30s se imprime un resumen; a demanda:
 *          __acaperf()          → tabla con n / promedio / máximo / último
 *          __acaperf('reset')   → borra las muestras y arranca de cero
 *   4. Para apagar:
 *          localStorage.removeItem('acaquant:perf')  y recargar.
 *
 * ── Garantías ────────────────────────────────────────────────────────────────
 * - **No cambia el comportamiento de nada.** `medir` devuelve exactamente lo
 *   que devuelve la función que envuelve, y usa try/finally para que una
 *   excepción se propague igual que sin instrumentar.
 * - **Apagado = costo cero**: una comparación booleana y la llamada directa.
 *   No se toca `performance.now()` ni se guarda nada.
 * - **SSR-safe**: sin `window` devuelve false y nunca instala nada.
 */

type Unidad = "ms" | "KB" | "n";

interface Stat {
  n: number;
  total: number;
  max: number;
  ultimo: number;
  unidad: Unidad;
}

const stats = new Map<string, Stat>();

// null = todavía no se resolvió. Se cachea a propósito: releer localStorage en
// cada poll de 2s sería, irónicamente, el propio overhead que venimos a medir.
let activo: boolean | null = null;

function habilitado(): boolean {
  if (activo !== null) return activo;
  if (typeof window === "undefined") return false; // SSR: no medir, no cachear
  try {
    activo = window.localStorage.getItem("acaquant:perf") === "1";
  } catch {
    activo = false; // Safari en modo privado tira al leer localStorage
  }
  if (activo) instalar();
  return activo;
}

function acumular(etiqueta: string, valor: number, unidad: Unidad): void {
  const s = stats.get(etiqueta);
  if (!s) {
    stats.set(etiqueta, { n: 1, total: valor, max: valor, ultimo: valor, unidad });
    return;
  }
  s.n += 1;
  s.total += valor;
  s.max = Math.max(s.max, valor);
  s.ultimo = valor;
}

/** Envuelve un cálculo y mide cuánto tarda. Devuelve lo mismo que `fn`. */
export function medir<T>(etiqueta: string, fn: () => T): T {
  if (!habilitado()) return fn();
  const t0 = performance.now();
  try {
    return fn();
  } finally {
    acumular(etiqueta, performance.now() - t0, "ms");
  }
}

/** Registra una duración ya medida (para tramos que no son una sola llamada,
 *  como el fetch de `usePoll`, donde el await está partido). */
export function registrarMs(etiqueta: string, ms: number): void {
  if (!habilitado()) return;
  acumular(etiqueta, ms, "ms");
}

/** Registra el tamaño de un payload recibido. En KB porque es la unidad en la
 *  que se piensa el problema (y la que usa el diag del backend). */
export function registrarBytes(etiqueta: string, bytes: number): void {
  if (!habilitado()) return;
  acumular(etiqueta, bytes / 1024, "KB");
}

/** Cuenta ocurrencias de algo (no mide tiempo). Sirve para ratios: cuántos
 *  polls trajeron data nueva vs cuántos trajeron exactamente lo mismo. */
export function contar(etiqueta: string): void {
  if (!habilitado()) return;
  acumular(etiqueta, 1, "n");
}

/** true si la medición está prendida — para saltearse trabajo que SOLO existe
 *  para medir (ej. recorrer un string grande para pesarlo). */
export function midiendo(): boolean {
  return habilitado();
}

function volcar(): void {
  if (stats.size === 0) return;
  const filas: Record<string, unknown>[] = [];
  for (const [etiqueta, s] of [...stats.entries()].sort(
    (a, b) => b[1].total - a[1].total,
  )) {
    filas.push({
      medición: etiqueta,
      n: s.n,
      unidad: s.unidad,
      promedio: +(s.total / s.n).toFixed(3),
      máximo: +s.max.toFixed(3),
      último: +s.ultimo.toFixed(3),
      // Acumulado: en un poll de 2s esto es lo que dice si algo "chiquito"
      // termina siendo caro por repetirse mil veces.
      total: +s.total.toFixed(1),
    });
  }
  console.table(filas);
}

function instalar(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__acaperf) return;
  w.__acaperf = (accion?: string) => {
    if (accion === "reset") {
      stats.clear();
      console.log("[perf] muestras borradas");
      return;
    }
    volcar();
  };
  setInterval(volcar, 30_000);
  console.log(
    "[perf] medición ACTIVA. __acaperf() para ver la tabla, " +
      "__acaperf('reset') para reiniciar. Resumen automático cada 30s.",
  );
}
