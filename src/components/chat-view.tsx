"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Tipos que refleja el backend (api/routers/chat.py).
 * El history se guarda en formato Gemini (role + parts) y se envía de vuelta
 * en cada turno para mantener contexto.
 */
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
  role: "user" | "model";
  parts: GeminiPart[];
}

interface ChatResponse {
  reply: string;
  tool_calls: ToolCall[];
  history: GeminiMessage[];
  usage: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  steps: number;
  elapsed_s: number;
  truncated?: boolean;
}

interface VisibleTurn {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCall[];
  meta?: { steps: number; elapsed_s: number; tokens?: number };
}

const SUGERENCIAS = [
  "qué contrapartes son fondos?",
  "cómo están los breakevens?",
  "cotización actual de TX26",
  "listame las ALYCs con las que operamos",
];

export function ChatView() {
  const [turns, setTurns] = useState<VisibleTurn[]>([]);
  const [history, setHistory] = useState<GeminiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  async function enviar(texto: string) {
    const msg = texto.trim();
    if (!msg || loading) return;

    setTurns((t) => [...t, { role: "user", text: msg }]);
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
        const err = await res.text();
        throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
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
          },
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
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
        <span className="text-[10px] text-[#ff9900]">Gemini 2.5 Flash</span>
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
                  {t.text}
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
          <div className="text-[11px] text-[#ff3333] font-mono border border-[#ff3333]/40 bg-[#ff3333]/10 px-3 py-2">
            Error: {error}
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
