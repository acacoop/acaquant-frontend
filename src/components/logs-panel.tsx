"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * OBSERVABILIDAD → DIAGNÓSTICO → LOGS — tabla HORARIO | SERVICIO | NIVEL | MENSAJE.
 *
 * Por defecto muestra TODOS los servicios mezclados cronológicamente (el
 * backend hace un solo journalctl multi-unit); el dropdown filtra por uno.
 * La lista de servicios viene de /logs/services (derivada del registro del
 * Diagnóstico → no se desfasa al agregar un motor).
 */

const TODOS = "__todos__";

// Fallback si el backend no responde. La lista REAL se trae de /logs/services.
const SERVICES_FALLBACK: string[] = [
  "motor_rofex", "motor_options", "motor_curvas", "motor_forwards", "motor_breakevens",
  "motor_caucion", "motor_futuros_dlr", "motor_dolares", "motor_agro", "motor_agro_opciones",
  "motor_cedears", "motor_portfolio_snapshot", "motor_ordenes", "api", "partner_api", "cloudflared",
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

// Color estable por servicio (hash simple sobre una paleta fija) para que el
// ojo distinga los motores en la vista mezclada.
const SERVICE_PALETTE = [
  "#4a9eff", "#00cc66", "#ff9900", "#bb66ff", "#00cccc",
  "#ffee44", "#ff66aa", "#aaff00", "#ff6600", "#66aaff",
];
function serviceColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return SERVICE_PALETTE[h % SERVICE_PALETTE.length];
}

const REFRESH_MS = 3000;
const LINE_OPTIONS = [50, 100, 200, 500];

interface LogEntry {
  ts_epoch: number;
  priority: string;
  servicio?: string;
  message: string;
}

function fmtTime(tsEpoch: number): string {
  if (!tsEpoch) return "—";
  const d = new Date(tsEpoch * 1000);
  return d.toLocaleTimeString("es-AR", { hour12: false }) +
         "." + String(d.getMilliseconds()).padStart(3, "0");
}

export function LogsPanel() {
  const [servicio, setServicio] = useState<string>(TODOS);
  const [services, setServices] = useState<string[]>(SERVICES_FALLBACK);
  const [lines, setLines] = useState<number>(100);
  const [filter, setFilter] = useState<"all" | "error" | "warn">("all");
  const [busca, setBusca] = useState("");
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
      const data: { logs: LogEntry[] } = await r.json();
      setLogs(data.logs || []);
      setLastCheck(new Date().toLocaleTimeString("es-AR"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [servicio, lines]);

  // Lista de servicios desde el backend (no se desfasa al agregar un motor).
  useEffect(() => {
    fetch("/api/manager/logs/services", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: string[] | null) => { if (Array.isArray(s) && s.length) setServices(s); })
      .catch(() => {});
  }, []);

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
    // fetch inicial: refresh() solo setea estado tras el await (falso positivo
    // del linter, mismo patrón que el resto de las vistas).
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const q = busca.trim().toLowerCase();
  const visible = logs.filter((l) => {
    if (filter === "error" && !["emerg", "alert", "crit", "error"].includes(l.priority)) return false;
    if (filter === "warn" && !["warn", "notice", "emerg", "alert", "crit", "error"].includes(l.priority)) return false;
    if (q && !l.message.toLowerCase().includes(q) && !(l.servicio ?? "").toLowerCase().includes(q)) return false;
    return true;
  });

  const esTodos = servicio === TODOS;

  return (
    <div className="h-full flex flex-col min-h-0 bg-[var(--t-panel)]">
      {/* Controles */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-surface-2)] shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">LOGS</span>

        <select
          value={servicio}
          onChange={(e) => setServicio(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] font-mono px-2 py-1 focus:outline-none focus:border-[var(--t-accent)]"
        >
          <option value={TODOS}>TODOS</option>
          {services.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={lines}
          onChange={(e) => setLines(parseInt(e.target.value, 10))}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] font-mono px-2 py-1 focus:outline-none focus:border-[var(--t-accent)]"
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

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="buscar en mensajes…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] font-mono px-2 py-1 focus:outline-none focus:border-[var(--t-accent)] w-[180px]"
        />

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

      {/* Tabla */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {visible.length === 0 && !loading && !error ? (
          <div className="text-[var(--t-text-muted)] text-center text-[11px] pt-6">Sin logs para mostrar</div>
        ) : (
          <table className="w-full text-[11px] font-mono leading-5">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              <tr className="border-b border-[var(--t-border)]">
                <th className="!px-3 !py-1 text-left w-[105px]">Horario</th>
                {esTodos && <th className="!px-2 !py-1 text-left w-[170px]">Servicio</th>}
                <th className="!px-2 !py-1 text-left w-[55px]">Nivel</th>
                <th className="!px-2 !py-1 text-left">Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l, i) => {
                const pcolor = PRIORITY_COLOR[l.priority] ?? "#999999";
                return (
                  <tr key={i} className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5 align-top">
                    <td className="!px-3 !py-0.5 text-[var(--t-text-muted)] whitespace-nowrap">{fmtTime(l.ts_epoch)}</td>
                    {esTodos && (
                      <td className="!px-2 !py-0.5 whitespace-nowrap font-semibold" style={{ color: serviceColor(l.servicio ?? "") }}>
                        {l.servicio ?? "—"}
                      </td>
                    )}
                    <td className="!px-2 !py-0.5 uppercase font-semibold" style={{ color: pcolor }}>
                      {l.priority}
                    </td>
                    <td className="!px-2 !py-0.5 text-[var(--t-text)] whitespace-pre-wrap break-all">{l.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
