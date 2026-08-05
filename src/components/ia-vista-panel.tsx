"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// Íconos inline (paths de lucide, MIT) — eran los únicos 5 usos de la dep
// lucide-react en todo el repo; inline evita mantener la dependencia.
type IconProps = { size?: number; className?: string };
const _icon = ({ size = 24, className }: IconProps) => ({
  width: size, height: size, className,
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
});
const ArrowRight = (p: IconProps) => (
  <svg {..._icon(p)}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
);
const Send = (p: IconProps) => (
  <svg {..._icon(p)}><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /><path d="m21.854 2.147-10.94 10.939" /></svg>
);
const Sparkles = (p: IconProps) => (
  <svg {..._icon(p)}><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M22 5h-4" /><path d="M4 17v2" /><path d="M5 18H3" /></svg>
);
const ThumbsUp = (p: IconProps) => (
  <svg {..._icon(p)}><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" /></svg>
);
const ThumbsDown = (p: IconProps) => (
  <svg {..._icon(p)}><path d="M17 14V2" /><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" /></svg>
);

import { aplicarEstado } from "@/lib/aplicar-estado";

/**
 * Copiloto de Mesa contextual (QuantAI P3): botón ✦ IA + drawer lateral que
 * responde SOLO sobre los datos de la tabla de la vista donde está montado.
 *
 * - Gate: probe a GET /api/ia/copiloto/vistas — 401/403 (sin módulo `ia`) o
 *   vista no habilitada (sin el módulo RBAC de la vista) → no se renderiza
 *   nada, ni el botón (mismo patrón que BriefingModal: decide el backend).
 * - El browser NUNCA manda datos de la tabla: solo {vista, pregunta,
 *   historial}. El contexto lo arma el server (api/services/copiloto.py).
 * - Historial corto (últimos 4 pares) vive acá, no se persiste.
 * - Cada respuesta muestra la fuente (tabla + filas + hora) y 👍/👎 que va a
 *   ia.trazas.feedback.
 */

type Fuente = { titulo: string; filas: number; generado: string };

type Mensaje = {
  rol: "user" | "ia" | "error";
  texto: string;
  trazaId?: number | null;
  fuente?: Fuente;
  fb?: 1 | -1;
  sinRespaldo?: string[]; // números de la respuesta sin respaldo en los datos
  // derivación a otra vista con copiloto; `pregunta` = la original del user,
  // viaja en el handoff para re-preguntarse sola en la vista destino
  irA?: { vista: string; titulo: string; pregunta?: string };
  // navegación asistida (v1.82): el guía resolvió a dónde ir y con qué
  // filtros; el botón los aplica y abre la vista. El `estado` viene validado
  // server-side contra los catálogos reales.
  navegacion?: {
    ruta: string;
    titulo: string;
    resumen?: string;
    estado: Record<string, unknown>;
  };
};

/** Handoff de derivación entre vistas: al clickear "Abrir X →" se deja acá la
 * pregunta original + conv_id; el panel de la vista destino lo levanta al
 * montar, se abre solo y re-pregunta — el usuario no re-tipea nada.
 * También lo usa el botón 🗣 NARRÁMELO del briefing cuando no está en "/". */
export const HANDOFF_KEY = "ia_handoff";

/** Evento para dispararle una pregunta al panel YA montado en la página
 * (ej. 🗣 NARRÁMELO del briefing estando en HOME). detail:
 * {vista, pregunta, etiqueta?}. Si la vista no coincide, se ignora. */
export const IA_PREGUNTA_EVENT = "acaquant:ia-pregunta";

const MAX_HISTORIAL = 4;

/** Ruta de cada vista con copiloto — para el botón "Abrir X" cuando la
 * pregunta pertenece a otro dominio (el backend valida RBAC antes de sugerir). */
const RUTA_VISTA: Record<string, string> = {
  home: "/",
  renta_variable: "/renta-variable",
  renta_fija: "/renta-fija",
  trading: "/trading",
  // el asistente de negocio vive en el panel de las vistas de negocio —
  // /operaciones es la puerta natural para el handoff
  negocio: "/operaciones",
};

/** Render mínimo: **negrita** y *cursiva* (el modelo las usa aunque pidamos
 * texto plano — mejor mostrarlas bien que mostrar asteriscos crudos). */
function conNegritas(texto: string) {
  const partes = texto.split(/\*\*([^*]+)\*\*/g);
  return partes.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-[var(--t-accent)]">
        {p}
      </strong>
    ) : (
      p.split(/\*([^*\n]+)\*/g).map((q, j) =>
        j % 2 === 1 ? <em key={`${i}-${j}`}>{q}</em> : q,
      )
    ),
  );
}

