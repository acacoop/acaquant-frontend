"use client";

import { useEffect, useRef, useState } from "react";

import { CarteraForm, type CarteraRequest } from "./cartera-form";
import { CarteraResponse, type CarteraData } from "./cartera-response";

/**
 * Tipos que refleja el backend (api/routers/chat.py).
 * El history se guarda en formato Gemini (role + parts) y se envía de vuelta
 * en cada turno para mantener contexto.
 */

interface AppError {
  title: string;
  message: string;
  hint?: string;
  retryable: boolean;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
}

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiMessage {
  role: "user" | "model" | "assistant";
  parts?: GeminiPart[];
  content?: string | Record<string, unknown>[];
}

interface ChatResponse {
  reply: string;
  tool_calls: ToolCall[];
  history: GeminiMessage[];
  usage: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    model_alias?: string;
  };
  steps: number;
  elapsed_s: number;
  truncated?: boolean;
  model_used?: string;
  conversation_id?: string;
}

interface VisibleTurn {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCall[];
  meta?: { steps: number; elapsed_s: number; tokens?: number; model?: string };
  // Si presente, este turn assistant se renderiza con CarteraResponse en
  // lugar de texto. El campo `text` queda como descripción corta para el
  // history persistido (ej: "Cartera generada").
  carteraData?: CarteraData | null;
  carteraMeta?: { pesos_ok: boolean; pesos_suma: number; error?: string | null };
  // Si presente, el user turn lleva la última request enviada para que el
  // botón "modificar parámetros" pueda reabrir el form precargado.
  carteraReq?: CarteraRequest;
}

// Persistencia del chat en localStorage. Esquema multi-conversación:
// `acaquant:chat:conversations:v1` es un dict { [id]: conversación }.
// El id coincide con conversation_id del backend (Manager.AsistenteLogs)
// para poder cruzar logs si hace falta.
//
// Antes existía `acaquant:chat:state:v1` con UNA sola conversación.
// `migrateLegacyIfAny` lo importa como una conversación inicial y borra
// el storage viejo para no duplicar.
const CONVS_KEY = "acaquant:chat:conversations:v1";
const LEGACY_KEY = "acaquant:chat:state:v1";

interface PersistedConversation {
  id: string;
  turns: VisibleTurn[];
  history: GeminiMessage[];
  lastUpdated: number;  // ms epoch
}

type ConversationsStorage = Record<string, PersistedConversation>;

function loadConversations(): ConversationsStorage {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CONVS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveConversations(c: ConversationsStorage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONVS_KEY, JSON.stringify(c));
  } catch {
    // localStorage lleno o deshabilitado — silencioso
  }
}

function migrateLegacyIfAny(current: ConversationsStorage): ConversationsStorage {
  if (typeof window === "undefined") return current;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return current;
    const parsed = JSON.parse(raw) as {
      turns?: VisibleTurn[];
      history?: GeminiMessage[];
      conversationId?: string | null;
    };
    window.localStorage.removeItem(LEGACY_KEY);
    if (!Array.isArray(parsed?.turns) || parsed.turns.length === 0) return current;
    const id = parsed.conversationId || `local-${Date.now().toString(36)}`;
    if (current[id]) return current;
    return {
      ...current,
      [id]: {
        id,
        turns: parsed.turns,
        history: Array.isArray(parsed.history) ? parsed.history : [],
        lastUpdated: Date.now(),
      },
    };
  } catch {
    return current;
  }
}

function previewConv(c: PersistedConversation): string {
  const firstUser = c.turns.find((t) => t.role === "user");
  const txt = firstUser?.text ?? "(sin mensajes)";
  return txt.length > 60 ? txt.slice(0, 60) + "…" : txt;
}

/**
 * Mini-renderer de markdown inline (sin librerías externas).
 * Soporta: [texto](url), **bold**, `code`, saltos de línea.
 * Los links internos (/, /derivados, etc) se renderizan como <a> naranja;
 * los externos abren en nueva pestaña.
 */
function renderMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let idx = 0;
  // Regex combinado: [texto](url) | **bold** | `code`
  const re = /\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > idx) nodes.push(text.slice(idx, match.index));
    if (match[1] && match[2]) {
      const [label, href] = [match[1], match[2]];
      // Solo permitimos http(s) o rutas internas. Esquemas como javascript:/
      // data: del output del LLM se renderizan como texto plano (anti-XSS).
      const safe = /^(https?:\/\/|\/)/i.test(href.trim());
      if (!safe) {
        nodes.push(`${label} (${href})`);
      } else {
        const external = href.startsWith("http");
        nodes.push(
          <a
            key={key++}
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noopener noreferrer" : undefined}
            className="text-[#ff9900] underline decoration-dotted underline-offset-2 hover:text-[#ffb84d]"
          >
            {label}
          </a>,
        );
      }
    } else if (match[3]) {
      nodes.push(
        <strong key={key++} className="text-white font-semibold">
          {match[3]}
        </strong>,
      );
    } else if (match[4]) {
      nodes.push(
        <code key={key++} className="bg-[#1a1a1a] px-1 text-[#ff9900]">
          {match[4]}
        </code>,
      );
    }
    idx = re.lastIndex;
  }
  if (idx < text.length) nodes.push(text.slice(idx));
  return nodes;
}

async function parseError(res: Response): Promise<AppError> {
  let raw = "";
  try {
    raw = await res.text();
  } catch {
    // Nada que leer
  }

  // El backend devuelve JSON con shape {detail: {code, message, retryable, ...}}.
  // Si no es JSON, asumimos HTML de CF/Vercel (gateway timeout, etc).
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Probablemente HTML de Cloudflare o Vercel
  }

  const detail =
    (parsed.detail as Record<string, unknown> | string | undefined) ??
    (parsed.error as string | undefined);
  const detailObj = typeof detail === "object" && detail !== null ? (detail as Record<string, unknown>) : null;
  const code = detailObj?.code as string | undefined;
  const serverMessage = (detailObj?.message as string | undefined) ?? (typeof detail === "string" ? detail : undefined);

  // 1) Errores que el backend clasifica explícitamente
  if (code === "rate_limit" || res.status === 429) {
    return {
      title: "Modelo saturado",
      message:
        serverMessage ??
        "El modelo recibió demasiadas consultas. Esperá ~1 minuto y volvé a intentar.",
      hint: "Esto es el límite gratuito de Gemini. Activando billing desaparece.",
      retryable: true,
    };
  }
  if (code === "transport" || res.status === 503) {
    return {
      title: "Servicio no disponible",
      message: serverMessage ?? "No pude conectar con el modelo.",
      hint: "Reintentá en unos segundos.",
      retryable: true,
    };
  }
  if (code === "bad_response") {
    return {
      title: "Respuesta inválida del modelo",
      message: serverMessage ?? "El modelo devolvió algo inesperado.",
      retryable: true,
    };
  }
  if (code === "llm_error") {
    return {
      title: "Error del modelo",
      message: serverMessage ?? "Falló la llamada al modelo.",
      retryable: true,
    };
  }
  if (code === "internal") {
    return {
      title: "Error interno",
      message: serverMessage ?? "Algo salió mal en el servidor.",
      retryable: false,
    };
  }

  // 2) HTML crudo → típicamente timeout/gateway/CF
  if (raw.trim().toLowerCase().startsWith("<!doctype") || raw.includes("<html")) {
    return {
      title: "Tiempo de espera excedido",
      message: "El servidor tardó demasiado en responder. Reintentá la consulta.",
      hint: "Si la pregunta es muy abierta, probá acotarla (ej: un bono específico).",
      retryable: true,
    };
  }

  // 3) Fallback: código genérico
  return {
    title: `Error ${res.status}`,
    message: serverMessage ?? "Algo salió mal procesando la consulta.",
    retryable: res.status >= 500,
  };
}

