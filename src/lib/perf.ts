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

/**
 * Normaliza la URL para que el reporte sea legible.
 *
 * Sin esto, un endpoint parametrizado se abre en una fila por combinación:
 * medir /trading dio TRECE filas de `/api/trading/pivots?tickers=RKLB%2C…`,
 * cada una con n=1 o n=2, y ninguna decía lo que importaba — que ese endpoint
 * se llamó 30 veces. Se conservan los NOMBRES de los parámetros (cambian el
 * costo) y se descartan los VALORES (solo explotan la cardinalidad).
 */
/**
 * Saca la URL del primer argumento de `fetch`, que puede ser tres cosas
 * distintas: un string, un objeto `URL` o un `Request`.
 *
 * Leer `.url` a ciegas funciona SOLO con `Request`: en un objeto `URL` esa
 * propiedad no existe (se llama `.href`) y devuelve `undefined`, que después
 * se resolvía como la ruta literal "/undefined". Al medir /operadores
 * aparecieron 12 requests a "/undefined" — no era la app llamando mal, era
 * esta función leyendo mal. Un instrumento que inventa un endpoint inexistente
 * es peor que no medir.
 */
function urlDe(entrada: unknown): string {
  if (typeof entrada === "string") return entrada;
  if (entrada instanceof URL) return entrada.href;
  if (typeof Request !== "undefined" && entrada instanceof Request) return entrada.url;
  return String(entrada);
}

function normalizarUrl(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    const params = [...u.searchParams.keys()];
    return u.pathname + (params.length ? `?${params.join("&")}=…` : "");
  } catch {
    return url.split("?")[0];
  }
}

/**
 * Envuelve `window.fetch` para medir TODA request que salga del browser, sin
 * tener que instrumentar vista por vista.
 *
 * Por qué global y no caso por caso: la app pide datos por al menos cuatro
 * caminos distintos (usePoll, fetchJson/getJSON, fetchShared y `fetch` pelado
 * en ~100 componentes). Instrumentarlos de a uno es interminable y siempre
 * queda alguno afuera; el único punto por el que pasan todos es `fetch`.
 *
 * Solo se instala con la medición PRENDIDA, así en producción nadie tiene el
 * fetch parcheado. El wrapper no toca argumentos ni respuesta: delega en el
 * original y devuelve su promesa tal cual, con los errores intactos.
 *
 * El tamaño sale del header `content-length` cuando viene. NO se clona la
 * respuesta a propósito: clonar para pesar el body consume memoria y puede
 * interferir con quien la lee después. Si el server no manda el header, se
 * mide el tiempo igual y el tamaño no aparece — nunca al revés.
 */
function instalarFetchGlobal(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__acaperfFetch) return;
  const original = window.fetch.bind(window);
  w.__acaperfFetch = original;
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const t0 = performance.now();
    try {
      const r = await original(...args);
      const etiqueta = normalizarUrl(urlDe(args[0]));
      acumular(`red ${etiqueta}`, performance.now() - t0, "ms");
      const len = r.headers.get("content-length");
      if (len) acumular(`payload ${etiqueta}`, Number(len) / 1024, "KB");
      // Una request que responde 4xx/5xx igual costó el viaje completo. Sin
      // esto se mezclaba con las buenas y un endpoint roto (que se reintenta)
      // parecía tráfico normal.
      if (!r.ok) acumular(`⚠ HTTP ${r.status} ${etiqueta}`, 1, "n");
      return r;
    } catch (e) {
      // Un fetch fallido también cuesta tiempo (y suele ser el más lento).
      acumular("red — requests FALLIDAS", performance.now() - t0, "ms");
      throw e;
    }
  };
}

function volcar(): void {
  if (stats.size === 0) {
    if (!habilitado()) {
      console.log(
        "[perf] medición APAGADA. Para prenderla:\n" +
          "  localStorage.setItem('acaquant:perf','1')\n" +
          "y RECARGAR la página (F5). El flag se lee una sola vez, al cargar.",
      );
      return;
    }
    console.log(
      "[perf] medición prendida, pero todavía SIN MUESTRAS.\n" +
        "  1) ¿Recargaste con F5 después de prender el flag? Es lo más común.\n" +
        "  2) Si la vista trae TODO desde el server (SSR) no pide nada desde el\n" +
        "     browser y no hay qué medir acá — ese caso se mide en el backend\n" +
        "     con scripts/diag_front_back_baseline.py.",
    );
    return;
  }
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

/**
 * Copia las mediciones como TEXTO al portapapeles. Existe porque la salida de
 * `console.table` no se puede seleccionar ni pegar: para compartir los números
 * había que sacarle una foto a la pantalla.
 */
async function copiar(): Promise<void> {
  if (stats.size === 0) {
    console.log("[perf] no hay muestras para copiar");
    return;
  }
  const lineas = [
    `# perf ${window.location.pathname} — ${stats.size} mediciones`,
    ["medicion", "n", "unidad", "promedio", "maximo", "total"].join("\t"),
  ];
  for (const [etiqueta, s] of [...stats.entries()].sort(
    (a, b) => b[1].total - a[1].total,
  )) {
    lineas.push([
      etiqueta, s.n, s.unidad,
      (s.total / s.n).toFixed(2), s.max.toFixed(2), s.total.toFixed(1),
    ].join("\t"));
  }
  const texto = lineas.join("\n");
  try {
    await navigator.clipboard.writeText(texto);
    console.log(`[perf] copiado al portapapeles (${stats.size} filas). Pegalo donde quieras.`);
  } catch {
    // El navegador puede bloquear el portapapeles sin gesto del usuario.
    console.log("[perf] no pude usar el portapapeles — copiá esto a mano:\n" + texto);
  }
}

/**
 * Instala `__acaperf()` en la consola. Se llama al cargar el módulo en el
 * browser, PRENDIDO O APAGADO — a propósito: si solo existiera con el flag
 * activo, escribir `__acaperf()` con la medición apagada tiraría un
 * "ReferenceError" seco y no habría forma de saber si el flag quedó bien
 * puesto. Instalado siempre, la función SIEMPRE contesta algo útil.
 *
 * Apagado no cuesta nada: define una función y sale. No hay timer, no hay
 * lecturas de localStorage por poll, no se mide nada.
 */
function instalar(): void {
  const w = window as unknown as Record<string, unknown>;
  if (w.__acaperf) return;
  w.__acaperf = (accion?: string) => {
    if (accion === "reset") {
      stats.clear();
      console.log("[perf] muestras borradas — medí esta vista desde cero");
      return;
    }
    if (accion === "copiar") {
      void copiar();
      return;
    }
    volcar();
  };
  if (!habilitado()) return; // instalado pero mudo: sin timer ni banner
  instalarFetchGlobal();
  setInterval(volcar, 30_000);
  console.log(
    "[perf] medición ACTIVA en " + window.location.pathname + "\n" +
      "  __acaperf()          → tabla\n" +
      "  __acaperf('copiar')  → la copia como texto al portapapeles\n" +
      "  __acaperf('reset')   → borra y arranca de cero (usalo al entrar a cada vista)",
  );
}

// Auto-instalación al cargar en el browser. La importa `arrancarPerf()` desde
// el layout, así `__acaperf()` existe en TODAS las vistas y siempre responde.
if (typeof window !== "undefined") instalar();

/** No hace nada por sí sola: existe para que el layout pueda importar este
 *  módulo y disparar la auto-instalación de arriba en cualquier vista. */
export function arrancarPerf(): void {
  if (typeof window !== "undefined") instalar();
}
