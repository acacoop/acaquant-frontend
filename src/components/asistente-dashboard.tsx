"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  periodo_horas: number;
  conversaciones_total: number;
  conversaciones_ok: number;
  conversaciones_error: number;
  conversaciones_truncated: number;
  pct_error: number;
  pct_truncated: number;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  latencia_avg_s: number;
  latencia_p95_s: number;
  costo_estimado_usd: number;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
}

interface LogEntry {
  ts: string;
  user?: string;
  conversation_id?: string;
  message: string;
  reply?: string;
  tool_calls?: ToolCall[];
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  steps?: number;
  elapsed_s?: number;
  truncated?: boolean;
  estado?: "ok" | "error" | "truncated";
  error?: { code?: string; message?: string };
}

interface Conversation {
  conversation_id: string;
  user: string;
  first_ts: string;
  last_ts: string;
  turns: number;
  tokens: number;
  errors: number;
  preview: string;
}

interface TimeseriesPoint {
  bucket: string;
  count: number;
  tokens: number;
  errors: number;
}

interface ToolRank {
  tool: string;
  calls: number;
  ok: number;
  fail: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n: number | undefined, d = 0): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtK(n: number | undefined): string {
  if (n === undefined || n === null) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1) + "K";
  return (n / 1_000_000).toFixed(2) + "M";
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDateShort(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
  });
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

const ESTADO_COLOR: Record<string, string> = {
  ok: "#00cc66",
  error: "#ff3333",
  truncated: "#ff9900",
};