export function ChatView() {
  // Conversación ACTIVA en el panel de chat.
  const [turns, setTurns] = useState<VisibleTurn[]>([]);
  const [history, setHistory] = useState<GeminiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Lista completa de conversaciones guardadas (cargada de localStorage).
  const [conversations, setConversations] = useState<ConversationsStorage>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  // Form de cartera abierto inline. Si tiene initial, viene de "modificar
  // parámetros" sobre una respuesta previa.
  const [carteraFormOpen, setCarteraFormOpen] = useState(false);
  const [carteraFormInitial, setCarteraFormInitial] = useState<Partial<CarteraRequest> | undefined>(
    undefined,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hydratedRef = useRef(false);

  // Cargar conversaciones desde localStorage al montar. NO se carga ninguna
  // como activa — siempre arranca conversación en blanco; las pasadas viven
  // en el sidebar.
  useEffect(() => {
    const fromStorage = loadConversations();
    const migrated = migrateLegacyIfAny(fromStorage);
    if (migrated !== fromStorage) saveConversations(migrated);
    setConversations(migrated);
    hydratedRef.current = true;
  }, []);

  // Auto-save de la conversación activa cuando cambian sus turns/history,
  // pero solo si tiene conversation_id (asignado al recibir la primera
  // respuesta del backend) y al menos un turn. Conversaciones recién
  // arrancadas que aún no tuvieron respuesta no se persisten.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (!conversationId || turns.length === 0) return;
    setConversations((prev) => {
      const next: ConversationsStorage = {
        ...prev,
        [conversationId]: {
          id: conversationId,
          turns,
          history,
          lastUpdated: Date.now(),
        },
      };
      saveConversations(next);
      return next;
    });
  }, [turns, history, conversationId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  async function enviar(texto: string, { isRetry = false } = {}) {
    const msg = texto.trim();
    if (!msg || loading) return;

    if (!isRetry) {
      setTurns((t) => [...t, { role: "user", text: msg }]);
    }
    setLastMessage(msg);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history,
          conversation_id: conversationId,
        }),
      });
      if (!res.ok) {
        const parsed = await parseError(res);
        setError(parsed);
        return;
      }
      const data: ChatResponse = await res.json();
      setHistory(data.history);
      // Si era el primer turn, el backend nos devuelve un conversation_id
      // recién generado. Lo guardamos para mandarlo en los próximos turns.
      if (data.conversation_id && data.conversation_id !== conversationId) {
        setConversationId(data.conversation_id);
      }
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: data.reply,
          toolCalls: data.tool_calls,
          meta: {
            steps: data.steps,
            elapsed_s: data.elapsed_s,
            tokens: data.usage?.totalTokenCount,
            model: data.model_used ?? data.usage?.model_alias,
          },
        },
      ]);
    } catch (e) {
      // Error de red puro (offline, DNS, etc.)
      setError({
        title: "Sin conexión",
        message: e instanceof Error ? e.message : "No pude alcanzar el servidor.",
        hint: "Chequeá tu internet.",
        retryable: true,
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function reintentar() {
    if (lastMessage) enviar(lastMessage, { isRetry: true });
  }

  function summarizeCarteraReq(req: CarteraRequest): string {
    const parts = [
      `Cartera ${req.perfil} · ${req.exposicion} · ${req.plazo}`,
      `benchmark ${req.benchmark.replace("_", " ")}`,
    ];
    if (req.monto_estimado_ars) {
      parts.push(`ARS ${req.monto_estimado_ars.toLocaleString("es-AR")}`);
    }
    if (req.restricciones && req.restricciones.length > 0) {
      parts.push(`restr: ${req.restricciones.join(", ")}`);
    }
    return parts.join(" · ");
  }

  async function enviarCartera(req: CarteraRequest) {
    if (loading) return;
    setCarteraFormOpen(false);
    setError(null);
    setLoading(true);
    // Insertamos el "user message" sintético + un placeholder assistant
    // mientras se genera. El placeholder se reemplaza al recibir respuesta.
    const userTurn: VisibleTurn = {
      role: "user",
      text: summarizeCarteraReq(req),
      carteraReq: req,
    };
    setTurns((t) => [...t, userTurn]);

    try {
      const res = await fetch("/api/chat/structured/cartera", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) {
        const parsed = await parseError(res);
        setError(parsed);
        return;
      }
      const data = (await res.json()) as {
        data: CarteraData | null;
        usage?: { totalTokenCount?: number; model_alias?: string };
        steps: number;
        elapsed_s: number;
        truncated?: boolean;
        model_used?: string;
        pesos_ok?: boolean;
        pesos_suma?: number;
        error?: string | null;
      };
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: data.data ? "Cartera generada" : (data.error ?? "Sin output"),
          carteraData: data.data,
          carteraMeta: {
            pesos_ok: data.pesos_ok ?? true,
            pesos_suma: data.pesos_suma ?? 0,
            error: data.error,
          },
          meta: {
            steps: data.steps,
            elapsed_s: data.elapsed_s,
            tokens: data.usage?.totalTokenCount,
            model: data.model_used ?? data.usage?.model_alias,
          },
        },
      ]);
    } catch (e) {
      setError({
        title: "Sin conexión",
        message: e instanceof Error ? e.message : "No pude alcanzar el servidor.",
        hint: "Chequeá tu internet.",
        retryable: false,
      });
    } finally {
      setLoading(false);
    }
  }

  function abrirFormCartera(initial?: Partial<CarteraRequest>) {
    setCarteraFormInitial(initial);
    setCarteraFormOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar(input);
    }
  }

  function resetear() {
    // Conversación nueva: vacía el panel pero NO borra las guardadas.
    setTurns([]);
    setHistory([]);
    setConversationId(null);
    setError(null);
    setLastMessage(null);
    setCarteraFormOpen(false);
  }

  function abrirConversacion(id: string) {
    const conv = conversations[id];
    if (!conv) return;
    setTurns(conv.turns);
    setHistory(conv.history);
    setConversationId(conv.id);
    setError(null);
    setCarteraFormOpen(false);
  }

  function eliminarConversacion(id: string) {
    if (!confirm("¿Eliminar esta conversación?")) return;
    setConversations((prev) => {
      const next = { ...prev };
      delete next[id];
      saveConversations(next);
      return next;
    });
    // Si era la activa, vaciamos el panel.
    if (id === conversationId) resetear();
  }

  // Lista de conversaciones ordenadas por última actividad desc para el
  // sidebar. Memoizada implícitamente vía dependencia de `conversations`.
  const convsList = Object.values(conversations).sort(
    (a, b) => b.lastUpdated - a.lastUpdated,
  );

  return (
    <div className="h-full flex bg-[#080808]">
      <ConversationsSidebar
        conversations={convsList}
        activeId={conversationId}
        onSelect={abrirConversacion}
        onNueva={resetear}
        onEliminar={eliminarConversacion}
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
      />
      <div className="flex-1 min-w-0 flex flex-col">
      <div className="border-b border-[#1a1a1a] px-3 py-1.5 flex items-center gap-3 shrink-0">
        <span className="text-[10px] tracking-wide text-[#555555] uppercase">Asistente</span>
        <span className="text-[10px] text-[#ff9900]">Claude · haiku/sonnet auto</span>
        <button
          onClick={resetear}
          className="ml-auto text-[10px] text-[#555555] hover:text-[#ff9900] uppercase tracking-wide"
          disabled={turns.length === 0}
        >
          Nueva conversación
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {turns.length === 0 && (
          <div className="text-[#555555] text-sm">Preguntale a ACAQuant.</div>
        )}

        {turns.map((t, i) => {
          // Buscar la última request de cartera asociada — el botón
          // "modificar parámetros" debe reabrir el form precargado.
          const lastCarteraReq = (() => {
            for (let j = i; j >= 0; j--) {
              if (turns[j]?.carteraReq) return turns[j].carteraReq;
            }
            return undefined;
          })();
          return (
            <div key={i}>
              {t.role === "user" ? (
                <div className="flex justify-end">
                  <div className="max-w-[80%] bg-[#094293]/20 border border-[#094293]/40 px-3 py-2 text-sm text-[#d0d0d0] font-mono whitespace-pre-wrap">
                    {t.text}
                  </div>
                </div>
              ) : t.carteraData !== undefined ? (
                // Turn estructurado de cartera — renderer dedicado.
                <div className="flex">
                  <div className="max-w-[95%] w-full">
                    <CarteraResponse
                      data={t.carteraData}
                      pesos_ok={t.carteraMeta?.pesos_ok ?? true}
                      pesos_suma={t.carteraMeta?.pesos_suma ?? 0}
                      meta={t.meta}
                      error={t.carteraMeta?.error}
                      onModificar={() => abrirFormCartera(lastCarteraReq)}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex">
                  <div className="max-w-[90%] bg-[#0e0e0e] border border-[#1a1a1a] px-3 py-2 text-sm text-[#d0d0d0] font-mono whitespace-pre-wrap">
                    {renderMarkdown(t.text)}
                    {t.toolCalls && t.toolCalls.length > 0 && (
                      <details className="mt-2 text-[10px] text-[#555555]">
                        <summary className="cursor-pointer hover:text-[#ff9900] uppercase tracking-wide">
                          Fuentes ({t.toolCalls.length})
                        </summary>
                        <div className="mt-1 space-y-0.5 font-mono">
                          {t.toolCalls.map((tc, j) => (
                            <div key={j}>
                              {tc.ok ? "✓" : "✗"} {tc.name}({JSON.stringify(tc.args)})
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                    {t.meta && (
                      <div className="mt-1 text-[9px] text-[#555555] tracking-wide uppercase">
                        {t.meta.steps} step{t.meta.steps !== 1 ? "s" : ""} · {t.meta.elapsed_s}s
                        {t.meta.tokens ? ` · ${t.meta.tokens} tok` : ""}
                        {t.meta.model ? ` · ${t.meta.model}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Form de cartera abierto inline (vive entre los turns) */}
        {carteraFormOpen && (
          <div className="flex">
            <div className="max-w-[95%] w-full">
              <CarteraForm
                initial={carteraFormInitial}
                onSubmit={enviarCartera}
                onCancel={() => setCarteraFormOpen(false)}
                loading={loading}
              />
            </div>
          </div>
        )}

        {loading && (
          <div className="flex">
            <div className="bg-[#0e0e0e] border border-[#1a1a1a] px-3 py-2 text-sm text-[#555555] font-mono">
              pensando…
            </div>
          </div>
        )}

        {error && (
          <div className="flex border border-[#ff9900]/50 bg-[#ff9900]/5 px-3 py-2.5 font-mono">
            <div className="text-[#ff9900] text-lg leading-none mt-0.5 mr-3">!</div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-[#ff9900] uppercase tracking-wide">
                {error.title}
              </div>
              <div className="text-[11px] text-[#d0d0d0] mt-1 leading-relaxed">
                {error.message}
              </div>
              {error.hint && (
                <div className="text-[10px] text-[#888888] mt-1 italic leading-relaxed">
                  {error.hint}
                </div>
              )}
              {error.retryable && lastMessage && (
                <button
                  onClick={reintentar}
                  disabled={loading}
                  className="mt-2 text-[10px] px-2.5 py-1 border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black uppercase tracking-wide disabled:opacity-40"
                >
                  Reintentar
                </button>
              )}
            </div>
            <button
              onClick={() => setError(null)}
              className="text-[#555555] hover:text-[#d0d0d0] text-sm leading-none ml-2"
              title="Cerrar"
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-[#1a1a1a] px-3 py-2 shrink-0">
        {/* Chips de acciones rápidas. Por ahora solo "Recomendar cartera"
            está habilitado; los otros van como placeholders disabled para
            mostrar la dirección. */}
        <div className="flex items-center gap-1 mb-1.5">
          <button
            onClick={() => abrirFormCartera()}
            disabled={loading || carteraFormOpen}
            className="text-[10px] px-2 py-0.5 border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Recomendar cartera
          </button>
          <button
            disabled
            title="Próximamente"
            className="text-[10px] px-2 py-0.5 border border-[#2a2a2a] text-[#555555] uppercase tracking-wide cursor-not-allowed"
          >
            + Análisis bono
          </button>
          <button
            disabled
            title="Próximamente"
            className="text-[10px] px-2 py-0.5 border border-[#2a2a2a] text-[#555555] uppercase tracking-wide cursor-not-allowed"
          >
            + Comparar curvas
          </button>
        </div>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escribí tu consulta…  (Enter para enviar, Shift+Enter para salto de línea)"
          rows={2}
          className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[12px] px-2 py-1.5 font-mono focus:border-[#ff9900] outline-none resize-none"
          disabled={loading}
        />
        <div className="flex items-center mt-1">
          <span className="text-[9px] text-[#555555] tracking-wide uppercase">
            Solo-lectura · las respuestas salen de tu propia API · logs en Manager.AsistenteLogs
          </span>
          <button
            onClick={() => enviar(input)}
            disabled={loading || !input.trim()}
            className="ml-auto text-[10px] px-3 py-1 bg-[#094293] text-white hover:bg-[#0a52b5] disabled:bg-[#1a1a1a] disabled:text-[#555555] uppercase tracking-wide"
          >
            Enviar
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}


function ConversationsSidebar({
  conversations, activeId, onSelect, onNueva, onEliminar, open, onToggle,
}: {
  conversations: PersistedConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNueva: () => void;
  onEliminar: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  // Versión colapsada: barra delgada con toggle + nueva + conteo.
  if (!open) {
    return (
      <aside className="w-8 shrink-0 border-r border-[#1a1a1a] flex flex-col items-center bg-[#0a0a0a] py-2 gap-1">
        <button
          onClick={onToggle}
          title="Expandir conversaciones"
          className="w-6 h-6 flex items-center justify-center text-[#888] hover:text-[#ff9900]"
        >
          ▶
        </button>
        <button
          onClick={onNueva}
          title="Nueva conversación"
          className="w-6 h-6 flex items-center justify-center text-[14px] font-bold bg-[#ff9900] text-black hover:bg-[#ffaa22]"
        >
          +
        </button>
        {conversations.length > 0 && (
          <div className="text-[9px] text-[#666] mt-1">{conversations.length}</div>
        )}
      </aside>
    );
  }

  return (
    <aside className="w-64 shrink-0 border-r border-[#1a1a1a] flex flex-col bg-[#0a0a0a]">
      <div className="px-3 py-2 border-b border-[#1a1a1a] flex items-center gap-2">
        <button
          onClick={onNueva}
          className="flex-1 px-3 py-1.5 text-[11px] font-semibold tracking-wide bg-[#ff9900] text-black hover:bg-[#ffaa22]"
        >
          + NUEVA CONVERSACIÓN
        </button>
        <button
          onClick={onToggle}
          title="Colapsar"
          className="w-6 h-6 flex items-center justify-center text-[#888] hover:text-[#ff9900] border border-[#2a2a2a]"
        >
          ◀
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {conversations.length === 0 && (
          <div className="px-3 py-4 text-[11px] text-[#555]">
            Sin conversaciones guardadas.
          </div>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={`group flex items-center px-3 py-2 border-b border-[#1a1a1a] cursor-pointer ${
              activeId === c.id ? "bg-[#1a1a1a]" : "hover:bg-[#121212]"
            }`}
            onClick={() => onSelect(c.id)}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-[#ddd] truncate">
                {previewConv(c)}
              </div>
              <div className="text-[10px] text-[#666]">
                {c.turns.length} turn{c.turns.length === 1 ? "" : "s"} ·{" "}
                {new Date(c.lastUpdated).toLocaleDateString("es-AR")}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onEliminar(c.id); }}
              className="opacity-0 group-hover:opacity-100 px-1.5 text-[12px] text-[#888] hover:text-[#ff6666]"
              title="Eliminar"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
