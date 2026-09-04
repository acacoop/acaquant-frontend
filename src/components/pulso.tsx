"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

import { arrancarTilde } from "@/lib/tilde";
import { fotoCiegos, suscribirCiegos } from "@/lib/use-poll";

/**
 * EL PULSO — «esta pantalla no se está actualizando», para cualquier vista y
 * cualquier rol. Backend: `POST /api/pulso`, doc `docs/AGENT.md` §0.dg.
 *
 * Dos cosas, y las dos salen del mismo registro de `usePoll`:
 *   1. la MARCA en la barra: «sin actualizar hace N min · /api/x», visible
 *      desde el primer minuto ciego. Antes 3 vistas la tenían y 34 no.
 *   2. el PULSO al backend: uno por minuto por endpoint mientras dure. Nada
 *      mientras todo anda. El agente lo agrupa por vista y lo cruza con el
 *      reinicio de la API.
 *
 * No decide nada: no sabe si es un deploy, el broker o Vercel. Eso lo dice el
 * agente con el latido de la API al lado.
 */
const UMBRAL_MS = 60_000;      // menos de un minuto es un poll fallido, no una pantalla ciega
const PULSO_CADA_MS = 60_000;

// ⚠️ Constante, NO `() => []`. `useSyncExternalStore` compara la foto por
// IDENTIDAD: un array nuevo en cada llamada se lee como «cambió» y obliga a
// React a renderear de nuevo para verificarlo. Con una sola instancia no hay
// nada que verificar.
const SIN_CIEGOS: ReturnType<typeof fotoCiegos> = [];

function minutos(desde: number, ahora: number): number {
  return Math.max(1, Math.round((ahora - desde) / 60_000));
}

export function Pulso() {
  const ciegos = useSyncExternalStore(suscribirCiegos, fotoCiegos, () => SIN_CIEGOS);
  // Reloj propio para que la marca avance aunque no cambie el registro.
  const ahora = useSyncExternalStore(_tic, () => _ahora, () => 0);
  const enviados = useRef<Map<string, number>>(new Map());

  // EL TILDE (`lib/tilde.ts`): la otra mitad de «se me colgó la app». El PULSO
  // mide que los pedidos fallan; el tilde, que el navegador no responde. Se
  // arranca acá porque este componente ya está en TODAS las pantallas y ya es
  // el dueño de contar que algo anda mal.
  useEffect(() => { arrancarTilde(); }, []);

  const viejos = ciegos.filter((c) => ahora - c.desde >= UMBRAL_MS);

  useEffect(() => {
    for (const c of viejos) {
      const ultimo = enviados.current.get(c.endpoint) ?? 0;
      if (ahora - ultimo < PULSO_CADA_MS) continue;
      enviados.current.set(c.endpoint, ahora);
      void fetch("/api/pulso", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vista: c.vista, endpoint: c.endpoint, motivo: c.motivo,
                               desde_at: new Date(c.desde).toISOString() }),
        cache: "no-store",
      }).catch(() => { /* si tampoco llega esto, no hay a quién avisarle */ });
    }
    for (const k of Array.from(enviados.current.keys())) {
      if (!viejos.some((c) => c.endpoint === k)) enviados.current.delete(k);
    }
  }, [viejos, ahora]);

  if (viejos.length === 0) return null;
  const peor = viejos.reduce((a, b) => (a.desde < b.desde ? a : b));
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 leading-none text-[10px] font-semibold text-[var(--t-neg)]"
      title={viejos.map((c) => `${c.endpoint}: ${c.motivo}`).join("\n")}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--t-neg)]" />
      <span className="tracking-widest">SIN ACTUALIZAR</span>
      <span className="tabular-nums">{minutos(peor.desde, ahora)} min</span>
      {viejos.length > 1 && (
        <span className="text-[9px] opacity-80">· {viejos.length} pedidos</span>
      )}
    </span>
  );
}

// Un reloj de a 15 s para el store: cambia `_ahora` y despierta a los oyentes.
let _ahora = 0;
const _relojOyentes = new Set<() => void>();
let _relojId: ReturnType<typeof setInterval> | null = null;
function _tic(f: () => void): () => void {
  _relojOyentes.add(f);
  if (!_relojId) {
    _ahora = Date.now();
    _relojId = setInterval(() => { _ahora = Date.now(); _relojOyentes.forEach((g) => g()); }, 15_000);
  }
  return () => {
    _relojOyentes.delete(f);
    if (_relojOyentes.size === 0 && _relojId) { clearInterval(_relojId); _relojId = null; }
  };
}
