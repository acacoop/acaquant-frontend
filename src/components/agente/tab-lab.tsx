"use client";

// LAB — EL ASISTENTE (backend: `asistente/`, doc `docs/AvAgentAI.md`).
//
// Se escribe una pregunta dentro de una conversación; el backend corre el
// grafo, guarda la conversación y devuelve la respuesta más cada paso. Acá no
// se sostiene memoria: viaja la pregunta y el id de la conversación, nada más.
import { useCallback, useEffect, useState } from "react";

import { PanelLabIA } from "@/components/agente/panel-lab";
import { TrazaDiagnostico } from "@/components/agente/traza-diagnostico";
import { VerEvento } from "@/components/agente/ver-evento";
import {
  type ConversacionLab, type ConversacionResumen, type DiagnosticoAbierto, type DiagnosticoResumen,
  type EstadoLab, type MetricasRuns, type RespuestaLab, type SesionLab, type TablaDeclarada,
  type TurnoGuardado,
} from "@/components/agente/tipos";

// Un turno como se dibuja. `r` es la respuesta viva (con su ciclo) de una
// pregunta hecha en esta pestaña; `g` es un turno reabierto de la base, que no
// trae ciclo. Uno u otro.
type Turno = { pregunta: string; r?: RespuestaLab; g?: TurnoGuardado; error?: string };

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function TabLab({ preguntar, leer, guardar, cancelarRun, diagnostico, abrirDiagnostico,
                         pedirDiagnostico, cancelarDiagnostico }: {
  // Manda la pregunta y el id de la conversación (vacío = nueva).
  preguntar: (pregunta: string, sesion: string,
              actualizar: (respuesta: RespuestaLab) => void) => Promise<RespuestaLab>;
  cancelarRun: (runId: string) => Promise<unknown>;
  // Para el panel de arriba (gasto y modelo) y la lista de conversaciones.
  leer: <T>(url: string) => Promise<T>;
  guardar: <T>(url: string, body?: unknown) => Promise<T>;
  // EL DIAGNÓSTICO abierto (desde AHORA o desde la lista de acá): se ve su
  // ciclo. Qué está abierto vive en el modal, para que AHORA y el LAB hablen
  // del mismo; el contenido lo sirve el backend.
  diagnostico?: DiagnosticoAbierto | null;
  abrirDiagnostico?: (d: DiagnosticoAbierto | null) => void;
  pedirDiagnostico?: (id: number) => Promise<{ ok: boolean; run_id?: string; error?: string }>;
  cancelarDiagnostico?: (runId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [texto, setTexto] = useState("");
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [pensando, setPensando] = useState(false);
  const [runActivo, setRunActivo] = useState("");
  // La conversación abierta: su id, su título, lo que quedó en foco y su costo.
  // Todo viene del backend con cada respuesta o al reabrir.
  const [sesion, setSesion] = useState<SesionLab | null>(null);
  const [titulo, setTitulo] = useState("");
  const [estado, setEstado] = useState<EstadoLab>({});
  const [lista, setLista] = useState<ConversacionResumen[]>([]);
  const [errorLista, setErrorLista] = useState("");
  const [verLista, setVerLista] = useState(false);
  const [metricas, setMetricas] = useState<MetricasRuns | null>(null);
  // LOS DIAGNÓSTICOS: una fila por corrida, creada sola cuando se encola. Es la
  // cola y el historial a la vista; mientras hay alguno activo se relee.
  const [diagnosticos, setDiagnosticos] = useState<DiagnosticoResumen[]>([]);
  const [activosDiag, setActivosDiag] = useState(0);
  const [errorDiag, setErrorDiag] = useState("");
  const [verDiagnosticos, setVerDiagnosticos] = useState(true);

  const refrescarDiagnosticos = useCallback(async () => {
    try {
      const r = await leer<{ diagnosticos: DiagnosticoResumen[]; activos: number }>(
        "/api/agente/diagnostico?limite=50");
      setDiagnosticos(r.diagnosticos ?? []);
      setActivosDiag(r.activos ?? 0);
      setErrorDiag("");
    } catch (e) {
      setErrorDiag(String(e));
    }
  }, [leer]);

  useEffect(() => {
    if (activosDiag === 0) return;
    const id = setInterval(() => void refrescarDiagnosticos(), 5000);
    return () => clearInterval(id);
  }, [activosDiag, refrescarDiagnosticos]);

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

  const refrescarMetricas = useCallback(async () => {
    try {
      setMetricas(await leer<MetricasRuns>("/api/agente/lab/metricas/runs?dias=7"));
    } catch {
      // La conversación sigue siendo usable aunque la telemetría no responda.
    }
  }, [leer]);

  useEffect(() => {
    const id = setTimeout(() => {
      void refrescarLista();
      void refrescarMetricas();
      void refrescarDiagnosticos();
    }, 0);
    return () => clearTimeout(id);
  }, [refrescarLista, refrescarMetricas, refrescarDiagnosticos]);

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
      const actualizar = (r: RespuestaLab) => {
        setRunActivo(r.run_id ?? "");
        setTurnos((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, r } : x)));
      };
      const r = await preguntar(q, sesion?.id ?? "", actualizar);
      setTurnos((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, r } : x)));
      if (r.sesion) setSesion(r.sesion);
      if (r.titulo) setTitulo(r.titulo);
      setEstado(r.estado ?? {});
      void refrescarLista();
      void refrescarMetricas();
    } catch (e) {
      setTurnos((t) => t.map((x, i) =>
        (i === t.length - 1 ? { ...x, error: String(e) } : x)));
    } finally {
      setRunActivo("");
      setPensando(false);
    }
  }

  const enFoco = Object.entries(estado);
  const ultimo = [...turnos].reverse().find((t) => t.r)?.r;

  return (
    <div className="flex flex-col gap-3">
      <PanelLabIA leer={leer} guardar={guardar} />

      {/* ── EL CICLO DE UN DIAGNÓSTICO (viene de AHORA) ─────────────────── */}
      {diagnostico && (
        <TrazaDiagnostico key={`${diagnostico.hallazgo}:${diagnostico.run ?? ""}`}
                          hallazgoId={diagnostico.hallazgo} runInicial={diagnostico.run} leer={leer}
                          pedir={pedirDiagnostico} cancelar={cancelarDiagnostico}
                          cerrar={() => abrirDiagnostico?.(null)}
                          cambio={() => void refrescarDiagnosticos()} />
      )}

      {/* ── LOS DIAGNÓSTICOS ────────────────────────────────────────────
          Una fila por corrida del diagnóstico (backend: ia.ejecuciones,
          tipo = diagnostico). Se crea sola al encolarse; abrirla muestra su
          ciclo arriba. Lo que está «en cola» con hora vieja es lo que el
          contador de atascados contaba sin decir qué era. */}
      <div className="border border-[var(--t-border)]">
        <div className="flex items-baseline gap-3 px-2 py-1 flex-wrap">
          <button
            onClick={() => setVerDiagnosticos(!verDiagnosticos)}
            className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
          >
            {verDiagnosticos ? "▾" : "▸"} diagnósticos ({diagnosticos.length})
            {activosDiag > 0 && <span className="text-[var(--t-accent)]"> · {activosDiag} en curso</span>}
          </button>
          <button
            onClick={() => void refrescarDiagnosticos()}
            className="text-[9px] uppercase tracking-widest text-[var(--t-text-dim)] hover:text-[var(--t-accent)]"
          >
            ↻
          </button>
        </div>
        {verDiagnosticos && (
          <div className="border-t border-[var(--t-border)] max-h-56 overflow-y-auto">
            {errorDiag && <p className="text-[10px] text-[var(--t-neg)] px-2 py-1">{errorDiag}</p>}
            {diagnosticos.length === 0 && !errorDiag && (
              <p className="text-[10px] text-[var(--t-text-dim)] px-2 py-1">todavía no corrió ninguno</p>
            )}
            {diagnosticos.map((x) => (
              <button
                key={x.run_id}
                onClick={() => x.hallazgo_id != null && abrirDiagnostico?.({ hallazgo: x.hallazgo_id, run: x.run_id })}
                className={`w-full text-left flex items-baseline gap-2 px-2 py-1 text-[10px] border-t border-[var(--t-border)] hover:bg-[var(--t-surface)] ${
                  x.run_id === diagnostico?.run ? "bg-[var(--t-surface)]" : ""}`}
              >
                <span className="text-[9px] text-[var(--t-text-dim)] tabular-nums whitespace-nowrap">
                  {fecha(x.creada_at)}
                </span>
                <span className={`text-[9px] uppercase tracking-widest whitespace-nowrap ${
                  x.estado === "succeeded" ? "text-[var(--t-pos)]"
                    : x.estado === "queued" || x.estado === "running" ? "text-[var(--t-accent)]"
                    : "text-[var(--t-neg)]"}`}>
                  {x.estado === "queued" ? "en cola" : x.estado === "running" ? "corriendo"
                    : x.estado === "succeeded" ? "ok" : x.estado}
                </span>
                <span className="flex-1 truncate text-[var(--t-text)]" title={x.problema ?? undefined}>
                  #{x.hallazgo_id ?? "?"} {x.habilidad ?? ""} · {x.sujeto ?? ""}
                  {x.causa && <span className="text-[var(--t-text-muted)]"> → {x.causa} / {x.accion}</span>}
                  {x.error && <span className="text-[var(--t-neg)]"> · {x.error}</span>}
                </span>
                {x.tokens_in != null && (
                  <span className="text-[9px] text-[var(--t-text-dim)] tabular-nums whitespace-nowrap">
                    {x.vueltas ?? 0} v · {x.tokens_in.toLocaleString("es-AR")} in / {(x.tokens_out ?? 0).toLocaleString("es-AR")} out
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {metricas && (
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap border-y border-[var(--t-border)] py-1 text-[9px] tabular-nums text-[var(--t-text-dim)]">
          <span>{metricas.dias} d · {metricas.resumen.total} runs</span>
          <span className="text-[var(--t-pos)]">{metricas.resumen.succeeded} ok</span>
          <span className={metricas.resumen.failed || metricas.resumen.timed_out ? "text-[var(--t-neg)]" : ""}>
            {metricas.resumen.failed} fallidos · {metricas.resumen.timed_out} vencidos
          </span>
          <span className={metricas.resumen.atascadas ? "text-[var(--t-neg)]" : ""}>
            {metricas.resumen.atascadas} atascados
          </span>
          <span>p95 {(metricas.resumen.p95_ms / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} s</span>
          <span>{metricas.resumen.control_fallido} sin control</span>
        </div>
      )}

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
          {pensando && runActivo && (
            <button
              onClick={() => void cancelarRun(runActivo)}
              className="text-[9px] uppercase tracking-widest px-2 py-1 border border-[var(--t-neg)] text-[var(--t-neg)]"
            >
              cancelar
            </button>
          )}
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
      {r && !r.respuesta && !r.error && (
        <p className="text-[10px] text-[var(--t-accent)]">
          ejecutando · {r.eventos.at(-1)?.tipo ?? "en cola"}
        </p>
      )}

      {/* Un turno reabierto: lo que quedó guardado, sin ciclo. */}
      {g?.error && <p className="text-[10px] text-[var(--t-neg)]">{g.error}</p>}
      {g?.respuesta && (
        <p className="text-[11px] text-[var(--t-text)] leading-relaxed whitespace-pre-wrap">
          {g.respuesta}
        </p>
      )}
      {g?.tablas?.map((t, i) => (
        <Tabla key={i} titulo={t.titulo} cols={t.columnas} filas={t.filas} total={t.total ?? undefined}
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
          Código, no un modelo: saca los números y las citas de la respuesta y
          los busca en lo que se le dio. Va DEBAJO de la respuesta y no en vez
          de ella — avisa, no bloquea. Si esto tapara la respuesta, la primera
          falsa alarma te dejaría sin una contestación que estaba bien.
          Qué significa cada aviso lo dice el backend, por tipo: acá no se
          opina. */}
      {r?.control && !r.control.ok && r.control.hallazgos.map((h, i) => (
        <p key={i} className="text-[9px] text-[var(--t-neg)] leading-snug border-l-2 border-[var(--t-neg)] pl-2">
          ⚠ {h.que_paso}
          {h.detalle.length > 0 && (
            <>: <b>{h.detalle.join(", ")}</b>
              {h.cuantos > h.detalle.length && <> (+{h.cuantos - h.detalle.length})</>}
            </>
          )}
          {(h.significa || h.que_hacer) && (
            <span className="block text-[var(--t-text-dim)]">
              {[h.significa, h.que_hacer].filter(Boolean).join(" ")}
            </span>
          )}
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
              {/* Las citas de evidencia viven acá, no en la frase: la respuesta
                  llega limpia y esto es lo que el control verificó. */}
              {(r.control?.citas?.length ?? 0) > 0 && (
                <p className="text-[9px] leading-relaxed text-[var(--t-text-dim)] mt-1">
                  <span className="mr-1">§</span>citas de evidencia:{" "}
                  {r.control!.citas!.map((c) => `[E:${c.ref}:${c.campo}]`).join(" ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── LAS TABLAS ────────────────────────────────────────────────────────────
//
// Nada de esto está escrito por herramienta: las columnas, el campo de las
// filas y el del total salen del `_tabla` que declara el resultado. Una
// herramienta nueva que declare la suya se dibuja sin tocar este archivo — y
// una que no declare nada sigue contestando en prosa, como `cobros_futuros`.
const MAX_FILAS = 200;

type Dibujo = { titulo?: string; cols: string[]; filas: Record<string, unknown>[];
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
      titulo: decl.titulo,
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

function Tabla({ titulo, cols, filas, total, moneda, cuantas }: Dibujo) {
  const visibles = filas.slice(0, MAX_FILAS);
  const der = derechas(cols, visibles);
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-surface)]">
      {/* De qué es la tabla. Con dos herramientas en un turno salen dos tablas
          seguidas: sin el título no se sabe cuál es de cuál. */}
      {titulo && (
        <div className="px-2 py-1 border-b border-[var(--t-border)] text-[9px] uppercase
                        tracking-wide text-[var(--t-text-dim)]">
          {titulo}
        </div>
      )}
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
