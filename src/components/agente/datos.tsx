"use client";

// LA CAPA DE DATOS del AV Agent — el ÚNICO archivo del modal que puede llamar
// a `@/lib/fetch-json`, y **el lint lo hace estructural**.
//
// Los componentes guardan estado de PANTALLA (qué tab, qué filtro). El estado
// del SERVIDOR tiene un dueño y un ciclo, y el verbo dice qué es la llamada:
//
//   leer(url)                   GET. No cambia nada.
//   calcular(url, body)         POST que CALCULA (preview). No muta, no relee.
//   escribir(url, body, relee)  POST que MUTA. Declara qué invalida y RELEE.
//
// Un fetch suelto adentro de una tab es cómo nacieron «apliqué y los botones
// volvieron» y «el informe desapareció al cambiar de tab».
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { conTecho, fetchJson } from "@/lib/fetch-json";
import type { Vista, Historial } from "@/components/agente/tipos";

export const URLS = {
  vista: "/api/agente/vista",
  historial: "/api/agente/historial",
} as const;

export type Recurso = keyof typeof URLS;

export type ResultadoNoInteresanOns = {
  ok: boolean; descartadas?: string[]; quedan?: number;
  detalle?: string; error?: string;
};

export type ResultadoNoInteresanCedears = {
  ok: boolean; descartados?: string[]; quedan?: number;
  detalle?: string; error?: string;
};

export type Datos = {
  vista: Vista | null;
  historial: Historial | null;
  error: Record<Recurso, string>;
  cargando: boolean;
  releer: (...r: Recurso[]) => Promise<void>;
  leer: <T>(url: string) => Promise<T>;
  calcular: <T>(url: string, body?: unknown) => Promise<T>;
  escribir: <T>(url: string, body: unknown, relee: Recurso[]) => Promise<T>;
  noInteresanOns: (id: number, tickers: string[], todas: boolean)
    => Promise<ResultadoNoInteresanOns>;
  noInteresanCedears: (id: number, tickers: string[], todas: boolean)
    => Promise<ResultadoNoInteresanCedears>;
};

