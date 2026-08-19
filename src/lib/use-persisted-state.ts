"use client";

import { useEffect, useRef, useState } from "react";


/**
 * useState que SOBREVIVE a la navegación entre rutas (y a un F5) durante la
 * sesión del tab del browser. Respaldado en sessionStorage.
 *
 * Problema que resuelve: App Router DESMONTA la vista al navegar a otra ruta →
 * se pierden los `useState` (filtros, selección, etc.). Con esto, al volver a la
 * vista retomás donde dejaste. sessionStorage (no localStorage) a propósito:
 * persiste durante la sesión pero arranca limpio al abrir la app de nuevo —
 * evita que reaparezcan filtros de días atrás.
 *
 * Drop-in: reemplazá `useState(initial)` por `usePersistedState("clave", initial)`.
 * La `key` debe ser ÚNICA por vista+campo (ej. "ops.moneda"). Solo para estado
 * SERIALIZABLE a JSON (no Set/Map/funciones) y que sea elección del usuario
 * (filtros), NO data fetcheada (que quedaría vieja).
 *
 * SSR-safe: el primer render usa `initial` (igual server y cliente → sin
 * hydration mismatch); apenas monta, rehidrata desde sessionStorage.
 */
export function usePersistedState<T>(
  key: string,
  initial: T,
  storage: "session" | "local" = "session",
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initial);
  const hydrated = useRef(false);
  // "local" sobrevive al cierre de la app (preferencias persistentes, ej. cuentas
  // ocultas). "session" (default) arranca limpio cada sesión (filtros transitorios).
  const getStore = () => (storage === "local" ? localStorage : sessionStorage);

  // Al montar (solo cliente): leé lo guardado y aplicalo. El setState dentro del
  // effect es DELIBERADO y correcto acá: sincronizar con un sistema externo
  // (sessionStorage, que no existe en SSR) es el caso de uso legítimo de un
  // effect. El lazy-initializer daría hydration mismatch (server no ve storage).
  useEffect(() => {
    try {
      const raw = getStore().getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      // storage no disponible / JSON corrupto → quedate con `initial`.
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Cada cambio POST-rehidratación se persiste. (Antes de hidratar no escribimos
  // para no pisar lo guardado con el `initial`.)
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      getStore().setItem(key, JSON.stringify(value));
    } catch {
      // cuota llena / modo privado → no es crítico, seguimos en memoria.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  return [value, setValue];
}
