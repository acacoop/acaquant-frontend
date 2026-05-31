"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Lista de services a mostrar en el dropdown. Mismo orden que el backend.
const SERVICES = [
  { id: "motor_rofex",         label: "motor_rofex"         },
  { id: "motor_options",       label: "motor_options"       },
  { id: "motor_curvas",        label: "motor_curvas"        },
  { id: "motor_forwards",      label: "motor_forwards"      },
  { id: "motor_breakevens",    label: "motor_breakevens"    },
  { id: "motor_caucion",       label: "motor_caucion"       },
  { id: "motor_futuros_dlr",   label: "motor_futuros_dlr"   },
  { id: "motor_dolares",       label: "motor_dolares"       },
  { id: "motor_agro",          label: "motor_agro"          },
  { id: "motor_order_book_l2", label: "motor_order_book_l2" },
  { id: "motor_ordenes",       label: "motor_ordenes"       },
  { id: "api",                 label: "api"                 },
  { id: "cloudflared",         label: "cloudflared"         },
];

const PRIORITY_COLOR: Record<string, string> = {
  emerg:  "var(--t-neg)",
  alert:  "var(--t-neg)",
  crit:   "var(--t-neg)",
  error:  "var(--t-neg)",
  warn:   "#ff9900",
  notice: "var(--t-pos)",
  info:   "#999999",
  debug:  "#555555",
};

const REFRESH_MS = 3000;
const DEFAULT_LINES = 20;
const LINE_OPTIONS = [20, 50, 100, 200];

interface LogEntry {
  ts_epoch: number;
  priority: string;
  message: string;
}

interface LogsResponse {
  servicio: string;
  lines: number;
  logs: LogEntry[];
}

function fmtTime(tsEpoch: number): string {
  if (!tsEpoch) return "—";
  const d = new Date(tsEpoch * 1000);
  return d.toLocaleTimeString("es-AR", { hour12: false }) +
         "." + String(d.getMilliseconds()).padStart(3, "0");
}

export function LogsPanel() {
  const [servicio, setServicio] = useState<string>("motor_rofex");
  const [lines, setLines] = useState<number>(DEFAULT_LINES);
  const [filter, setFilter] = useState<"all" | "error" | "warn">("all");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const wasAtBottomRef = useRef<boolean>(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/manager/logs?servicio=${encodeURIComponent(servicio)}&lines=${lines}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `HTTP ${r.status}`);
      }
      const data: LogsResponse = await r.json();
      setLogs(data.logs || []);
      setLastCheck(new Date().toLocaleTimeString("es-AR"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [servicio, lines]);

  // Captura si el usuario está al final ANTES del siguiente refresh, para
  // re-anclarlo al final si sí lo estaba (si está mirando más arriba, no pisa).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      wasAtBottomRef.current =
        el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh, autoRefresh]);

  // Re-anclar al final si el user estaba ahí
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !wasAtBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [logs]);

  const visible = logs.filter((l) => {
    if (filter === "all") return true;
    if (filter === "error") return ["emerg", "alert", "crit", "error"].includes(l.priority);
    if (filter === "warn") return ["warn", "notice", "emerg", "alert", "crit", "error"].includes(l.priority);
    return true;
  });

  return (
    <div className="h-full flex flex-col min-h-0 bg-[var(--t-panel)]">
      {/* Controles */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-surface-2)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">LOGS</span>

        <select
          value={servicio}
          onChange={(e) => setServicio(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[#e0e0e0] text-[11px] font-mono px-2 py-1 focus:outline-none focus:border-[var(--t-accent)]"
        >
          {SERVICES.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        <select
          value={lines}
          onChange={(e) => setLines(parseInt(e.target.value, 10))}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[#e0e0e0] text-[11px] font-mono px-2 py-1 focus:outline-none focus:border-[var(--t-accent)]"
        >
          {LINE_OPTIONS.map((n) => (
            <option key={n} value={n}>{n} líneas</option>
          ))}
        </select>

        <div className="flex items-center gap-1 ml-1">
          {(["all", "warn", "error"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-1 text-[10px] font-semibold tracking-wide border ${
                filter === f
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>

        <button
          onClick={() => setAutoRefresh((v) => !v)}
          className={`px-2 py-1 text-[10px] font-semibold tracking-wide border ml-1 ${
            autoRefresh
              ? "bg-[#00cc66]/20 text-[var(--t-pos)] border-[#00cc66]/40"
              : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)]"
          }`}
          title="Auto-refresh cada 3 s"
        >
          {autoRefresh ? "LIVE" : "PAUSED"}
        </button>

        <button
          onClick={refresh}
          disabled={loading}
          className="px-2 py-1 text-[10px] font-semibold tracking-wide border border-[var(--t-border-2)] text-[#999999] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] disabled:opacity-50"
        >
          REFRESH
        </button>

        <div className="ml-auto flex items-center gap-3 text-[10px] text-[var(--t-text-muted)] font-mono">
          {lastCheck && <span>últ. {lastCheck}</span>}
          <span>{visible.length} / {logs.length}</span>
        </div>
      </div>

      {/* Errores */}
      {error && (
        <div className="px-3 py-2 text-[11px] text-[var(--t-neg)] bg-[#ff3333]/10 border-b border-[#ff3333]/30 font-mono">
          {error}
        </div>
      )}

      {/* Stream */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-[11px] leading-5 p-3">
        {visible.length === 0 && !loading && !error && (
          <div className="text-[var(--t-text-muted)] text-center pt-6">Sin logs para mostrar</div>
        )}
        {visible.map((l, i) => {
          const color = PRIORITY_COLOR[l.priority] ?? "#999999";
          return (
            <div key={i} className="flex gap-2 hover:bg-[#ffffff04] px-1 -mx-1">
              <span className="text-[var(--t-text-muted)] shrink-0 w-24">{fmtTime(l.ts_epoch)}</span>
              <span
                className="shrink-0 w-12 uppercase font-semibold"
                style={{ color }}
              >
                {l.priority}
              </span>
              <span className="text-[var(--t-text)] whitespace-pre-wrap break-all">
                {l.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
