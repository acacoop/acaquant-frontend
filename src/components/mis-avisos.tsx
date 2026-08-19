"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";

/**
 * LO QUE EL AGENTE TE DEJÓ A VOS — para CUALQUIER usuario, no solo admin.
 *
 * Regla del user (2026-08-19): *«el AV AGENT es solo para admin, no para el
 * resto, aunque esto no quiere decir que no tenga el poder para mandar una
 * alerta, notificación, etc. a otro user que no sea admin»*.
 *
 * Y ahí había un bug real: el agente sabía dejarle un pendiente a una persona
 * («completá el nivel_1 de estos comitentes»), pero el endpoint para leerlo
 * vivía bajo `/api/ia`, gateado por el módulo `ia` **que un trader no tiene**.
 * El aviso quedaba guardado para nadie. Ahora vive en `/api/avisos`, sin gate de
 * módulo y filtrando por el email del que pregunta.
 *
 * Es DELIBERADAMENTE chico: no es el agente. El agente sigue siendo admin-only —
 * acá solo llega lo que te mandó, con qué hacer y dónde. Un no-admin no ve
 * hallazgos, ni el estado del sistema, ni puede pedirle nada.
 *
 * Y no interrumpe: aparece en la barra solo si hay algo. Un badge que está
 * siempre deja de mirarse.
 */
type Aviso = {
  id: number; ticker: string; clave: string;
  que_hacer: string; por_que: string | null; donde: string | null;
  creado_at: string | null;
};

export function MisAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierto, setAbierto] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetchJson<{ avisos?: Aviso[] }>("/api/avisos");
      setAvisos(r.avisos ?? []);
    } catch {
      /* 403 del portal invitado o backend caído: la barra sigue andando */
    }
  }, []);

  useEffect(() => {
    void cargar();
    // 5 minutos: esto no es tiempo real, es una lista de tareas.
    const id = setInterval(() => void cargar(), 5 * 60_000);
    return () => clearInterval(id);
  }, [cargar]);

  const hecho = async (id: number) => {
    try {
      await fetchJson("/api/avisos/hecho", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
    } catch { /* si falla vuelve en el próximo poll, que es lo correcto */ }
    await cargar();
  };

  // Sin nada pendiente NO se dibuja. Un indicador permanente en cero enseña a
  // no mirarlo, y el día que diga 1 tampoco se va a mirar.
  if (avisos.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setAbierto((v) => !v)}
        title="Cosas que te dejó el agente para hacer"
        className="inline-flex items-center gap-1 px-1.5 leading-none text-[10px] font-semibold text-[var(--t-accent)] hover:opacity-80 transition-opacity"
      >
        <span className="tracking-widest">PARA VOS</span>
        <span className="px-1 rounded-sm bg-[var(--t-accent)] text-[var(--t-on-accent)] text-[9px] font-bold tabular-nums">
          {avisos.length}
        </span>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-4 bg-black/30"
             onClick={() => setAbierto(false)}>
          <div className="w-[520px] max-w-[92vw] bg-[var(--t-panel)] border border-[var(--t-border)] shadow-xl"
               onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)]">
              <span className="text-[10px] font-semibold tracking-widest text-[var(--t-accent)]">
                PARA VOS · {avisos.length}
              </span>
              <button onClick={() => setAbierto(false)}
                      className="ml-auto text-[var(--t-text-dim)] hover:text-[var(--t-text)] leading-none">
                ×
              </button>
            </div>
            <ul className="divide-y divide-[var(--t-border)] max-h-[60vh] overflow-y-auto">
              {avisos.map((a) => (
                <li key={a.id} className="px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] text-[var(--t-text)] flex-1">
                      {a.que_hacer}
                    </span>
                    <button
                      onClick={() => void hecho(a.id)}
                      className="shrink-0 text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
                    >
                      Ya está
                    </button>
                  </div>
                  {a.por_que && (
                    <p className="text-[10px] leading-snug text-[var(--t-text-muted)]">
                      {a.por_que}
                    </p>
                  )}
                  {a.donde && (
                    <p className="text-[10px] leading-snug text-[var(--t-text-dim)]">
                      se hace en {a.donde}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
