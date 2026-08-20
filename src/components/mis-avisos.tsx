"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

// Lo que se le antepone al título de la pestaña cuando hay algo esperando y la
// app está de fondo. Con el espacio adentro, para poder sacarlo por largo exacto.
const MARCA = "(!) ";

// ⚠️ **UNA SOLA DEFINICIÓN DE COLUMNAS, para el título Y para las filas.**
//
// Antes el encabezado era un `flex` con `ml-auto` y las filas eran otra cosa
// (checkbox + `flex-1` + ancho fijo + la hora). Dos estructuras distintas no
// pueden quedar alineadas por casualidad, y no quedaban: CUENTA terminaba pegado
// a SALDO y SALDO caía corrido por el ancho de la columna de la hora. Con la
// misma grilla en los dos, la alineación es por construcción — no se puede
// romper tocando una sola de las dos partes.
//
//   0.9rem  el checkbox    1fr  la cuenta    7rem  el saldo    2rem  la hora
const COLS = "grid grid-cols-[0.9rem_1fr_7rem_2rem] gap-2 items-baseline";

export function MisAvisos() {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [abierto, setAbierto] = useState(false);
  // Los que ya se pospusieron EN ESTA SESIÓN. No se guarda en localStorage a
  // propósito: un aviso del día que se puede silenciar para siempre con un click
  // deja de ser un aviso. Al recargar vuelve — y vence solo a la medianoche.
  const [pospuestos, setPospuestos] = useState<Set<number>>(new Set());

  // Cuándo se pidió por última vez. Alt-tab dispara `focus` cada vez, y este
  // componente vive en la barra de TODAS las vistas: sin este freno, alguien que
  // salta entre ventanas pega un request por salto.
  const ultimoRef = useRef(0);

  const cargar = useCallback(async () => {
    ultimoRef.current = Date.now();
    try {
      const r = await fetchJson<{ avisos?: Aviso[] }>("/api/avisos");
      setAvisos(r.avisos ?? []);
    } catch {
      /* 403 del portal invitado o backend caído: la barra sigue andando */
    }
  }, []);

  // ⚠️ **TIENE QUE APARECER SIN TOCAR NADA** (user, 2026-08-20: *«hay que
  // actualizar la página, es decir inviable… hay gente que deja esto de fondo»*).
  //
  // Un `setInterval` solo NO alcanza, y el motivo no es la app: **el navegador
  // frena los timers de una pestaña que está en segundo plano.** Chrome los baja
  // a uno por minuto y, pasados unos minutos sin mirarla, puede congelarlos del
  // todo. O sea que justo en el caso que el user describe —la app abierta atrás
  // toda la tarde— el reloj es lo primero que deja de andar, y el aviso aparece
  // recién cuando alguien recarga. Que es como no avisar.
  //
  // Por eso se despierta **por evento** y no solo por reloj:
  //
  //   · vuelve a la pestaña / a la ventana  → pide en el acto
  //   · vuelve internet después de un corte → pide en el acto
  //   · atrás/adelante del navegador        → pide en el acto (bfcache)
  //
  // Y mientras está oculta **no pide nada**: el timer no iba a correr igual, así
  // que en vez de pelearle al navegador se apaga y se recupera al volver. Sale
  // más barato en requests que el poll de antes y llega antes.
  const [oculto, setOculto] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const parar = () => { if (timer) { clearInterval(timer); timer = null; } };
    const despertar = () => {
      const visible = document.visibilityState === "visible";
      setOculto(!visible);
      if (!visible) { parar(); return; }
      // Al volver se pide en el acto, salvo que se acabe de pedir.
      if (Date.now() - ultimoRef.current > 10_000) void cargar();
      // 60s con la pantalla a la vista. Es una lista de tareas, no tiempo real,
      // pero el de saldos sale 16:45 y el mercado cierra 17:00: con 5 minutos se
      // perdía un tercio de la ventana esperando. El resto de la app pollea más
      // seguido que esto (Tesorería 20s, Senebis 10s).
      if (!timer) timer = setInterval(() => void cargar(), 60_000);
    };
    despertar();
    document.addEventListener("visibilitychange", despertar);
    window.addEventListener("focus", despertar);
    window.addEventListener("online", despertar);
    window.addEventListener("pageshow", despertar);
    return () => {
      parar();
      document.removeEventListener("visibilitychange", despertar);
      window.removeEventListener("focus", despertar);
      window.removeEventListener("online", despertar);
      window.removeEventListener("pageshow", despertar);
    };
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

  // EL QUE INTERRUMPE. Uno por vez: dos modales encimados no son el doble de
  // urgente, son ninguno.
  const urgente = avisos.find(
    (a) => a.interrumpe && !pospuestos.has(a.id) && (a.pendientes ?? 0) > 0);

  // ── LA PESTAÑA AVISA ────────────────────────────────────────────────────
  // Con la app de fondo el modal está abierto pero nadie lo está mirando. Lo
  // único que se ve de una pestaña que no estás mirando es su TÍTULO, así que
  // ahí va la marca. Se saca sola al volver.
  //
  // No se pisa el título: se le pone un prefijo y se lo quita. La vista es dueña
  // de su nombre y este componente vive en la barra de todas.
  useEffect(() => {
    const limpio = document.title.startsWith(MARCA)
      ? document.title.slice(MARCA.length) : document.title;
    document.title = urgente && oculto ? MARCA + limpio : limpio;
  }, [urgente, oculto]);

  // Sin nada pendiente NO se dibuja. Un indicador permanente en cero enseña a
  // no mirarlo, y el día que diga 1 tampoco se va a mirar.
  if (avisos.length === 0) return null;

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
            {/* ── DOS LÍNEAS Y NADA MÁS ────────────────────────────────
                Pedido del user (2026-08-20): quién manda, qué pasa, y abajo las
                tablas. Antes había un título que contaba («46 cuenta(s) tuyas
                EN DESCUBIERTO»), un contador arriba a la derecha y un párrafo
                explicando cómo usar la grilla — tres bloques de texto antes de
                lo único que hay que mirar. **El modal se abre para actuar, no
                para leer.**

                Los números NO se borraron: el contador y el detalle bajaron al
                pie, que es donde se miran cuando ya se decidió algo. */}
            <div className="px-4 pt-2.5 pb-2 border-b border-[var(--t-border)]">
              <p className="text-[11px] font-semibold tracking-widest text-[var(--t-accent)]">
                AV AGENT — TENÉS UN MENSAJE NUEVO!
              </p>
              <p className="text-[11px] text-[var(--t-text)] mt-0.5">
                {urgente.que_hacer}
              </p>
            </div>
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
                    {/* La MONEDA va un escalón arriba (pedido del user): es el
                        nombre del bloque, no una columna de la tabla. Poniéndola
                        en la misma línea empujaba a CUENTA y SALDO fuera de sus
                        columnas. */}
                    <p className="text-[10px] font-semibold tracking-widest text-[var(--t-accent)]">
                      {grupo}
                    </p>
                    <div className={`${COLS} pb-0.5 border-b border-[var(--t-border)]`}>
                      <span />
                      <span className="text-[8px] uppercase tracking-widest text-[var(--t-text-dim)]">
                        cuenta
                      </span>
                      <span className="text-[8px] uppercase tracking-widest text-[var(--t-text-dim)] text-right">
                        saldo
                      </span>
                      <span />
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
                                 className={`${COLS} py-0.5 ${
                                   it.hecho ? "opacity-45" : ""}`}>
                              <input
                                type="checkbox" checked={it.hecho}
                                onChange={() => void marcarItem(it.id, !it.hecho)}
                                className="cursor-pointer"
                              />
                              <span className={`text-[10px] truncate min-w-0 ${
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
                              <span className="text-[10px] tabular-nums font-semibold text-right"
                                    style={{ color: neg2 ? "var(--t-neg)" : "var(--t-pos)" }}>
                                {(it.datos.saldo ?? 0).toLocaleString("es-AR",
                                  { minimumFractionDigits: 2,
                                    maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[8px] text-[var(--t-text-dim)] tabular-nums">
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
                {/* Lo que quedó AFUERA se sigue diciendo — abajo. Truncar en
                    silencio se lee como «esto es todo lo que hay», y eso no
                    deja de ser cierto por mover el texto de lugar. */}
                {urgente.por_que ? `${urgente.por_que} ` : ""}
                Vale por hoy. Al marcar todas se cierra solo.
              </span>
              <span className="ml-auto shrink-0 text-[9px] tabular-nums text-[var(--t-text-dim)]">
                {urgente.pendientes} sin marcar de {urgente.items?.length ?? 0}
              </span>
              <button
                onClick={() => setPospuestos((s) => new Set(s).add(urgente.id))}
                className="shrink-0 text-[9px] uppercase tracking-widest px-2 py-1 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
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
