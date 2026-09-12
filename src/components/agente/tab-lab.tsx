"use client";

// LAB — EL ASISTENTE. Doc del backend: `asistente/ciclo.py` y `docs/AGENT.md`.
//
// Una pregunta en castellano sobre la cartera. El backend se la pasa al modelo
// junto con la lista de herramientas que puede usar; el modelo PIDE una
// herramienta por nombre, el backend la corre, le devuelve el resultado, y así
// hasta que contesta. Ese ida y vuelta es «el ciclo», y esta tab existe para
// poder VERLO, no sólo leer el resultado.
//
// TRES DECISIONES DE PANTALLA
// ===========================
//
// 1. **SE ESCRIBE, NO SE ELIGE.** Al revés que la tab vieja: acá no hay una
//    lista de casos, porque el asistente no atiende hallazgos — contesta
//    preguntas del negocio.
//
// 2. **EL CICLO VA PLEGADO, PERO ESTÁ.** La respuesta primero. Los pasos se
//    abren aparte, y hay que poder abrirlos: es lo único que distingue «eligió
//    mal la herramienta» de «la herramienta trajo basura» de «tenía todo y
//    razonó mal».
//
// 3. **LA CONVERSACIÓN LA SOSTIENE ESTA PANTALLA.** El modelo no recuerda nada
//    entre preguntas. El backend devuelve `mensajes` y acá se guardan para
//    mandarlos de vuelta en la siguiente: por eso se puede repreguntar «¿y en
//    dólares?» sin repetir el contexto.
import { useState } from "react";

import { PanelLabIA } from "@/components/agente/panel-lab";
import {
  ICONO_EVENTO,
  type EventoLab, type RespuestaLab,
} from "@/components/agente/tipos";

// Un turno de la conversación tal como se dibuja: lo que se preguntó y todo lo
// que volvió. Se guarda entero porque el punto de la tab es poder revisarlo.
type Turno = { pregunta: string; r: RespuestaLab | null; error?: string };

export function TabLab({ preguntar, leer, guardar }: {
  // Manda la pregunta MÁS el historial. Devuelve la respuesta y el ciclo.
  preguntar: (pregunta: string, historial: Record<string, unknown>[]) => Promise<RespuestaLab>;
  // Para el panel de arriba (gasto y modelo). Va plegado: es información de
  // fondo, y a esta tab se entra a preguntar.
  leer: <T>(url: string) => Promise<T>;
  guardar: <T>(url: string, body?: unknown) => Promise<T>;
}) {
  const [texto, setTexto] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [pensando, setPensando] = useState(false);

  // El historial que viaja: el `mensajes` del último turno que contestó. No se
  // arma acá sumando pedacitos — lo arma el backend, que es quien sabe qué
  // forma tiene que tener cada mensaje para el proveedor.
  const historial = [...turnos].reverse().find((t) => t.r)?.r?.mensajes ?? [];

  async function enviar() {
    const q = texto.trim();
    if (!q || pensando) return;
    setTexto("");
    setPensando(true);
    setTurnos((t) => [...t, { pregunta: q, r: null }]);
    try {
      const r = await preguntar(q, historial);
      setTurnos((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, r } : x)));
    } catch (e) {
      setTurnos((t) => t.map((x, i) =>
        (i === t.length - 1 ? { ...x, error: String(e) } : x)));
    } finally {
      setPensando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <PanelLabIA leer={leer} guardar={guardar} />

      <p className="text-[10px] text-[var(--t-text-dim)]">
        Preguntale por la cartera. <b>Todo dato sale de una herramienta</b> — si no
        lo trajo una consulta, no lo dice. <b>No escribe nada.</b> El alcance de
        cuentas lo fija el backend.
      </p>

      {/* ── PREGUNTAR ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void enviar(); }}
            placeholder="Escribí…"
            className="bg-[var(--t-surface)] border border-[var(--t-border)] text-[11px] px-2 py-1.5 flex-1 text-[var(--t-text)] placeholder:text-[var(--t-text-dim)]"
          />
          <button
            disabled={pensando || !texto.trim()}
            onClick={() => void enviar()}
            className="text-[9px] uppercase tracking-widest px-3 py-1 border border-[var(--t-border)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40"
          >
            {pensando ? "pensando…" : "preguntar"}
          </button>
        </div>
        {turnos.length > 0 && (
          <button
            onClick={() => setTurnos([])}
            disabled={pensando}
            className="self-start text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-40"
          >
            empezar de nuevo
          </button>
        )}
      </div>

      {/* ── LA CONVERSACIÓN ─────────────────────────────────────────── */}
      {turnos.map((t, i) => <VerTurno key={i} t={t} />)}
    </div>
  );
}