export function useAgente(abierto: boolean): Datos {
  const [vista, setVista] = useState<Vista | null>(null);
  const [historial, setHistorial] = useState<Historial | null>(null);
  const [error, setError] = useState<Record<Recurso, string>>({
    vista: "", historial: "",
  });
  const [cargando, setCargando] = useState(false);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);

  // ⚠️ **Techo a las LECTURAS.** Un GET colgado dejaba el modal cargando para
  // siempre (el navegador no le pone timeout a `fetch`) y, peor, con el poll
  // viejo se apilaba encima. 25 s es más que el `maxDuration = 30` del proxy de
  // Next: lo que tarde más que eso ya no va a contestar nada útil.
  //
  // A las ESCRITURAS no se les pone techo a propósito: abortar un POST no
  // deshace lo que el backend ya escribió, y dejaría la pantalla sin saber si
  // el arreglo se aplicó — que es peor que esperar.
  const leer = useCallback(<T,>(url: string) => fetchJson<T>(url, { signal: conTecho(25_000) }), []);

  const releer = useCallback(async (...rs: Recurso[]) => {
    const lista = rs.length ? rs : (["vista"] as Recurso[]);
    await Promise.all(lista.map(async (r) => {
      try {
        const d = await fetchJson<unknown>(URLS[r], { signal: conTecho(25_000) });
        if (!vivo.current) return;
        // ⚠️ «No pude leer» NUNCA borra lo que había: un recurso que falla
        // deja el error a la vista y **conserva** lo último bueno. Dibujar
        // vacío se lee como «no hay nada», que es otra afirmación.
        if (r === "vista") setVista(d as Vista);
        else setHistorial(d as Historial);
        setError((e) => ({ ...e, [r]: "" }));
      } catch (e) {
        if (vivo.current) setError((x) => ({ ...x, [r]: String(e) }));
      }
    }));
  }, []);

  const calcular = useCallback(async <T,>(url: string, body?: unknown) => {
    return fetchJson<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  }, []);

  const escribir = useCallback(async <T,>(
    url: string, body: unknown, relee: Recurso[],
  ) => {
    const r = await fetchJson<T>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // Relee SIEMPRE, también si el backend contestó `ok: false`: la pantalla no
    // puede quedar mostrando un estado que el backend rechazó.
    await releer(...relee);
    return r;
  }, [releer]);

  // Descarta ONs por ticker (no el aviso `alta_on` entero): el backend recorta
  // a lo que el detector ofreció y vuelve a correr el detector.
  const noInteresanOns = useCallback(
    (id: number, tickers: string[], todas: boolean) =>
      escribir<ResultadoNoInteresanOns>(
        "/api/agente/ons/no-interesan", { id, tickers, todas }, ["vista"],
      ),
    [escribir],
  );

  // Descarta CEDEARs por ticker (no el aviso `alta_cedear` entero): mismo
  // patrón que `noInteresanOns` — el backend recorta a lo que el detector
  // ofreció y vuelve a correr el detector.
  const noInteresanCedears = useCallback(
    (id: number, tickers: string[], todas: boolean) =>
      escribir<ResultadoNoInteresanCedears>(
        "/api/agente/cedears/no-interesan", { id, tickers, todas }, ["vista"],
      ),
    [escribir],
  );

  // ⚠️⚠️ **EL AGENTE CARGA SIEMPRE, ESTÉ EL MODAL ABIERTO O NO.**
  //
  // La primera versión sólo cargaba al abrir (`if (!abierto) return`), y con eso
  // el botón de la barra decía «detenido» y sin número **hasta que alguien lo
  // abría**. O sea: para enterarte de que había algo tenías que entrar a
  // mirar — que es exactamente lo contrario de para qué existe un agente.
  //
  // El user (2026-08-24): *«el AGENT no figura por sí solo, necesita que sí o sí
  // haya algo para aparecer en la página, y eso está mal»*.
  //
  // Cerrado pollea LENTO (2 min) y abierto RÁPIDO (20 s): el badge tiene que
  // estar vivo, pero un modal cerrado consultando cada 20 s es tráfico para
  // nadie.
  //
  // ⚠️ **NO SE SUPERPONE CONSIGO MISMO, y espera a estar de vuelta para
  // programar el siguiente.** Antes era un `setInterval` pelado: si `/vista`
  // tardaba más que el intervalo (con el modal abierto son 20 s, y ese request
  // arma seis consultas del lado del servidor), el reloj disparaba igual y los
  // pedidos se apilaban — cada uno pidiendo otra vez el mismo tablero y
  // ocupando otra conexión del pool de la API, justo cuando ya venía lenta.
  // Un timer que se re-arma al terminar no puede apilar nada.
  //
  // Y **con la pestaña de fondo no pide**: el navegador no la está mostrando,
  // así que un pedido cada 2 minutos por pestaña abierta todo el día es tráfico
  // para nadie. Al volver a mirarla se pide en el acto, así lo primero que se
  // ve está fresco.
  useEffect(() => {
    let vivoEfecto = true;
    let corriendo = false;
    let id: ReturnType<typeof setTimeout> | null = null;

    const programar = () => {
      if (!vivoEfecto) return;
      if (id) clearTimeout(id);
      id = setTimeout(() => void tick(), abierto ? 20_000 : 120_000);
    };

    async function tick() {
      if (!vivoEfecto || corriendo) return;
      // Escondida = no se pide. El `visibilitychange` de abajo la despierta.
      if (typeof document !== "undefined" && document.hidden) { programar(); return; }
      corriendo = true;
      try {
        await releer("vista");
      } finally {
        corriendo = false;
        if (vivoEfecto) setCargando(false);
        programar();
      }
    }

    setCargando(true);
    void tick();
    const alVolver = () => { if (!document.hidden) void tick(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivoEfecto = false;
      if (id) clearTimeout(id);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [abierto, releer]);

  return useMemo(() => ({
    vista, historial, error, cargando, releer, leer, calcular, escribir,
    noInteresanOns, noInteresanCedears,
  }), [vista, historial, error, cargando, releer, leer, calcular, escribir,
       noInteresanOns, noInteresanCedears]);
}
