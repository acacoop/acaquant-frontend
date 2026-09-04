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

// ── LO QUE ESTÁ CIEGO, compartido por toda la app (AGENT.md §0.dg) ─────────
//
// Cada poll que falla se anota acá con su endpoint y desde cuándo; cuando
// vuelve a andar, se borra. `<Pulso />` (components/pulso.tsx) lo lee para
// dibujar «sin actualizar hace N min» en la barra y para mandarle al backend
// un pulso por minuto mientras dure. Es UN registro para las 37 pantallas:
// hasta ahora 3 mostraban el fallo y 34 no, cada una a su manera.
type Ciego = { endpoint: string; desde: number; motivo: string; vista: string };
const _ciegos = new Map<string, Ciego>();
const _oyentes = new Set<() => void>();
let _foto: Ciego[] = [];

function _avisar() {
  _foto = Array.from(_ciegos.values());
  _oyentes.forEach((f) => f());
}

function _marcarCiego(endpoint: string, motivo: string) {
  const prev = _ciegos.get(endpoint);
  const vista = typeof window !== "undefined" ? window.location.pathname : "";
  _ciegos.set(endpoint, { endpoint, desde: prev?.desde ?? Date.now(), motivo, vista });
  _avisar();
}

function _marcarVivo(endpoint: string) {
  if (_ciegos.delete(endpoint)) _avisar();
}

/** Para `useSyncExternalStore`: suscribirse y leer la foto actual. */
export function suscribirCiegos(f: () => void): () => void {
  _oyentes.add(f);
  return () => { _oyentes.delete(f); };
}
export function fotoCiegos(): Ciego[] {
  return _foto;
}

// ⚠️⚠️ **TECHO DE UN POLL — sin esto, UN pedido colgado congela la pantalla
// para siempre** (el bug de «se tilda y con F5 anda bien», 2026-09-04).
//
// El navegador NO le pone timeout a `fetch`: un request puede quedar pendiente
// minutos (la función de Vercel que no vuelve, la notebook que durmió, el wifi
// que cambió) y, en el peor caso, no resolverse nunca. Acá eso era MUCHO peor
// que perder un poll: como el pedido en vuelo se COMPARTE por URL, la promesa
// colgada quedaba en `_enVuelo` y **cada tick siguiente se colgaba de ella**.
// Resultado: ese endpoint no volvía a pedirse en toda la vida de la pestaña.
//
// Y era INVISIBLE: una promesa que no resuelve no rechaza, así que no entraba
// al catch, no marcaba ciego y la barra ni siquiera decía SIN ACTUALIZAR. La
// pantalla se quedaba quieta mostrando datos viejos, sin un solo error — que es
// exactamente lo que el user describió como «se congela, actualizo y anda».
//
// Con el techo: el pedido se aborta, el tick lo cuenta como fallo (marca ciego
// → SIN ACTUALIZAR en la barra → pulso al agente) y el SIGUIENTE tick reintenta
// de verdad. Se recupera solo y, si no, al menos se ve.
const TECHO_MS = 20_000;

function _abortaEn(ms: number): AbortSignal | undefined {
  // `AbortSignal.timeout` existe en todos los navegadores que corren esta app;
  // el try es por si algún runtime viejo (o un test en jsdom) no lo trae —
  // sin señal se pierde el techo, pero no se rompe el poll.
  try {
    return AbortSignal.timeout(ms);
  } catch {
    return undefined;
  }
}

async function _traerCrudo(endpoint: string): Promise<string> {
  const yaEnCurso = _enVuelo.get(endpoint);
  if (yaEnCurso) return yaEnCurso;
  const pedido = (async () => {
    try {
      const r = await fetch(endpoint, { cache: "no-store", signal: _abortaEn(TECHO_MS) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      // El motivo viaja hasta la barra y hasta el agente: «sin respuesta en
      // 20 s» dice algo muy distinto de «HTTP 502», y confundirlos manda a
      // mirar el lugar equivocado.
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new Error(`sin respuesta en ${TECHO_MS / 1000} s`);
      }
      throw e;
    }
  })();
  // La limpieza cuelga de la PROPIA promesa, no del `await` del que llamó: así
  // se borra igual aunque el caller se desmonte en el medio, y nunca puede
  // quedar una entrada viva más que el techo. `then(f, f)` (y no `finally`) para
  // no crear una promesa que rechace y quede sin handler.
  const limpiar = () => {
    if (_enVuelo.get(endpoint) === pedido) _enVuelo.delete(endpoint);
  };
  pedido.then(limpiar, limpiar);
  _enVuelo.set(endpoint, pedido);
  return pedido;
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
        _marcarVivo(endpoint);
      } catch (e) {
        // mantener data vieja si falló un poll puntual
        const motivo = e instanceof Error ? e.message : "error de red";
        if (alive) setError(motivo);
        _marcarCiego(endpoint, motivo);
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
      // Al desmontar, ese endpoint deja de ser responsabilidad de esta pantalla.
      _marcarVivo(endpoint);
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
