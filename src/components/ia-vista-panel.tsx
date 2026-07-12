"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";

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
};

const MAX_HISTORIAL = 4;

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

export function IaVistaPanel({ vista }: { vista: string }) {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pregunta, setPregunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [chips, setChips] = useState<Chip[]>([]);
  const [etapa, setEtapa] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const histCargado = useRef(false);

  // Memoria persistente: al abrir por primera vez se recuperan los últimos
  // intercambios (reconstruidos server-side desde las trazas).
  useEffect(() => {
    if (!open || histCargado.current) return;
    histCargado.current = true;
    fetch("/api/ia/copiloto/historial", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const prev: Mensaje[] = [];
        for (const m of j?.mensajes ?? []) {
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
        return (j?.vistas ?? []).find((v: { vista: string }) => v.vista === vista) ?? null;
      })
      .then((v) => {
        if (cancelled) return;
        setAllowed(!!v);
        setChips((v?.chips as Chip[]) ?? []);
      })
      .catch(() => !cancelled && setAllowed(false));
    return () => {
      cancelled = true;
    };
  }, [vista]);

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
          vista,
          pregunta: q,
          historial: pares.slice(-MAX_HISTORIAL),
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
          },
        ]);
      } else {
        const msgs: Record<string, string> = {
          datos_no_disponibles: "No hay datos de la tabla en este momento.",
          presupuesto_usuario:
            "Alcanzaste tu límite diario de IA. Un admin puede subirlo en Manager → OBSERVABILIDAD → IA.",
          presupuesto_global:
            "El sistema alcanzó su tope diario de IA — se renueva a medianoche UTC.",
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
  }, [pregunta, pensando, vista, mensajes]);

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
        className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--t-accent)] text-[var(--t-bg)] text-[10px] tracking-wider font-bold uppercase rounded-sm hover:brightness-110 transition"
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
