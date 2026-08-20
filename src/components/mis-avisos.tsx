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
 * Un aviso común NO interrumpe: aparece en la barra solo si hay algo. Un badge
 * que está siempre deja de mirarse.
 *
 * ⚠️ **PERO ALGUNOS SÍ INTERRUMPEN** (user, 2026-08-19, sobre los saldos del
 * día): *«tiene que ser como el modal de briefing: aparece en la pantalla, llama
 * la atención y te hace hacer algo para continuar. No que aparezca en el cuerpo
 * del agente como si nada»*.
 *
 * Los que traen `interrumpe` abren solos y traen una TABLA que se completa fila
 * por fila. Cada tilde queda con quién y cuándo. Y **vencen**: el de saldos vale
 * hoy, mañana el mercado abre con otros números.
 */
type Item = {
  id: number; etiqueta: string; hecho: boolean; hecho_at: string | null;
  datos: { cuenta?: string; moneda?: string; saldo?: number; signo?: string;
           grupo?: string };
};
type Aviso = {
  id: number; ticker: string; clave: string;
  que_hacer: string; por_que: string | null; donde: string | null;
  creado_at: string | null;
  interrumpe?: boolean; vence_at?: string | null;
  items?: Item[]; pendientes?: number;
};

export function MisAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierto, setAbierto] = useState(false);
  // Los que ya se pospusieron EN ESTA SESIÓN. No se guarda en localStorage a
  // propósito: un aviso del día que se puede silenciar para siempre con un click
  // deja de ser un aviso. Al recargar vuelve — y vence solo a la medianoche.
  const [pospuestos, setPospuestos] = useState<Set<number>>(new Set());

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

  const marcarItem = useCallback(async (itemId: number, hecho: boolean) => {
    try {
      await fetchJson("/api/avisos/item", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemId, hecho }),
      });
    } catch { /* vuelve en el próximo poll */ }
    await cargar();
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

  // EL QUE INTERRUMPE. Uno por vez: dos modales encimados no son el doble de
  // urgente, son ninguno.
  const urgente = avisos.find(
    (a) => a.interrumpe && !pospuestos.has(a.id) && (a.pendientes ?? 0) > 0);

  return (
    <>
      {/* ── EL MODAL QUE TE FRENA ────────────────────────────────────────
          Mismo lugar y mismo peso que el de briefing: aparece encima de todo y
          hay que hacer algo con él. NO se cierra clickeando afuera —eso es lo
          que lo diferencia de un panel— pero SÍ se puede posponer, y el botón
          lo dice. Un modal del que no se puede salir en una app de trading es
          peligroso: alguien puede necesitar la pantalla YA.

          Posponer dura la sesión y no se guarda: un aviso del día que se
          silencia para siempre con un click deja de ser un aviso. */}
      {urgente && (
        <div className="fixed inset-0 z-[90] bg-black/70 flex items-center justify-center p-4">
          <div className="w-[1100px] max-w-[97vw] bg-[var(--t-panel)] border border-[var(--t-accent)] shadow-2xl flex flex-col max-h-[86vh]">
            <div className="flex items-baseline gap-2 px-4 py-2 border-b border-[var(--t-border)]">
              <span className="text-[11px] font-semibold tracking-widest text-[var(--t-accent)]">
                {urgente.que_hacer}
              </span>
              <span className="ml-auto text-[10px] tabular-nums text-[var(--t-text-dim)]">
                {urgente.pendientes} sin marcar de {urgente.items?.length ?? 0}
              </span>
            </div>
            {urgente.por_que && (
              <p className="px-4 pt-2 text-[10px] text-[var(--t-text-muted)]">
                {urgente.por_que}
              </p>
            )}
            {/* ── CUATRO CUADRANTES ────────────────────────────────────
                ARS a la izquierda, dólares a la derecha, 50 y 50. Arriba lo
                positivo, abajo lo negativo. El encabezado CUENTA · SALDO va UNA
                vez por columna y no se repite abajo — el user lo pidió así y
                tiene razón: repetirlo parte visualmente algo que es una sola
                tabla.

                Top 5 por cuadrante, los que más pesan. Es lo que hay que
                atender hoy; el resto está en SALDOS y el detalle lo dice. */}
            <div className="overflow-y-auto px-4 py-2 grid grid-cols-2 gap-x-6">
              {(["ARS", "USD"] as const).map((grupo) => {
                const del = (urgente.items ?? []).filter(
                  (i) => (i.datos.grupo ?? "ARS") === grupo);
                const pos = del.filter((i) => (i.datos.saldo ?? 0) > 0);
                const neg = del.filter((i) => (i.datos.saldo ?? 0) < 0);
                return (
                  <div key={grupo} className="min-w-0">
                    <div className="flex items-baseline gap-2 pb-0.5 border-b border-[var(--t-border)]">
                      <span className="text-[10px] font-semibold tracking-widest text-[var(--t-accent)]">
                        {grupo}
                      </span>
                      <span className="ml-auto text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">
                        cuenta
                      </span>
                      <span className="text-[8px] uppercase tracking-widest text-[var(--t-text-dim)] w-28 text-right">
                        saldo
                      </span>
                    </div>
                    {[pos, neg].map((bloque, bi) => (
                      <div key={bi} className={bi ? "mt-2" : ""}>
                        {bloque.length === 0 ? (
                          <p className="text-[9px] text-[var(--t-text-dim)] py-1">
                            sin {bi ? "descubiertos" : "saldos a favor"}
                          </p>
                        ) : bloque.map((it) => {
                          const neg2 = (it.datos.saldo ?? 0) < 0;
                          return (
                            <div key={it.id}
                                 className={`flex items-baseline gap-2 py-0.5 ${
                                   it.hecho ? "opacity-45" : ""}`}>
                              <input
                                type="checkbox" checked={it.hecho}
                                onChange={() => void marcarItem(it.id, !it.hecho)}
                                className="cursor-pointer shrink-0"
                              />
                              <span className={`text-[10px] truncate flex-1 min-w-0 ${
                                    it.hecho ? "line-through" : ""}`}
                                    title={`${it.datos.cuenta} · ${it.datos.moneda}`}>
                                {it.datos.cuenta ?? it.etiqueta}
                              </span>
                              {/* SIN columna de moneda: la columna YA es la
                                  moneda. El aviso cubre solo ARS y USD (user:
                                  «es ARS y USD, no USDC o USDL») — mi primera
                                  versión metía USDL/USDC adentro de USD «para
                                  que no desaparezcan», y eso hacía leer un
                                  número que no existe: cable y billete no se
                                  suman. Las otras dos quedan fuera y el detalle
                                  del mensaje dice cuántas son. */}
                              <span className="text-[10px] tabular-nums font-semibold w-28 text-right shrink-0"
                                    style={{ color: neg2 ? "var(--t-neg)" : "var(--t-pos)" }}>
                                {(it.datos.saldo ?? 0).toLocaleString("es-AR",
                                  { minimumFractionDigits: 2,
                                    maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[8px] text-[var(--t-text-dim)] tabular-nums w-8 shrink-0">
                                {it.hecho_at
                                  ? new Date(it.hecho_at).toLocaleTimeString("es-AR",
                                      { hour: "2-digit", minute: "2-digit" })
                                  : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 px-4 py-2 border-t border-[var(--t-border)]">
              <span className="text-[9px] text-[var(--t-text-dim)]">
                Vale por hoy. Al marcar todas se cierra solo.
              </span>
              <button
                onClick={() => setPospuestos((s) => new Set(s).add(urgente.id))}
                className="ml-auto text-[9px] uppercase tracking-widest px-2 py-1 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
              >
                lo veo en un rato
              </button>
            </div>
          </div>
        </div>
      )}

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
