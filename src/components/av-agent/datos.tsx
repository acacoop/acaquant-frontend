"use client";

// LA CAPA DE DATOS del AV Agent — el ÚNICO archivo del modal que puede llamar
// a `fetchJson` (lo garantiza `no-restricted-imports` en eslint.config.mjs,
// el import-linter del front).
//
// Es el espejo front de `docs/AV_AGENT.md` §0.bc («un solo vocabulario para el
// ciclo de vida»), aplicado a la pantalla: **el estado del SERVIDOR tiene UN
// dueño y un ciclo — leer → escribir → RELEER — y los componentes guardan solo
// estado de PANTALLA** (qué tab, qué filtro, qué está abierto). Los dos bugs
// de §0.cb («voté y los botones volvieron», «el informe desapareció al cambiar
// de tab») eran la misma enfermedad en dos formas: verdad del backend cacheada
// ad-hoc en el árbol de componentes, sin regla de dueño ni de invalidación.
//
// Tres verbos, y el verbo dice qué es cada llamada (la misma idea que separa
// `simular` de `aplicar` en el backend — *mirar no puede escribir*):
//
//   leer(url)                  GET. No cambia nada.
//   llamar(url, body)          POST que CALCULA (explicar, simular, lanzar un
//                              run). No muta el estado que la pantalla dibuja,
//                              así que no relee nada.
//   escribir(url, body, relee) POST que MUTA. Declara QUÉ recursos invalida y
//                              los relee al volver — una escritura no puede
//                              olvidarse de releer, porque la relectura no es
//                              una convención del que la llama: es el contrato.
//
// Reglas que esta capa hace estructurales:
//  1. **El front NO DERIVA.** Acción, estado, atendido, nombre — todo viene
//     resuelto del backend en cada recurso. Acá se lee, se escribe y se relee;
//     jamás se "actualiza a mano" una copia local con lo que el cliente cree
//     que quedó.
//  2. **Releer también cuando el backend contestó `ok: false`**: la pantalla
//     tiene que mostrar la verdad del servidor, haya salido bien o mal. Solo
//     un fallo de red (throw) saltea la relectura — no hay a quién preguntarle.
//  3. **«No pude leer» nunca borra lo que había.** Un recurso que falla
//     conserva el dato anterior y expone el error aparte; `null` silencioso
//     dibujado como «no hay nada» es la mentira que el agente persigue en el
//     backend (§0.be) y el front no la puede reintroducir.

import { createContext, useCallback, useContext, useEffect, useRef,
         useState, type ReactNode } from "react";

import { fetchJson } from "@/lib/fetch-json";

// El registro: cada dato del servidor que el modal dibuja, con su ruta. Un
// recurso nuevo es UNA línea acá — y nace con dueño, cache que sobrevive al
// cambio de tab, y relectura declarable desde cualquier escritura.
export const RUTAS = {
  vista: "/api/ia/av-agent/vista",
  control: "/api/ia/av-agent/control",
  centinela: "/api/ia/av-agent/centinela",
  agenda: "/api/ia/av-agent/agenda",
  skills: "/api/ia/av-agent/skills",
  evaluacion: "/api/ia/av-agent/eval",
  sabe: "/api/ia/av-agent/explicar",
} as const;
export type Recurso = keyof typeof RUTAS;

type Capa = {
  /** Lo leído, por recurso. `undefined` = nunca se pidió; el dato viejo queda
   *  si una relectura falla (regla 3). */
  datos: Partial<Record<Recurso, unknown>>;
  /** El último error de lectura por recurso ("" = la última lectura anduvo). */
  errores: Partial<Record<Recurso, string>>;
  recargar: (...cuales: Recurso[]) => Promise<void>;
  leer: <T>(url: string) => Promise<T>;
  llamar: <T>(url: string, body?: unknown) => Promise<T>;
  escribir: <T>(url: string, body: unknown, relee: Recurso[]) => Promise<T>;
};

const Ctx = createContext<Capa | null>(null);

export function DatosProvider({ children }: { children: ReactNode }) {
  const [datos, setDatos] = useState<Partial<Record<Recurso, unknown>>>({});
  const [errores, setErrores] = useState<Partial<Record<Recurso, string>>>({});
  // Qué relecturas están EN VUELO, para que dos escrituras seguidas no pidan
  // dos veces el mismo recurso al mismo tiempo (la segunda espera a la primera).
  const enVuelo = useRef<Partial<Record<Recurso, Promise<void>>>>({});

  const recargar = useCallback(async (...cuales: Recurso[]) => {
    await Promise.all(cuales.map((r) => {
      const pendiente = enVuelo.current[r];
      if (pendiente) return pendiente;
      const p = (async () => {
        try {
          const v = await fetchJson<unknown>(RUTAS[r]);
          setDatos((d) => ({ ...d, [r]: v }));
          setErrores((e) => ({ ...e, [r]: "" }));
        } catch (err) {
          // El dato viejo se queda; el error va aparte. Y la CLAVE queda puesta
          // aunque nunca haya habido dato (null explícito): «lo pedí y falló»
          // tiene que distinguirse de «nunca lo pedí», si no el hook de abajo
          // reintentaría en cada render contra un 403 permanente.
          setDatos((d) => (r in d ? d : { ...d, [r]: null }));
          setErrores((e) => ({
            ...e, [r]: err instanceof Error ? err.message : String(err) }));
        } finally {
          delete enVuelo.current[r];
        }
      })();
      enVuelo.current[r] = p;
      return p;
    }));
  }, []);

  const leer = useCallback(<T,>(url: string) => fetchJson<T>(url), []);

  const llamar = useCallback(<T,>(url: string, body?: unknown) =>
    fetchJson<T>(url, {
      method: "POST",
      ...(body !== undefined && {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    }), []);

  const escribir = useCallback(async <T,>(url: string, body: unknown,
                                          relee: Recurso[]): Promise<T> => {
    // Sin try: si la RED falló, el throw sube al que llama (que es quien sabe
    // qué mostrar) y no se relee — el servidor no está para contestar.
    const r = await llamar<T>(url, body);
    // Se relee SIEMPRE que el servidor contestó — también con `ok: false`
    // (regla 2): lo que dibuja la pantalla es la verdad de la base, no el
    // optimismo del cliente.
    if (relee.length) await recargar(...relee);
    return r;
  }, [llamar, recargar]);

  return (
    <Ctx.Provider value={{ datos, errores, recargar, leer, llamar, escribir }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDatos(): Capa {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDatos fuera de <DatosProvider>");
  return c;
}

/** Un recurso que se carga la PRIMERA vez que alguien lo mira y después queda:
 *  cambiar de tab y volver no lo pierde ni lo vuelve a pedir. Para refrescarlo
 *  a mano está `recargar(r)`. */
export function useRecurso<T>(r: Recurso): { dato: T | null; error: string } {
  const { datos, errores, recargar } = useDatos();
  const pedido = r in datos;
  useEffect(() => { if (!pedido) void recargar(r); }, [pedido, r, recargar]);
  return { dato: (datos[r] ?? null) as T | null, error: errores[r] ?? "" };
}
