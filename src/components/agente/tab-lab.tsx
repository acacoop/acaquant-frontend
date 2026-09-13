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

      {/* ── LAS TABLAS ────────────────────────────────────────────────
          El modelo NO las escribe: nombra qué parte del resultado hay que
          dibujar (`mostrar`) y las filas se leen del evento `resultado` de esa
          misma herramienta. Es el MISMO objeto que vio él, así que un número
          de acá no puede diferir del que leyó. */}
      {r && (r.mostrar ?? []).map((nombre) => (
        <Tabla key={nombre} nombre={nombre} filas={filasDe(r, nombre)} />
      ))}

      {/* ⚠️ «No pude contestar esto» vale tanto como la respuesta: sin este
          renglón, una pregunta de dos partes contestada a medias se lee como
          contestada entera. */}
      {r?.falta && (
        <p className="text-[10px] text-[var(--t-accent)] leading-snug">
          ⌀ {r.falta}
        </p>
      )}

      {/* El cinturón del esquema. Dice QUÉ LE FALTA A LA HERRAMIENTA: el
          modelo quiso mostrar algo que ninguna devuelve. */}
      {r?.aviso_esquema && (
        <p className="text-[9px] text-[var(--t-text-dim)] leading-snug">
          {r.aviso_esquema}
        </p>
      )}

      {/* ── EL CONTROL ────────────────────────────────────────────────
          Código, no un modelo: saca los números de la respuesta y los busca en
          lo que se le dio. Va DEBAJO de la respuesta y no en vez de ella —
          avisa, no bloquea. Si esto tapara la respuesta, la primera falsa
          alarma te dejaría sin una contestación que estaba bien. */}
      {r?.control && !r.control.ok && r.control.hallazgos.map((h, i) => (
        <p key={i} className="text-[9px] text-[var(--t-neg)] leading-snug border-l-2 border-[var(--t-neg)] pl-2">
          ⚠ {h.que_paso}
          {h.detalle.length > 0 && (
            <>: <b>{h.detalle.join(", ")}</b>
              {h.cuantos > h.detalle.length && <> (+{h.cuantos - h.detalle.length})</>}
            </>
          )}
          <span className="block text-[var(--t-text-dim)]">
            O los calculó él, o los inventó. Verificá antes de usarlos.
          </span>
        </p>
      ))}

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


// ── LAS TABLAS QUE PIDIÓ EL MODELO ────────────────────────────────────────
//
// `mostrar` trae nombres COMPLETOS: `cobros_futuros.por_mes`. El nombre corto
// no alcanzaría — dos herramientas de un mismo turno pueden devolver las dos un
// campo `filas`, y dibujar la tabla equivocada no falla: se ve bien.
//
// ⚠️ **NINGUNA COLUMNA ESTÁ ESCRITA ACÁ.** Salen de las claves de las filas, así
// que una herramienta nueva —o un campo nuevo en una que ya existe— se dibuja
// solo. Una lista de columnas por herramienta sería la misma lista paralela que
// el backend evitó armando el `enum` desde los resultados reales.
const MAX_FILAS = 100;

function filasDe(r: RespuestaLab, nombre: string): Record<string, unknown>[] {
  const corte = nombre.indexOf(".");
  if (corte < 0) return [];
  const herramienta = nombre.slice(0, corte);
  const campo = nombre.slice(corte + 1);
  // El ÚLTIMO resultado de esa herramienta: si el modelo la llamó dos veces
  // (se equivocó de cuenta y corrigió), la que vale es la última.
  const ev = [...r.eventos].reverse().find(
    (e): e is Extract<EventoLab, { tipo: "resultado" }> =>
      e.tipo === "resultado" && e.herramienta === herramienta);
  const valor = (ev?.resultado as Record<string, unknown> | undefined)?.[campo];
  if (!Array.isArray(valor)) return [];
  return valor.filter((f) => f !== null && typeof f === "object") as Record<string, unknown>[];
}

// ⚠️ **NO SE FORMATEA UN NÚMERO ACÁ.** Se dibuja tal cual vino, con la cantidad
// de decimales que trajo la herramienta. Redondear en la pantalla haría que el
// número de la tabla y el de la prosa —que es el que leyó el modelo, sin tocar—
// digan cosas distintas, y el control de números marcaría un invento que no
// existe. Si hay que redondear, se redondea en la query.
function celda(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Tabla({ nombre, filas }: { nombre: string; filas: Record<string, unknown>[] }) {
  // Un nombre que el modelo pidió y no trajo filas no dibuja un cuadro vacío:
  // no dibuja nada. La respuesta ya lo dijo en prosa.
  if (filas.length === 0) return null;
  const cols = [...new Set(filas.flatMap((f) => Object.keys(f)))];
  const visibles = filas.slice(0, MAX_FILAS);

  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-surface)]">
      <p className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] px-2 py-1 border-b border-[var(--t-border)]">
        {nombre}
        {filas.length > visibles.length && (
          <span className="text-[var(--t-accent)]">
            {" "}· {visibles.length} de {filas.length}
          </span>
        )}
      </p>
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[var(--t-surface)]">
            <tr>
              {cols.map((c) => (
                <th key={c} className="text-left font-normal uppercase tracking-wide text-[9px] text-[var(--t-text-dim)] px-2 py-1 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => (
              <tr key={i} className="border-t border-[var(--t-border)]">
                {cols.map((c) => (
                  <td key={c} className="px-2 py-0.5 text-[var(--t-text)] tabular-nums whitespace-nowrap">
                    {celda(f[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