// ── Subcomponentes ────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "ok" | "warn" | "err";
}) {
  const color =
    accent === "ok" ? "#00cc66" : accent === "warn" ? "#ff9900" : accent === "err" ? "#ff3333" : "#d0d0d0";
  return (
    <div className="border border-[#1a1a1a] bg-[#0e0e0e] px-3 py-2 font-mono">
      <div className="text-[9px] text-[#555555] uppercase tracking-wide">{label}</div>
      <div className="text-[18px] font-semibold mt-0.5 leading-none" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[9px] text-[#888888] mt-1">{sub}</div>}
    </div>
  );
}

function ToolsRanking({ data }: { data: ToolRank[] }) {
  if (!data.length) {
    return <div className="text-[11px] text-[#555555] p-3">Sin tool calls en el período.</div>;
  }
  const max = Math.max(...data.map((d) => d.calls));
  return (
    <div className="p-2 space-y-1.5">
      {data.map((t) => {
        const pct = (t.calls / max) * 100;
        const failPct = t.calls > 0 ? (t.fail / t.calls) * 100 : 0;
        return (
          <div key={t.tool} className="font-mono">
            <div className="flex items-center justify-between text-[10px] mb-0.5">
              <span className="text-[#d0d0d0] truncate pr-2">{t.tool}</span>
              <span className="text-[#888888]">
                {t.calls}
                {t.fail > 0 && <span className="text-[#ff3333]"> / {t.fail} ✗</span>}
              </span>
            </div>
            <div className="h-1.5 bg-[#1a1a1a] relative">
              <div
                className="h-full"
                style={{
                  width: `${pct}%`,
                  background: failPct > 20 ? "#ff3333" : "#ff9900",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExpandedRow({ log }: { log: LogEntry }) {
  return (
    <div className="bg-[#050505] border-t border-[#1a1a1a] p-3 text-[11px] font-mono space-y-2">
      <div>
        <div className="text-[9px] text-[#555555] uppercase tracking-wide">Pregunta completa</div>
        <div className="text-[#d0d0d0] mt-0.5 whitespace-pre-wrap">{log.message}</div>
      </div>
      {log.reply && (
        <div>
          <div className="text-[9px] text-[#555555] uppercase tracking-wide">Respuesta</div>
          <div className="text-[#d0d0d0] mt-0.5 whitespace-pre-wrap">{log.reply}</div>
        </div>
      )}
      {log.error && (
        <div>
          <div className="text-[9px] text-[#ff3333] uppercase tracking-wide">Error</div>
          <div className="text-[#ff3333] mt-0.5">
            [{log.error.code ?? "?"}] {log.error.message}
          </div>
        </div>
      )}
      {log.tool_calls && log.tool_calls.length > 0 && (
        <div>
          <div className="text-[9px] text-[#555555] uppercase tracking-wide">
            Tool calls ({log.tool_calls.length})
          </div>
          <div className="mt-0.5 space-y-0.5">
            {log.tool_calls.map((tc, i) => (
              <div key={i} className="text-[#a0a0a0]">
                <span className={tc.ok ? "text-[#00cc66]" : "text-[#ff3333]"}>{tc.ok ? "✓" : "✗"}</span>{" "}
                <span className="text-[#ff9900]">{tc.name}</span>
                <span className="text-[#555555]">
                  ({JSON.stringify(tc.args)})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-4 text-[9px] text-[#555555] pt-1 border-t border-[#1a1a1a]">
        <span>Steps: {log.steps ?? "—"}</span>
        <span>Elapsed: {log.elapsed_s ?? "—"}s</span>
        <span>Usuario: {log.user ?? "—"}</span>
        <span>Tokens in: {log.usage?.promptTokenCount ?? "—"}</span>
        <span>Tokens out: {log.usage?.candidatesTokenCount ?? "—"}</span>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

const HORAS_OPTS = [
  { h: 1, label: "1h" },
  { h: 6, label: "6h" },
  { h: 24, label: "24h" },
  { h: 168, label: "7d" },
  { h: 720, label: "30d" },
];

const ESTADO_OPTS = [
  { v: "all", label: "Todos" },
  { v: "ok", label: "OK" },
  { v: "error", label: "Con errores" },
];

export function AsistenteDashboard() {
  const [horas, setHoras] = useState<number>(24);
  const [estadoFiltro, setEstadoFiltro] = useState<string>("all");
  const [stats, setStats] = useState<Stats | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [series, setSeries] = useState<TimeseriesPoint[]>([]);
  const [tools, setTools] = useState<ToolRank[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  // Cache de detalles cargados por conversation_id (lazy on expand).
  const [convDetails, setConvDetails] = useState<Record<string, LogEntry[]>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, convRes, seriesRes, toolsRes] = await Promise.all([
        fetch(`/api/manager/asistente/stats?horas=${horas}`, { cache: "no-store" }),
        fetch(
          `/api/manager/asistente/conversations?limit=100&horas=${horas}`,
          { cache: "no-store" },
        ),
        fetch(`/api/manager/asistente/timeseries?horas=${horas}`, { cache: "no-store" }),
        fetch(`/api/manager/asistente/tools-ranking?horas=${horas}`, { cache: "no-store" }),
      ]);
      if (!statsRes.ok || !convRes.ok || !seriesRes.ok || !toolsRes.ok) {
        throw new Error("Alguna API respondió con error");
      }
      setStats(await statsRes.json());
      const convs: Conversation[] = await convRes.json();
      // Filtrar client-side por estado: una conversación tiene "errors" si
      // tuvo al menos un turn con error. El selector "ok" la excluye, "error"
      // la incluye solo a ella.
      const filtered = convs.filter((c) => {
        if (estadoFiltro === "ok") return c.errors === 0;
        if (estadoFiltro === "error") return c.errors > 0;
        return true;
      });
      setConversations(filtered);
      setSeries(await seriesRes.json());
      setTools(await toolsRes.json());
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [horas, estadoFiltro]);

  const expandConversation = useCallback(async (convId: string) => {
    if (expanded === convId) {
      setExpanded(null);
      return;
    }
    setExpanded(convId);
    if (!convDetails[convId]) {
      try {
        const res = await fetch(
          `/api/manager/asistente/conversations/${encodeURIComponent(convId)}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const turns: LogEntry[] = await res.json();
          setConvDetails((prev) => ({ ...prev, [convId]: turns }));
        }
      } catch {
        // Silencioso: el panel del detalle queda vacío y el usuario puede colapsar/reintentar.
      }
    }
  }, [expanded, convDetails]);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, 10000);
    return () => clearInterval(iv);
  }, [fetchAll]);

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Filtros + última actualización */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
        <span className="text-[10px] text-[#555555] uppercase tracking-wide">Período</span>
        <div className="flex gap-1">
          {HORAS_OPTS.map((o) => (
            <button
              key={o.h}
              onClick={() => setHoras(o.h)}
              className={`px-2 py-0.5 text-[10px] font-mono border ${
                horas === o.h
                  ? "bg-[#ff9900] text-black border-[#ff9900]"
                  : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <span className="ml-3 text-[10px] text-[#555555] uppercase tracking-wide">Filtro</span>
        <div className="flex gap-1">
          {ESTADO_OPTS.map((o) => (
            <button
              key={o.v}
              onClick={() => setEstadoFiltro(o.v)}
              className={`px-2 py-0.5 text-[10px] font-mono border ${
                estadoFiltro === o.v
                  ? "bg-[#ff9900] text-black border-[#ff9900]"
                  : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-[10px] text-[#555555]">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: loading ? "#ff9900" : "#00cc66" }}
          />
          <span>
            {loading
              ? "cargando…"
              : lastUpdate
              ? `actualizado ${lastUpdate.toLocaleTimeString("es-AR")}`
              : "—"}
          </span>
          <span className="text-[#2a2a2a]">|</span>
          <span>auto-refresh 10s</span>
        </div>
      </div>

      {error && (
        <div className="px-3 py-1.5 text-[10px] text-[#ff3333] bg-[#ff3333]/10 border-b border-[#ff3333]/40 font-mono">
          Error: {error}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {/* Cards de métricas */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <MetricCard
            label="Conversaciones"
            value={fmtNum(stats?.conversaciones_total)}
            sub={`${stats?.conversaciones_ok ?? 0} OK · ${stats?.conversaciones_error ?? 0} err`}
          />
          <MetricCard
            label="Tasa de éxito"
            value={
              stats && stats.conversaciones_total
                ? `${(100 - stats.pct_error - stats.pct_truncated).toFixed(1)}%`
                : "—"
            }
            accent={
              stats && stats.pct_error > 10 ? "err" : stats && stats.pct_error > 3 ? "warn" : "ok"
            }
            sub={`${stats?.pct_truncated ?? 0}% truncated`}
          />
          <MetricCard
            label="Tokens totales"
            value={fmtK(stats?.tokens_total)}
            sub={`in ${fmtK(stats?.tokens_input)} · out ${fmtK(stats?.tokens_output)}`}
          />
          <MetricCard
            label="Latencia avg"
            value={stats ? `${stats.latencia_avg_s}s` : "—"}
            accent={stats && stats.latencia_avg_s > 15 ? "warn" : undefined}
          />
          <MetricCard
            label="Latencia p95"
            value={stats ? `${stats.latencia_p95_s}s` : "—"}
            accent={stats && stats.latencia_p95_s > 30 ? "err" : undefined}
          />
          <MetricCard
            label="Costo estimado"
            value={stats ? `USD ${stats.costo_estimado_usd.toFixed(4)}` : "—"}
            sub="(si se activa billing)"
          />
        </div>

        {/* Charts + Tools Ranking */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          <div className="border border-[#1a1a1a] bg-[#080808] p-2 lg:col-span-1">
            <div className="text-[10px] text-[#555555] uppercase tracking-wide mb-1">
              Conversaciones por hora
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#1a1a1a" strokeDasharray="1 3" />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={fmtTime}
                    tick={{ fontSize: 9, fill: "#555555" }}
                    axisLine={{ stroke: "#2a2a2a" }}
                  />
                  <YAxis tick={{ fontSize: 9, fill: "#555555" }} axisLine={{ stroke: "#2a2a2a" }} />
                  <Tooltip
                    contentStyle={{
                      background: "#0e0e0e",
                      border: "1px solid #2a2a2a",
                      fontSize: 10,
                    }}
                    labelFormatter={(v) => `${fmtDateShort(v as string)} ${fmtTime(v as string)}`}
                  />
                  <Bar dataKey="count" name="Conv.">
                    {series.map((p, i) => (
                      <Cell
                        key={i}
                        fill={p.errors > 0 ? "#ff9900" : "#ff9900cc"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-[#1a1a1a] bg-[#080808] p-2 lg:col-span-1">
            <div className="text-[10px] text-[#555555] uppercase tracking-wide mb-1">
              Tokens por hora
            </div>
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#1a1a1a" strokeDasharray="1 3" />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={fmtTime}
                    tick={{ fontSize: 9, fill: "#555555" }}
                    axisLine={{ stroke: "#2a2a2a" }}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "#555555" }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickFormatter={fmtK}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#0e0e0e",
                      border: "1px solid #2a2a2a",
                      fontSize: 10,
                    }}
                    labelFormatter={(v) => `${fmtDateShort(v as string)} ${fmtTime(v as string)}`}
                    formatter={(v) => fmtK(Number(v))}
                  />
                  <Line
                    type="monotone"
                    dataKey="tokens"
                    stroke="#4a9eff"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-[#1a1a1a] bg-[#080808] p-2 lg:col-span-1 overflow-hidden flex flex-col">
            <div className="text-[10px] text-[#555555] uppercase tracking-wide mb-1">
              Tools usadas
            </div>
            <div className="flex-1 overflow-y-auto">
              <ToolsRanking data={tools} />
            </div>
          </div>
        </div>

        {/* Tabla de conversaciones (agrupadas por conversation_id) */}
        <div className="border border-[#1a1a1a] bg-[#080808]">
          <div className="px-3 py-1.5 border-b border-[#1a1a1a] flex items-center">
            <span className="text-[10px] text-[#555555] uppercase tracking-wide">
              Conversaciones ({conversations.length})
            </span>
          </div>
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="text-[#555555] border-b border-[#1a1a1a]">
                <th className="px-2 py-1 text-left w-[90px]">Inicio</th>
                <th className="px-2 py-1 text-left w-[140px]">Usuario</th>
                <th className="px-2 py-1 text-left">Primer mensaje</th>
                <th className="px-2 py-1 text-right w-[50px]">Turns</th>
                <th className="px-2 py-1 text-right w-[60px]">Tokens</th>
                <th className="px-2 py-1 text-left w-[80px]">Estado</th>
              </tr>
            </thead>
            <tbody>
              {conversations.map((c) => {
                const isExp = expanded === c.conversation_id;
                const hasErrors = c.errors > 0;
                const estado = hasErrors ? "error" : "ok";
                const estadoColor = ESTADO_COLOR[estado] ?? "#555555";
                const turns = convDetails[c.conversation_id];
                return (
                  <Fragment key={c.conversation_id}>
                    <tr
                      onClick={() => expandConversation(c.conversation_id)}
                      className={`border-b border-[#1a1a1a] cursor-pointer hover:bg-[#0e0e0e] ${
                        isExp ? "bg-[#0e0e0e]" : ""
                      }`}
                    >
                      <td className="px-2 py-1 text-[#888888] whitespace-nowrap">{fmtTime(c.first_ts)}</td>
                      <td
                        className="px-2 py-1 text-[#888888] truncate max-w-[180px]"
                        title={c.user || undefined}
                      >
                        {c.user && c.user !== "anon" ? c.user : "—"}
                      </td>
                      <td className="px-2 py-1 text-[#d0d0d0] truncate max-w-0">
                        {truncate(c.preview, 100)}
                      </td>
                      <td className="px-2 py-1 text-right text-[#888888]">{c.turns}</td>
                      <td className="px-2 py-1 text-right text-[#888888]">
                        {fmtK(c.tokens)}
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5"
                          style={{
                            color: estadoColor,
                            border: `1px solid ${estadoColor}40`,
                            backgroundColor: `${estadoColor}12`,
                          }}
                        >
                          {hasErrors ? `${c.errors} ERR` : "OK"}
                        </span>
                      </td>
                    </tr>
                    {isExp && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          {turns === undefined ? (
                            <div className="bg-[#050505] border-t border-[#1a1a1a] p-3 text-[10px] text-[#555555] font-mono">
                              cargando turns…
                            </div>
                          ) : turns.length === 0 ? (
                            <div className="bg-[#050505] border-t border-[#1a1a1a] p-3 text-[10px] text-[#555555] font-mono">
                              (sin turns)
                            </div>
                          ) : (
                            <div className="bg-[#050505] border-t border-[#1a1a1a]">
                              {turns.map((t, i) => (
                                <div key={i} className="border-b border-[#1a1a1a] last:border-b-0">
                                  <div className="px-3 py-1 text-[9px] text-[#555555] uppercase tracking-wide bg-[#0a0a0a]">
                                    Turn {i + 1} · {fmtTime(t.ts)}
                                  </div>
                                  <ExpandedRow log={t} />
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {conversations.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-[#555555]">
                    Sin conversaciones en el período seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
