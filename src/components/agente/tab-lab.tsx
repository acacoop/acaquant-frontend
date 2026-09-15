"use client";

// LAB — EL ASISTENTE (backend: `asistente/`, doc `docs/AvAgentAI.md`).
//
// Se escribe una pregunta dentro de una conversación; el backend corre el
// grafo, guarda la conversación y devuelve la respuesta más cada paso. Acá no
// se sostiene memoria: viaja la pregunta y el id de la conversación, nada más.
import { useCallback, useEffect, useState } from "react";

import { PanelLabIA } from "@/components/agente/panel-lab";
import {
  ICONO_EVENTO,
  type ConversacionLab, type ConversacionResumen, type EstadoLab, type EventoLab,
  type RespuestaLab, type SesionLab, type TablaDeclarada, type TurnoGuardado,
} from "@/components/agente/tipos";

// Un turno como se dibuja. `r` es la respuesta viva (con su ciclo) de una
// pregunta hecha en esta pestaña; `g` es un turno reabierto de la base, que no
// trae ciclo. Uno u otro.
type Turno = { pregunta: string; r?: RespuestaLab; g?: TurnoGuardado; error?: string };

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function TabLab({ preguntar, leer, guardar }: {
  // Manda la pregunta y el id de la conversación (vacío = nueva).
  preguntar: (pregunta: string, sesion: string) => Promise<RespuestaLab>;
  // Para el panel de arriba (gasto y modelo) y la lista de conversaciones.
  leer: <T>(url: string) => Promise<T>;
  guardar: <T>(url: string, body?: unknown) => Promise<T>;
}) {
  const [texto, setTexto] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [pensando, setPensando] = useState(false);
  // La conversación abierta: su id, su título, lo que quedó en foco y su costo.
  // Todo viene del backend con cada respuesta o al reabrir.
  const [sesion, setSesion] = useState<SesionLab | null>(null);
  const [titulo, setTitulo] = useState("");
  const [estado, setEstado] = useState<EstadoLab>({});
  const [lista, setLista] = useState<ConversacionResumen[]>([]);
  const [errorLista, setErrorLista] = useState("");
  const [verLista, setVerLista] = useState(false);

  const refrescarLista = useCallback(async () => {
    try {
      const r = await leer<{ conversaciones: ConversacionResumen[]; error?: string }>(
        "/api/agente/lab/sesiones");
      setLista(r.conversaciones ?? []);
      setErrorLista(r.error ?? "");
    } catch (e) {
      setErrorLista(String(e));
    }
  }, [leer]);

  useEffect(() => {
    const id = setTimeout(() => void refrescarLista(), 0);
    return () => clearTimeout(id);
  }, [refrescarLista]);

  function nueva() {
    setTurnos([]);
    setSesion(null);
    setTitulo("");
    setEstado({});
  }

  async function abrir(id: string) {
    if (pensando) return;
    try {
      const c = await leer<ConversacionLab>(`/api/agente/lab/sesiones/${id}`);
      setTurnos(c.turnos.map((g) => ({ pregunta: g.pregunta, g })));
      setSesion(c.costo);
      setTitulo(c.titulo);
      setEstado(c.estado ?? {});
      setVerLista(false);
    } catch (e) {
      setErrorLista(String(e));
    }
  }

  async function borrar(id: string) {
    try {
      const r = await guardar<{ ok: boolean; error?: string }>(
        `/api/agente/lab/sesiones/${id}/borrar`);
      // Un 200 con `ok: false` es «no se borró»: se dice, no se asume.
      if (!r.ok) { setErrorLista(r.error || "no se pudo borrar"); return; }
      if (sesion?.id === id) nueva();
      await refrescarLista();
    } catch (e) {
      setErrorLista(String(e));
    }
  }

  async function enviar() {
    const q = texto.trim();
    if (!q || pensando) return;
    setTexto("");
    setPensando(true);
    setTurnos((t) => [...t, { pregunta: q }]);
    try {
      const r = await preguntar(q, sesion?.id ?? "");
      setTurnos((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, r } : x)));
      if (r.sesion) setSesion(r.sesion);
      if (r.titulo) setTitulo(r.titulo);
      setEstado(r.estado ?? {});
      void refrescarLista();
    } catch (e) {
      setTurnos((t) => t.map((x, i) =>
        (i === t.length - 1 ? { ...x, error: String(e) } : x)));
    } finally {
      setPensando(false);
    }
  }

  const enFoco = Object.entries(estado);
  const ultimo = [...turnos].reverse().find((t) => t.r)?.r;

  return (
    <div className="flex flex-col gap-3">
      <PanelLabIA leer={leer} guardar={guardar} />

      <p className="text-[10px] text-[var(--t-text-dim)]">
        Preguntale por la cartera y el mercado. <b>Todo dato sale de una herramienta</b> —
        si no lo trajo una consulta, no lo dice. <b>No escribe nada.</b> El alcance de
        cuentas lo fija el backend. Las conversaciones quedan guardadas.
      </p>

      {/* ── LAS CONVERSACIONES ──────────────────────────────────────── */}
      <div className="border border-[var(--t-border)]">
        <div className="flex items-baseline gap-3 px-2 py-1 flex-wrap">
          <button
            onClick={() => setVerLista(!verLista)}
            className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
          >
            {verLista ? "▾" : "▸"} conversaciones ({lista.length})
          </button>
          <button
            onClick={nueva}
            disabled={pensando || (turnos.length === 0 && !sesion)}
            className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-40"
          >
            + nueva
          </button>
          {titulo && (
            <span className="text-[10px] text-[var(--t-text)] truncate max-w-[60%]" title={titulo}>
              {titulo}
            </span>
          )}
        </div>
        {verLista && (
          <div className="border-t border-[var(--t-border)] max-h-56 overflow-y-auto">
            {errorLista && <p className="text-[10px] text-[var(--t-neg)] px-2 py-1">{errorLista}</p>}
            {lista.length === 0 && !errorLista && (
              <p className="text-[10px] text-[var(--t-text-dim)] px-2 py-1">todavía no hay ninguna</p>
            )}
            {lista.map((c) => (
              <div
                key={c.sesion}
                className={`flex items-baseline gap-2 px-2 py-1 text-[10px] border-t border-[var(--t-border)] ${
                  c.sesion === sesion?.id ? "bg-[var(--t-surface)]" : ""}`}
              >
                <button
                  onClick={() => void abrir(c.sesion)}
                  className="flex-1 text-left truncate text-[var(--t-text)] hover:text-[var(--t-accent)]"
                  title={c.titulo}
                >
                  {c.titulo}
                </button>
                <span className="text-[9px] text-[var(--t-text-dim)] tabular-nums whitespace-nowrap">
                  {c.preguntas} preg. · {c.tokens.toLocaleString("es-AR")} tok · {fecha(c.actualizada_at)}
                </span>
                <button
                  onClick={() => void borrar(c.sesion)}
                  className="text-[9px] text-[var(--t-text-dim)] hover:text-[var(--t-neg)]"
                  title="borrar esta conversación"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

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
        {(enFoco.length > 0 || sesion) && (
          <div className="flex items-center gap-3 flex-wrap">
            {/* Lo que el asistente tiene en foco en esta conversación. */}
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
            {/* Si la base no contestó, la pregunta salió igual pero sin memoria
                y sin guardarse: hay que decirlo, o la charla parece seguir. */}
            {ultimo && (ultimo.aviso || ultimo.guardada === false) && (
              <span className="text-[9px] text-[var(--t-neg)]">
                ⚠ {ultimo.aviso || "esta pregunta no quedó guardada"}
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
  const g = t.g;

  return (
    <div className="border border-[var(--t-border)] p-2 flex flex-col gap-2">
      <p className="text-[11px] text-[var(--t-accent)] leading-snug">
        <span className="text-[var(--t-text-dim)]">› </span>{t.pregunta}
        {g && (
          <span className="text-[9px] text-[var(--t-text-dim)] ml-2">
            {fecha(g.at)} · {g.agentes.join(" + ")}
          </span>
        )}
      </p>

      {t.error && <p className="text-[10px] text-[var(--t-neg)]">{t.error}</p>}
      {!r && !g && !t.error && (
        <p className="text-[10px] text-[var(--t-accent)]">pensando…</p>
      )}

      {/* Un turno reabierto: lo que quedó guardado, sin ciclo. */}
      {g?.error && <p className="text-[10px] text-[var(--t-neg)]">{g.error}</p>}
      {g?.respuesta && (
        <p className="text-[11px] text-[var(--t-text)] leading-relaxed whitespace-pre-wrap">
          {g.respuesta}
        </p>
      )}
      {g?.tablas?.map((t, i) => (
        <Tabla key={i} cols={t.columnas} filas={t.filas} total={t.total ?? undefined}
               moneda={t.moneda ?? undefined} cuantas={t.cuantas} />
      ))}
      {g?.falta && (
        <p className="text-[10px] text-[var(--t-accent)] leading-snug">⌀ {g.falta}</p>
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
  const quien = e.agente ? <span className="text-[var(--t-text-dim)] mr-1">[{e.agente}]</span> : null;
  const linea = (cuerpo: React.ReactNode, tono = "text-[var(--t-text-muted)]") => (
    <p className={`text-[9px] leading-relaxed ${tono}`}>
      <span className="mr-1">{icono}</span>{quien}{cuerpo}
    </p>
  );

  switch (e.tipo) {
    case "pregunta":
      return linea(<>herramientas: <b className="text-[var(--t-text)]">{e.herramientas.join(", ")}</b></>);
    case "ruteo":
      return linea(<>agentes: <b className="text-[var(--t-text)]">{e.elegidos.join(", ") || "ninguno"}</b>{" "}
        <span className="text-[var(--t-text-dim)]">({e.motivo})</span></>, "text-[var(--t-accent)]");
    case "junta":
      return linea(<>cruza {e.agentes.join(" + ")}</>, "text-[var(--t-accent)]");
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