// ── UN TURNO: LA RESPUESTA PRIMERO, EL CICLO PLEGADO ─────────────────────
function VerTurno({ t }: { t: Turno }) {
  const [verCiclo, setVerCiclo] = useState(false);
  const r = t.r;

  return (
    <div className="border border-[var(--t-border)] p-2 flex flex-col gap-2">
      <p className="text-[11px] text-[var(--t-accent)] leading-snug">
        <span className="text-[var(--t-text-dim)]">› </span>{t.pregunta}
      </p>

      {t.error && <p className="text-[10px] text-[var(--t-neg)]">{t.error}</p>}
      {!r && !t.error && (
        <p className="text-[10px] text-[var(--t-accent)]">pensando…</p>
      )}

      {r?.error && <p className="text-[10px] text-[var(--t-neg)]">{r.error}</p>}
      {r?.respuesta && (
        <p className="text-[11px] text-[var(--t-text)] leading-relaxed whitespace-pre-wrap">
          {r.respuesta}
        </p>
      )}

      {/* EL CICLO. Plegado, con el resumen a la vista: cuántas vueltas dio y
          cuánto costó son las dos cosas que se miran sin abrir. */}
      {r && (
        <div>
          <button
            onClick={() => setVerCiclo(!verCiclo)}
            className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
          >
            {verCiclo ? "cerrar" : "ver"} el ciclo · {r.vueltas} vuelta(s) ·{" "}
            <span className="tabular-nums">{r.tokens_in}</span> in /{" "}
            <span className="tabular-nums">{r.tokens_out}</span> out
          </button>
          {verCiclo && (
            <div className="bg-[var(--t-surface)] p-1.5 mt-1 max-h-72 overflow-y-auto flex flex-col gap-0.5">
              {r.eventos.map((e, i) => <VerEvento key={i} e={e} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// Cada paso del ciclo en una línea. El resultado de una herramienta se muestra
// como JSON crudo a propósito: es EXACTAMENTE lo que vio el modelo, y
// resumirlo acá sería mirar otra cosa que la que él miró.
function VerEvento({ e }: { e: EventoLab }) {
  const icono = ICONO_EVENTO[e.tipo] ?? "·";
  const linea = (cuerpo: React.ReactNode, tono = "text-[var(--t-text-muted)]") => (
    <p className={`text-[9px] leading-relaxed ${tono}`}>
      <span className="mr-1">{icono}</span>{cuerpo}
    </p>
  );

  switch (e.tipo) {
    case "pregunta":
      return linea(<>puede usar: <b className="text-[var(--t-text)]">{e.herramientas.join(", ")}</b></>);
    case "vuelta":
      return linea(<>vuelta {e.n}</>, "text-[var(--t-text-dim)] mt-1");
    case "pide":
      return linea(
        <><b className="text-[var(--t-text)]">pide {e.herramienta}</b>{" "}
          {JSON.stringify(e.argumentos)}</>,
        "text-[var(--t-accent)]");
    case "resultado":
      return (
        <pre className="text-[9px] text-[var(--t-text-muted)] whitespace-pre-wrap break-all max-h-40 overflow-y-auto pl-4">
          {JSON.stringify(e.resultado, null, 1)}
        </pre>
      );
    case "texto":
      return linea(<>contestó</>, "text-[var(--t-pos)]");
    case "corte":
      return linea(<>{e.motivo}</>, "text-[var(--t-neg)]");
  }
}
