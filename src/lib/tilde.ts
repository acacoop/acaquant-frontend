"use client";

/**
 * tilde.ts — **EL TILDE: cuando la pantalla no se congela, sino que se CLAVA.**
 *
 * Hermano del PULSO (`components/pulso.tsx`), y la distinción es todo el punto:
 *
 *   PULSO → «la pantalla no se ACTUALIZA»: los pedidos fallan, el navegador
 *           anda bien. Lo sabe `usePoll` porque el fetch tira.
 *   TILDE → «la pantalla no RESPONDE»: el navegador está trabado. Nada falla,
 *           nadie tira una excepción, y el servidor no se entera jamás.
 *
 * Sin esto las dos cosas llegan como la misma frase —«se me tildó la app»— y se
 * arreglan en lugares opuestos: una es del backend o de la red; la otra es JS
 * de esta app comiéndose el hilo principal. Adivinar cuál es la que rompió la
 * pantalla cuesta más que medirlo.
 *
 * ── CÓMO SE MIDE (sin librerías y sin costo) ────────────────────────────────
 *
 * Un latido cada 500 ms. Si entre dos latidos pasó MUCHO más que eso, el hilo
 * principal estuvo bloqueado ese tiempo: nada más pudo correr, tampoco el
 * click del usuario. Eso ES el tilde, medido desde adentro.
 *
 * Y en paralelo un `PerformanceObserver('longtask')`, que es lo único que dice
 * QUÉ tan larga fue la tarea que bloqueó. Con las dos:
 *
 *   hueco grande + longtask parecida  → JS de la app (render, parse, tabla)
 *   hueco grande + NINGÚN longtask    → no fue JS: GC, memoria, o la máquina
 *
 * ── LAS TRES GUARDAS CONTRA EL FALSO POSITIVO ───────────────────────────────
 *
 * 1. **Pestaña de fondo NO cuenta.** El navegador estrangula los timers de una
 *    pestaña que no se ve (hasta 1 por minuto): ahí un hueco de 60 s es lo
 *    normal, no un tilde. Solo se mide lo que estuvo VISIBLE todo el hueco.
 * 2. **Un hueco enorme es la máquina, no la app.** Arriba del techo se
 *    descarta: eso es la notebook que durmió o el sistema suspendido.
 * 3. **Como mucho un aviso por minuto** (y un tope por carga de página): si la
 *    app se traba en loop, el reporte no puede ser parte del problema.
 *
 * Lo que se manda va al MISMO endpoint que el pulso (`POST /api/pulso`, con
 * `tipo: "tilde"`) y de ahí al AV AGENT. Nunca levanta hacia la pantalla: si
 * tampoco se puede avisar, la vista ya tiene bastante con estar trabada.
 */

const LATIDO_MS = 500;        // cada cuánto se toma el pulso del hilo principal
const UMBRAL_MS = 3_000;      // menos que esto es un hipo, no un tilde
const TECHO_MS = 120_000;     // más que esto es la máquina suspendida, no la app
const AVISO_CADA_MS = 60_000; // como mucho un aviso por minuto
const TOPE_AVISOS = 30;       // techo por carga de página

let _arrancado = false;
let _ultimoLatido = 0;
let _visibleDesde = 0;
let _ultimoAviso = 0;
let _avisos = 0;

// El peor `longtask` visto desde el último latido, y cuántos hubo. Se limpia en
// cada latido: lo que interesa es lo que pasó DENTRO del hueco, no un pico de
// hace media hora.
let _peorTarea = 0;
let _tareas = 0;

function _memoriaMb(): number | null {
  // `performance.memory` es de Chrome (y no está tipada). Sirve para separar
  // «se trabó una vez» de «la pestaña se está quedando sin memoria»: si el heap
  // creció sin parar, el culpable es una fuga, no un render caro.
  const p = performance as unknown as { memory?: { usedJSHeapSize?: number } };
  const b = p.memory?.usedJSHeapSize;
  return typeof b === "number" ? Math.round(b / 1024 / 1024) : null;
}

function _avisar(msTrabado: number, peorTarea: number, tareas: number): void {
  const ahora = Date.now();
  if (_avisos >= TOPE_AVISOS || ahora - _ultimoAviso < AVISO_CADA_MS) return;
  _ultimoAviso = ahora;
  _avisos += 1;

  const s = (msTrabado / 1000).toFixed(1);
  // El motivo lo lee una persona en el modal del agente: tiene que decir QUÉ
  // pasó y hacia dónde mirar, no un número suelto.
  const motivo = peorTarea >= UMBRAL_MS / 2
    ? `hilo principal bloqueado ${s} s (tarea de ${(peorTarea / 1000).toFixed(1)} s)`
    : `hilo principal bloqueado ${s} s (sin tarea larga: memoria o máquina)`;

  void fetch("/api/pulso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tipo: "tilde",
      vista: window.location.pathname,
      endpoint: "",
      motivo: motivo.slice(0, 120),
      ms: Math.round(msTrabado),
      datos: {
        peor_tarea_ms: Math.round(peorTarea),
        tareas_largas: tareas,
        memoria_mb: _memoriaMb(),
        pantalla: `${window.innerWidth}x${window.innerHeight}`,
        agente: navigator.userAgent.slice(0, 180),
      },
    }),
    cache: "no-store",
  }).catch(() => { /* si tampoco llega esto, no hay a quién avisarle */ });
}

function _observarTareasLargas(): void {
  try {
    const obs = new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        _tareas += 1;
        if (e.duration > _peorTarea) _peorTarea = e.duration;
      }
    });
    obs.observe({ type: "longtask", buffered: false });
  } catch {
    // Firefox/Safari no tienen `longtask`. El hueco se mide igual; lo único que
    // se pierde es poder decir si fue JS — y eso el motivo lo aclara.
  }
}

/**
 * Arranca la medición. Idempotente y solo en el navegador: llamarla dos veces
 * no duplica timers.
 */
export function arrancarTilde(): void {
  if (_arrancado || typeof window === "undefined") return;
  _arrancado = true;
  _ultimoLatido = Date.now();
  _visibleDesde = document.visibilityState === "visible" ? Date.now() : Number.MAX_SAFE_INTEGER;

  document.addEventListener("visibilitychange", () => {
    // Al volver del fondo se reinician los dos relojes: el hueco que dejó el
    // estrangulamiento del navegador no es un tilde y no se puede contar.
    _ultimoLatido = Date.now();
    _visibleDesde = document.visibilityState === "visible"
      ? Date.now()
      : Number.MAX_SAFE_INTEGER;
    _peorTarea = 0;
    _tareas = 0;
  });

  _observarTareasLargas();

  setInterval(() => {
    const ahora = Date.now();
    const hueco = ahora - _ultimoLatido;
    const inicio = _ultimoLatido;
    const peor = _peorTarea;
    const tareas = _tareas;
    _ultimoLatido = ahora;
    _peorTarea = 0;
    _tareas = 0;

    if (hueco < UMBRAL_MS + LATIDO_MS) return;      // hipo normal
    if (hueco > TECHO_MS) return;                   // la máquina, no la app
    if (document.visibilityState !== "visible") return;
    if (inicio < _visibleDesde) return;             // el hueco empezó de fondo
    _avisar(hueco, peor, tareas);
  }, LATIDO_MS);
}
