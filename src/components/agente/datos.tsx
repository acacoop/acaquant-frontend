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

import { fetchJson } from "@/lib/fetch-json";
import type { Vista, Historial } from "@/components/agente/tipos";

export const URLS = {
  vista: "/api/agente/vista",
  historial: "/api/agente/historial",
} as const;

export type Recurso = keyof typeof URLS;

export type Datos = {
  vista: Vista | null;
  historial: Historial | null;
  error: Record<Recurso, string>;
  cargando: boolean;
  releer: (...r: Recurso[]) => Promise<void>;
  leer: <T>(url: string) => Promise<T>;
  calcular: <T>(url: string, body?: unknown) => Promise<T>;
  escribir: <T>(url: string, body: unknown, relee: Recurso[]) => Promise<T>;
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

  const leer = useCallback(<T,>(url: string) => fetchJson<T>(url), []);

  const releer = useCallback(async (...rs: Recurso[]) => {
    const lista = rs.length ? rs : (["vista"] as Recurso[]);
    await Promise.all(lista.map(async (r) => {
      try {
        const d = await fetchJson<unknown>(URLS[r]);
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

  // Al abrir carga; después refresca solo mientras está abierto. Cerrado no
  // pollea: un modal cerrado que consulta cada 20 s es tráfico para nadie.
  useEffect(() => {
    if (!abierto) return;
    let cancelado = false;
    setCargando(true);
    void releer("vista").finally(() => { if (!cancelado) setCargando(false); });
    const id = setInterval(() => void releer("vista"), 20_000);
    return () => { cancelado = true; clearInterval(id); };
  }, [abierto, releer]);

  return useMemo(() => ({
    vista, historial, error, cargando, releer, leer, calcular, escribir,
  }), [vista, historial, error, cargando, releer, leer, calcular, escribir]);
}
