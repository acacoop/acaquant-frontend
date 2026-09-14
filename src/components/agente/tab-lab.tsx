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
//    dólares?» sin repetir el contexto. Y devuelve `estado` —lo que quedó en
//    foco, hoy la cuenta— que viaja igual pero APARTE: el backend achica los
//    mensajes viejos y el estado es lo único que sobrevive a eso. Y `sesion`,
//    el id de la charla, que junta sus llamadas al modelo para poder decir
//    «esta conversación costó tanto».
import { useState } from "react";

import { PanelLabIA } from "@/components/agente/panel-lab";
import {
  ICONO_EVENTO,
  type EstadoLab, type EventoLab, type RespuestaLab, type SesionLab, type TablaDeclarada,
} from "@/components/agente/tipos";

// Un turno de la conversación tal como se dibuja: lo que se preguntó y todo lo
// que volvió. Se guarda entero porque el punto de la tab es poder revisarlo.
type Turno = { pregunta: string; r: RespuestaLab | null; error?: string };

export function TabLab({ preguntar, leer, guardar }: {
  // Manda la pregunta MÁS el historial MÁS el estado. Devuelve la respuesta y el ciclo.
  preguntar: (pregunta: string, historial: Record<string, unknown>[],
              estado: EstadoLab, sesion: string) => Promise<RespuestaLab>;
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
  const ultimo = [...turnos].reverse().find((t) => t.r)?.r;
  const historial = ultimo?.mensajes ?? [];
  // Lo que quedó en foco: sale del mismo turno que el historial. Acá no se
  // lee para decidir nada — se muestra y se devuelve.
  const estado: EstadoLab = ultimo?.estado ?? {};
  const enFoco = Object.entries(estado);
  // La conversación: el id se devuelve tal cual; el costo se muestra.
  const sesion: SesionLab | undefined = ultimo?.sesion;

  async function enviar() {
    const q = texto.trim();
    if (!q || pensando) return;
    setTexto("");
    setPensando(true);
    setTurnos((t) => [...t, { pregunta: q, r: null }]);
    try {
      const r = await preguntar(q, historial, estado, sesion?.id ?? "");
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTurnos([])}
              disabled={pensando}
              className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-40"
            >
              empezar de nuevo
            </button>
            {/* Lo que el asistente tiene en foco. «Empezar de nuevo» lo borra
                junto con el historial: es de esta conversación. */}
            {enFoco.length > 0 && (
              <span className="text-[9px] text-[var(--t-text-dim)]">
                📌 en foco:{" "}
                {enFoco.map(([k, v]) => (
                  <span key={k} className="text-[var(--t-text-muted)]">{k} {v} </span>
                ))}
              </span>
            )}
            {/* Lo que lleva gastado ESTA charla. Todo viene sumado del backend;
                `usd` null = falta una tarifa, no «gratis». */}
            {sesion && !sesion.error && sesion.llamadas !== undefined && (
              <span className="text-[9px] text-[var(--t-text-dim)] tabular-nums">
                💬 esta conversación: {sesion.llamadas} llamada(s) ·{" "}
                {(sesion.tokens_in ?? 0).toLocaleString("es-AR")} in /{" "}
                {(sesion.tokens_out ?? 0).toLocaleString("es-AR")} out
                {sesion.cache_pct != null && <> · caché {sesion.cache_pct}%</>}
                {sesion.usd != null
                  ? <> · <b className="text-[var(--t-text-muted)]">USD {sesion.usd.toLocaleString("es-AR", { maximumFractionDigits: 4 })}</b></>
                  : sesion.sin_precio && sesion.sin_precio.length > 0
                    ? <> · sin tarifa: {sesion.sin_precio.join(", ")}</>
                    : null}
              </span>
            )}
          </div>
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

      {/* ── LAS TABLAS QUE DECLARÓ LA HERRAMIENTA ──────────────────────
          El modelo no elige ninguna y no escribe un solo número: cada
          herramienta dice en su resultado qué campo suyo es una tabla, y acá
          se dibuja leyendo ESE MISMO objeto. */}
      {r && tablasDe(r).map((t, i) => <Tabla key={i} {...t} />)}

      {/* ⚠️ «No pude contestar esto» vale tanto como la respuesta: sin este
          renglón, una pregunta de dos partes contestada a medias se lee como
          contestada entera. */}
      {r?.falta && (
        <p className="text-[10px] text-[var(--t-accent)] leading-snug">
          ⌀ {r.falta}
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
    case "achicado":
      return linea(<>achicado: {e.chars.toLocaleString("es-AR")} caracteres de resultados viejos</>,
                   "text-[var(--t-text-dim)]");
    case "podado":
      return linea(<>podado: {e.turnos} turno(s) viejo(s), {e.mensajes} mensaje(s)</>,
                   "text-[var(--t-text-dim)]");
    case "estado":
      return linea(
        <>en foco: {Object.entries(e.estado).map(([k, v]) => `${k} = ${v}`).join(", ")}
          {Object.keys(e.antes).length > 0 && (
            <span className="text-[var(--t-text-dim)]">
              {" "}(antes {Object.entries(e.antes).map(([k, v]) => `${k} = ${v}`).join(", ")})
            </span>
          )}</>,
        "text-[var(--t-accent)]");
  }
}


// ── LAS TABLAS ────────────────────────────────────────────────────────────
//
// Nada de esto está escrito por herramienta: las columnas, el campo de las
// filas y el del total salen del `_tabla` que declara el resultado. Una
// herramienta nueva que declare la suya se dibuja sin tocar este archivo — y
// una que no declare nada sigue contestando en prosa, como `cobros_futuros`.
const MAX_FILAS = 200;

type Dibujo = { cols: string[]; filas: Record<string, unknown>[];
                total: unknown; moneda?: string; cuantas: number };

function tablasDe(r: RespuestaLab): Dibujo[] {
  const fuera: Dibujo[] = [];
  // Se recorren los resultados de ESTE turno en orden. Si una herramienta se
  // llamó dos veces (se equivocó de cuenta y corrigió), se dibujan las dos:
  // esconder una sería decidir cuál vale, y eso no lo sabe la pantalla.
  for (const e of r.eventos) {
    if (e.tipo !== "resultado") continue;
    const res = e.resultado as Record<string, unknown> | null;
    const decl = res?.["_tabla"] as TablaDeclarada | undefined;
    if (!decl?.campo || !Array.isArray(decl.columnas)) continue;
    const filas = res?.[decl.campo];
    if (!Array.isArray(filas) || filas.length === 0) continue;
    fuera.push({
      cols: decl.columnas,
      filas: filas.filter((f) => f && typeof f === "object") as Record<string, unknown>[],
      // ⚠️ El total sale del campo que declaró el backend. **Acá no se suma
      // nada**: si el front sumara, una lista recortada daría un total menor
      // que el real y las dos cifras serían defendibles por separado.
      total: decl.total ? res?.[decl.total] : undefined,
      moneda: decl.moneda,
      cuantas: filas.length,
    });
  }
  return fuera;
}

// Los números se dibujan con separador de miles es-AR, que es como los lee la
// mesa. No se redondea: se respetan los decimales que trajo la herramienta —
// redondear acá haría que la tabla y la prosa digan cosas distintas.
function celda(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (typeof v === "number") {
    return v.toLocaleString("es-AR", { maximumFractionDigits: 4 });
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Qué columnas van alineadas a la derecha. Se decide por el TIPO del dato de la
// primera fila, no por el nombre de la columna: una lista de nombres acá sería
// una copia que queda vieja con la próxima herramienta. Los números a la
// derecha (así se comparan las magnitudes de un vistazo), el texto a la
// izquierda — con `emisor` a la derecha la tabla se lee mal.
function derechas(cols: string[], filas: Record<string, unknown>[]): Set<string> {
  const prim = filas[0] ?? {};
  return new Set(cols.filter((c) => typeof prim[c] === "number"));
}

function Tabla({ cols, filas, total, moneda, cuantas }: Dibujo) {
  const visibles = filas.slice(0, MAX_FILAS);
  const der = derechas(cols, visibles);
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-surface)]">
      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[var(--t-surface)]">
            <tr className="border-b border-[var(--t-border)]">
              {cols.map((c) => (
                <th
                  key={c}
                  className={`font-normal uppercase tracking-wide text-[9px] text-[var(--t-text-dim)] px-2 py-1 whitespace-nowrap ${
                    der.has(c) ? "text-right" : "text-left"}`}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => (
              <tr key={i} className="border-t border-[var(--t-border)]">
                {cols.map((c) => (
                  <td
                    key={c}
                    className={`px-2 py-0.5 text-[var(--t-text)] whitespace-nowrap ${
                      der.has(c) ? "text-right tabular-nums" : "text-left"}`}
                  >
                    {celda(f[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(total !== undefined || cuantas > visibles.length) && (
        <div className="border-t border-[var(--t-border)] px-2 py-1 flex justify-between text-[10px]">
          <span className="text-[var(--t-text-dim)]">
            {cuantas > visibles.length
              ? `${visibles.length} de ${cuantas} filas`
              : `${cuantas} fila(s)`}
          </span>
          {total !== undefined && (
            <span className="text-[var(--t-text)] tabular-nums">
              total {moneda ? `${moneda} ` : ""}<b>{celda(total)}</b>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
