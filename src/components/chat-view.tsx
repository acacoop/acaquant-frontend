"use client";

import { useEffect, useRef, useState } from "react";

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
}

interface VisibleTurn {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCall[];
  meta?: { steps: number; elapsed_s: number; tokens?: number; model?: string };
}

const SUGERENCIAS = [
  "cómo está cotizando TX26?",
  "breakevens actuales",
  "forwards de la curva tasa fija",
  "cuándo paga cupón AL30?",
];

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
  const [turns, setTurns] = useState<VisibleTurn[]>([]);
  const [history, setHistory] = useState<GeminiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
        body: JSON.stringify({ message: msg, history }),
      });
      if (!res.ok) {
        const parsed = await parseError(res);
        setError(parsed);
        return;
      }
      const data: ChatResponse = await res.json();
      setHistory(data.history);
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

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar(input);
    }
  }

  function resetear() {
    setTurns([]);
    setHistory([]);
    setError(null);
  }

  return (
    <div className="h-full flex flex-col bg-[#080808]">
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
          <div className="text-[#555555] text-sm">
            <div className="mb-3">Hacé una pregunta sobre carteras, flujos, cotizaciones o breakevens.</div>
            <div className="flex flex-wrap gap-1.5">
              {SUGERENCIAS.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="text-[11px] px-2 py-1 border border-[#1a1a1a] bg-[#0e0e0e] hover:border-[#ff9900] hover:text-[#ff9900] font-mono"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i}>
            {t.role === "user" ? (
              <div className="flex justify-end">
                <div className="max-w-[80%] bg-[#094293]/20 border border-[#094293]/40 px-3 py-2 text-sm text-[#d0d0d0] font-mono whitespace-pre-wrap">
                  {t.text}
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
        ))}

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
  );
}