/** Render de la respuesta: texto plano + tablas markdown simples (pedido del
 * user: los datos en tabla, la lectura abajo). Sin librerías: líneas
 * consecutivas que empiezan con "|" se agrupan como tabla. */
function renderRespuesta(texto: string) {
  const lineas = texto.split("\n");
  const bloques: { tabla: boolean; lineas: string[] }[] = [];
  for (const l of lineas) {
    const esTabla = l.trim().startsWith("|");
    const ult = bloques[bloques.length - 1];
    if (ult && ult.tabla === esTabla) ult.lineas.push(l);
    else bloques.push({ tabla: esTabla, lineas: [l] });
  }
  return bloques.map((b, bi) => {
    if (!b.tabla) return <span key={bi}>{conNegritas(b.lineas.join("\n"))}</span>;
    const filas = b.lineas
      .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
      .filter((celdas) => !celdas.every((c) => /^:?-{2,}:?$/.test(c) || c === ""));
    if (filas.length === 0) return null;
    return (
      <table key={bi} className="my-1.5 w-full text-[10px] font-mono border-collapse">
        <thead>
          <tr className="border-b border-[var(--t-border)]">
            {filas[0].map((c, i) => (
              <th key={i} className="px-1.5 py-0.5 text-left text-[9px] text-[var(--t-text-muted)] tracking-wider">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.slice(1).map((celdas, ri) => (
            <tr key={ri} className="border-b border-[var(--t-border-2)]">
              {celdas.map((c, ci) => (
                <td key={ci} className={"px-1.5 py-0.5 " + (ci > 0 ? "text-right tabular-nums" : "")}>
                  {conNegritas(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  });
}

type Chip = { label: string; pregunta: string };

export function IaVistaPanel({
  vista,
  fallback,
  getParams,
  preguntaExterna,
  tone = "accent",
}: {
  vista: string;
  /** Vista alternativa si el backend NO habilita la principal para este
   * usuario (ej. vistas de negocio: los jefes ven `negocio`, el resto cae
   * al guía `ayuda`). El probe resuelve cuál queda activa. */
  fallback?: string;
  /** Snapshot de los parámetros de la vista al momento de preguntar (ej.
   * trading: tickers de las tarjetas + foco + overrides). El server los
   * sanea y busca los datos él mismo — nunca viajan datos, solo selección. */
  getParams?: () => unknown;
  /** Pregunta disparada desde afuera (ej. "¿lo miramos?" de un toast del
   * vigía): abre el panel y la envía. `n` distingue disparos sucesivos. */
  preguntaExterna?: { texto: string; n: number };
  /** Estilo del botón trigger según DÓNDE vive:
   * - "accent" (default): pastilla con color de acento — para el botón que
   *   se apoya sobre el fondo de la página (ej. /trading).
   * - "onDark": blanco/sutil como la nav — para el header azul fijo (HOME/RF/RV),
   *   donde el acento naranja de modo oscuro quedaba fuera de tono. */
  tone?: "accent" | "onDark";
}) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  // la vista que quedó ACTIVA tras el probe (la principal, o el fallback)
  const [vistaActiva, setVistaActiva] = useState(vista);
  const [open, setOpen] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [chips, setChips] = useState<Chip[]>([]);
  const [etapa, setEtapa] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const histCargado = useRef(false);
  const convId = useRef<string>(crypto.randomUUID());

  // Memoria persistente: al abrir por primera vez se retoma la ÚLTIMA
  // conversación (cada chat es su propio mundo; server la arma de las trazas).
  useEffect(() => {
    if (!open || histCargado.current) return;
    histCargado.current = true;
    fetch("/api/ia/copiloto/historial", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.conv_id) return; // sin conversaciones previas → mundo nuevo
        convId.current = j.conv_id;
        const prev: Mensaje[] = [];
        for (const m of j.mensajes ?? []) {
          prev.push({ rol: "user", texto: m.pregunta });
          prev.push({
            rol: "ia",
            texto: m.respuesta,
            trazaId: m.traza_id,
            fb: m.feedback === 1 ? 1 : m.feedback === -1 ? -1 : undefined,
          });
        }
        if (prev.length) setMensajes((actuales) => [...prev, ...actuales]);
      })
      .catch(() => {});
  }, [open]);

  const nuevaConversacion = useCallback(() => {
    convId.current = crypto.randomUUID();
    setMensajes([]);
    setPregunta("");
    inputRef.current?.focus();
  }, []);

  // "Pensando" con etapas reales del pipeline (leer → redactar → verificar).
  // El reset a etapa 0 lo hace enviar() — acá solo avanza el reloj.
  useEffect(() => {
    if (!pensando) return;
    const t = setInterval(() => setEtapa((e) => Math.min(e + 1, 2)), 3500);
    return () => clearInterval(t);
  }, [pensando]);

  // Probe de habilitación: el backend decide (módulo ia + módulo de la vista).
  // De paso trae los chips (consultas de mesa curadas, versionadas en el repo).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ia/copiloto/vistas", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) return null;
        const j = await r.json();
        const lista: { vista: string; chips?: Chip[] }[] = j?.vistas ?? [];
        // principal si el backend la habilita; si no, el fallback (ej. en
        // vistas de negocio: `negocio` para jefes, `ayuda` para el resto)
        return (
          lista.find((v) => v.vista === vista) ??
          (fallback ? lista.find((v) => v.vista === fallback) : null) ??
          null
        );
      })
      .then((v) => {
        if (cancelled) return;
        setAllowed(!!v);
        setChips((v?.chips as Chip[]) ?? []);
        if (v) setVistaActiva(v.vista);
      })
      .catch(() => !cancelled && setAllowed(false));
    return () => {
      cancelled = true;
    };
  }, [vista, fallback]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [mensajes, pensando]);

  const enviar = useCallback(async (texto?: string, etiqueta?: string) => {
    const q = (texto ?? pregunta).trim();
    if (!q || pensando) return;
    setPregunta("");
    // los chips muestran su etiqueta limpia en el chat; el prompt curado
    // completo viaja al backend por atrás
    setMensajes((prev) => [...prev, { rol: "user", texto: etiqueta ?? q }]);
    setEtapa(0);
    setPensando(true);

    // Historial: últimos pares user→ia completos (los errores no cuentan).
    // `mensajes` del closure = la conversación ANTES de esta pregunta.
    const pares: { pregunta: string; respuesta: string }[] = [];
    for (let i = 0; i < mensajes.length - 1; i++) {
      if (mensajes[i].rol === "user" && mensajes[i + 1]?.rol === "ia") {
        pares.push({ pregunta: mensajes[i].texto, respuesta: mensajes[i + 1].texto });
      }
    }

    try {
      const r = await fetch("/api/ia/copiloto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vista: vistaActiva,
          pregunta: q,
          historial: pares.slice(-MAX_HISTORIAL),
          conv_id: convId.current,
          params: getParams?.() ?? undefined,
        }),
      });
      const j = await r.json();
      if (r.ok && j?.ok) {
        setMensajes((prev) => [
          ...prev,
          {
            rol: "ia",
            texto: j.respuesta,
            trazaId: j.traza_id,
            fuente: j.fuente,
            sinRespaldo: Array.isArray(j.numeros_sin_respaldo) ? j.numeros_sin_respaldo : [],
            irA: j.vista_sugerida ? { ...j.vista_sugerida, pregunta: q } : undefined,
            navegacion: j.navegacion ?? undefined,
          },
        ]);
      } else {
        const msgs: Record<string, string> = {
          datos_no_disponibles: "No hay datos de la tabla en este momento.",
          presupuesto_usuario:
            "Alcanzaste tu límite diario del asistente. Pedile al administrador que te amplíe el cupo — si no, se renueva solo a medianoche UTC.",
          presupuesto_global:
            "El asistente alcanzó el tope diario de todo el sistema. Avisale al administrador si lo necesitás ahora — si no, se renueva a medianoche UTC.",
          verificacion:
            "La respuesta no pasó la verificación contra los datos, así que no se muestra. Reformulá la pregunta o pedime papeles puntuales.",
        };
        setMensajes((prev) => [
          ...prev,
          {
            rol: "error",
            texto: msgs[j?.error as string] ?? "IA no disponible en este momento — probá más tarde.",
          },
        ]);
      }
    } catch {
      setMensajes((prev) => [
        ...prev,
        { rol: "error", texto: "IA no disponible en este momento — probá más tarde." },
      ]);
    } finally {
      setPensando(false);
      inputRef.current?.focus();
    }
  }, [pregunta, pensando, vistaActiva, mensajes, getParams]);

  // Handoff de derivación: si venimos de otra vista con una pregunta pendiente
  // para ESTA, se retoma la MISMA conversación, el panel se abre solo y
  // re-pregunta en segundo plano — cero re-tipeo (pedido del user 2026-07-12).
  const handoffHecho = useRef(false);
  useEffect(() => {
    if (allowed !== true || handoffHecho.current) return;
    let h: { vista?: string; pregunta?: string; conv?: string; etiqueta?: string } | null = null;
    try {
      h = JSON.parse(sessionStorage.getItem(HANDOFF_KEY) ?? "null");
    } catch {
      h = null;
    }
    if (!h || h.vista !== vistaActiva || !h.pregunta) return;
    handoffHecho.current = true;
    sessionStorage.removeItem(HANDOFF_KEY);
    if (h.conv) convId.current = h.conv; // el chat sigue siendo el mismo
    setOpen(true);
    void enviar(h.pregunta, h.etiqueta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, vistaActiva]);

  // Pregunta disparada por evento (panel ya montado en la página — ej. el
  // botón 🗣 NARRÁMELO del modal de briefing estando en HOME).
  useEffect(() => {
    const onAsk = (e: Event) => {
      const d = (e as CustomEvent).detail as
        | { vista?: string; pregunta?: string; etiqueta?: string }
        | null;
      if (!d || d.vista !== vistaActiva || !d.pregunta) return;
      setOpen(true);
      void enviar(d.pregunta, d.etiqueta);
    };
    window.addEventListener(IA_PREGUNTA_EVENT, onAsk);
    return () => window.removeEventListener(IA_PREGUNTA_EVENT, onAsk);
  }, [vistaActiva, enviar]);

  // Disparo externo (toast del vigía): abre el panel y manda la pregunta.
  // Va DESPUÉS de la declaración de enviar (orden de hooks).
  const ultimoExterno = useRef(0);
  useEffect(() => {
    if (!preguntaExterna || preguntaExterna.n === ultimoExterno.current) return;
    ultimoExterno.current = preguntaExterna.n;
    setOpen(true);
    void enviar(preguntaExterna.texto);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preguntaExterna]);

  const feedback = useCallback((idx: number, trazaId: number, valor: 1 | -1) => {
    setMensajes((prev) =>
      prev.map((m, i) => (i === idx && !m.fb ? { ...m, fb: valor } : m)),
    );
    fetch("/api/ia/copiloto/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ traza_id: trazaId, feedback: valor }),
    }).catch(() => {});
  }, []);

  if (allowed !== true) return null;

  return (
    <>
      {/* Trigger inline: lo posiciona el padre (ej. ml-auto en la barra de tabs) */}
      <button
        onClick={() => setOpen(true)}
        className={
          "flex items-center gap-1.5 px-2.5 py-1 text-[10px] tracking-wider font-bold uppercase rounded-sm transition-colors " +
          (tone === "onDark"
            ? "text-white/90 bg-white/10 hover:bg-white/20" // header azul fijo (HOME/RF/RV)
            : "bg-[var(--t-accent)] text-[var(--t-bg)] hover:brightness-110") // sobre el fondo de la página (/trading)
        }
        title="Consultale a la IA sobre los datos de esta vista"
      >
        <Sparkles size={11} /> Consultale a la IA
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 bg-[var(--t-panel)]/50 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="fixed right-0 top-0 h-full w-[420px] max-w-[95vw] bg-[var(--t-panel)] border-l border-[var(--t-border)] z-50 flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--t-border)] shrink-0">
              <Sparkles size={13} className="text-[var(--t-accent)]" />
              <span className="text-[12px] tracking-wider text-[var(--t-accent)] font-semibold uppercase">
                Copiloto IA
              </span>
              <button
                onClick={nuevaConversacion}
                className="ml-2 px-2 py-0.5 text-[9px] font-semibold tracking-wide border border-[var(--t-border)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors"
                title="Empezar una conversación nueva (la actual queda guardada)"
              >
                ＋ NUEVA
              </button>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto text-[var(--t-text-dim)] hover:text-[var(--t-neg)] text-[18px] leading-none"
                title="Cerrar (Esc)"
              >
                ×
              </button>
            </div>

            {/* Mensajes */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {mensajes.length === 0 && (
                <div className="text-[11px] text-[var(--t-text-dim)] leading-relaxed">
                  ¿En qué puedo ayudarte?
                </div>
              )}
              {mensajes.map((m, i) =>
                m.rol === "user" ? (
                  <div key={i} className="text-[11px] font-mono text-[var(--t-text)] bg-[var(--t-bg)] border border-[var(--t-border)] px-3 py-2 ml-8">
                    {m.texto}
                  </div>
                ) : m.rol === "error" ? (
                  <div key={i} className="text-[11px] text-[var(--t-text-dim)] italic px-3">
                    {m.texto}
                  </div>
                ) : (
                  <div key={i} className="text-[11px] leading-relaxed text-[var(--t-text)] px-3 py-2 border-l-2 border-[var(--t-accent)] whitespace-pre-wrap mr-4">
                    {renderRespuesta(m.texto)}
                    {m.navegacion && (
                      <a
                        href={m.navegacion.ruta}
                        onClick={(e) => {
                          // los filtros viajan por sessionStorage (claves que
                          // las vistas ya persisten) → se aplican ANTES de
                          // navegar, y si ya estamos en la ruta, el evento
                          // hace que la vista montada los relea.
                          aplicarEstado(m.navegacion!.estado);
                          if (window.location.pathname === m.navegacion!.ruta) {
                            e.preventDefault();
                            setOpen(false);
                          }
                        }}
                        className="mt-2 flex items-center gap-2 px-3 py-2 border border-[var(--t-accent)] bg-[var(--t-accent)]/10 hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] transition-colors group"
                        title="Abre la vista con estos filtros ya aplicados"
                      >
                        <ArrowRight size={13} className="shrink-0" />
                        <span className="flex flex-col text-left leading-tight">
                          <span className="text-[10px] font-semibold tracking-wide uppercase">
                            Ver en {m.navegacion.titulo}
                          </span>
                          {m.navegacion.resumen && (
                            <span className="text-[9px] opacity-70">
                              {m.navegacion.resumen}
                            </span>
                          )}
                        </span>
                      </a>
                    )}
                    {m.irA && RUTA_VISTA[m.irA.vista] && (
                      <a
                        href={RUTA_VISTA[m.irA.vista]}
                        onClick={() => {
                          // handoff: la vista destino re-pregunta sola esto
                          if (m.irA!.pregunta) {
                            try {
                              sessionStorage.setItem(
                                HANDOFF_KEY,
                                JSON.stringify({
                                  vista: m.irA!.vista,
                                  pregunta: m.irA!.pregunta,
                                  conv: convId.current,
                                }),
                              );
                            } catch {}
                          }
                        }}
                        className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold tracking-wide border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] transition-colors"
                        title={`Abrir la vista ${m.irA.titulo} — tu pregunta se repite sola ahí`}
                      >
                        Abrir {m.irA.titulo} →
                      </a>
                    )}
                    {(m.sinRespaldo?.length ?? 0) > 0 && (
                      <div className="mt-1.5 text-[10px] text-[var(--t-neg)]">
                        ⚠ No pude verificar contra los datos:{" "}
                        {m.sinRespaldo!.join(", ")} — tomalo con pinzas.
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--t-text-dim)]">
                      {m.trazaId != null && (
                        <span className="ml-auto flex items-center gap-1.5">
                          <button
                            onClick={() => feedback(i, m.trazaId!, 1)}
                            disabled={!!m.fb}
                            className={m.fb === 1 ? "text-[var(--t-pos)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-pos)]"}
                            title="Respuesta útil"
                          >
                            <ThumbsUp size={11} />
                          </button>
                          <button
                            onClick={() => feedback(i, m.trazaId!, -1)}
                            disabled={!!m.fb}
                            className={m.fb === -1 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)] hover:text-[var(--t-neg)]"}
                            title="Respuesta mala"
                          >
                            <ThumbsDown size={11} />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                ),
              )}
              {pensando && (
                <div className="text-[11px] text-[var(--t-text-dim)] italic px-3 animate-pulse">
                  {["Leyendo los datos de la vista…", "Redactando…", "Verificando números…"][etapa]}
                </div>
              )}
            </div>

            {/* Input */}
            <div className="border-t border-[var(--t-border)] p-3 shrink-0">
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {chips.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => void enviar(c.pregunta, c.label)}
                      disabled={pensando}
                      className="px-2 py-0.5 text-[9px] font-semibold tracking-wide border border-[var(--t-border)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40 transition-colors"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={pregunta}
                  onChange={(e) => setPregunta(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && enviar()}
                  maxLength={500}
                  placeholder="Preguntá sobre esta vista…"
                  className="flex-1 bg-[var(--t-bg)] border border-[var(--t-border)] px-3 py-2 text-[11px] font-mono text-[var(--t-text)] placeholder:text-[var(--t-text-dim)] outline-none focus:border-[var(--t-accent)]"
                />
                <button
                  onClick={() => void enviar()}
                  disabled={pensando || !pregunta.trim()}
                  className="p-2 border border-[var(--t-border)] text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:opacity-40"
                  title="Enviar"
                >
                  <Send size={13} />
                </button>
              </div>
              <div className="mt-1.5 text-[9px] text-[var(--t-text-dim)]">
                Respuestas generadas por IA sobre los datos de esta vista —
                verificá antes de operar.
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
