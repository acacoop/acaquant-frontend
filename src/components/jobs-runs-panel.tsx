"use client";

import { useEffect, useMemo, useState } from "react";

interface JobRun {
  tipo: string;
  started_at: string;
  finished_at: string;
  elapsed_s: number;
  status: "ok" | "partial" | "error";
  stats: Record<string, unknown>;
  errors: string[];
  log: string[];
}

interface JobStat {
  tipo: string;
  total: number;
  ok: number;
  partial: number;
  error: number;
  last_run: string | null;
  last_status: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  ok:      "#00cc66",
  partial: "#ff9900",
  error:   "#ff3333",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLOR[status] ?? "#555555";
  return (
    <span
      className="text-[10px] font-semibold px-1.5 py-0.5 font-mono"
      style={{ color, border: `1px solid ${color}40`, backgroundColor: `${color}12` }}
    >
      {status.toUpperCase()}
    </span>
  );
}

function fmtDuration(s: number): string {
  if (s < 1) return `${(s * 1000).toFixed(0)}ms`;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
}

export function JobsRunsPanel() {
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [stats, setStats] = useState<JobStat[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroStatus, setFiltroStatus] = useState<string>("");
  const [selected, setSelected] = useState<JobRun | null>(null);

  const fetchData = () => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (filtroTipo) qs.set("tipo", filtroTipo);
    if (filtroStatus) qs.set("status", filtroStatus);
    qs.set("limit", "100");

    // Chequear r.ok: un 500 devuelve HTML y r.json() rompería el parse.
    const okJson = (r: Response) => (r.ok ? r.json() : []);
    Promise.all([
      fetch(`/api/manager/jobs/history?${qs}`).then(okJson),
      fetch(`/api/manager/jobs/history/stats`).then(okJson),
    ])
      .then(([h, s]) => {
        setRuns(Array.isArray(h) ? h : []);
        setStats(Array.isArray(s) ? s : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroTipo, filtroStatus]);

  const tipos = useMemo(() => {
    const set = new Set<string>();
    runs.forEach((r) => set.add(r.tipo));
    stats.forEach((s) => set.add(s.tipo));
    return Array.from(set).sort();
  }, [runs, stats]);

  return (
    <div className="h-full flex flex-col overflow-hidden p-3 gap-3">
      {/* Stats por tipo (últimos 7 días) */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[#ff9900]/10">
          <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
            Resumen 7 días
          </span>
        </div>
        {stats.length === 0 ? (
          <div className="text-[var(--t-text-muted)] text-xs p-3 text-center">
            Sin runs registrados. (Los jobs instrumentados con JobRunLogger van apareciendo acá)
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-2">
            {stats.map((s) => (
              <button
                key={s.tipo}
                onClick={() => setFiltroTipo(filtroTipo === s.tipo ? "" : s.tipo)}
                className={`border p-2 text-left hover:border-[#ff9900] transition-colors ${
                  filtroTipo === s.tipo ? "border-[#ff9900]" : "border-[var(--t-border-2)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[var(--t-text)] uppercase">{s.tipo}</span>
                  {s.last_status && <StatusBadge status={s.last_status} />}
                </div>
                <div className="text-[10px] text-[var(--t-text-muted)] mt-1 font-mono">
                  <span className="text-[#00cc66]">{s.ok} ok</span>
                  {s.partial > 0 && <> · <span className="text-[#ff9900]">{s.partial} partial</span></>}
                  {s.error > 0 && <> · <span className="text-[#ff3333]">{s.error} err</span></>}
                  <> · {s.total} total</>
                </div>
                {s.last_run && (
                  <div className="text-[10px] text-[var(--t-text-muted)] mt-0.5 font-mono">últ: {s.last_run}</div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filtros + tabla */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col flex-1 overflow-hidden">
        <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[#ff9900]/10 flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
            Historial de runs ({runs.length})
          </span>
          <div className="flex items-center gap-2">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="bg-[#0a0a0a] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-2 py-0.5 font-mono focus:border-[#ff9900] outline-none"
            >
              <option value="">todos los tipos</option>
              {tipos.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="bg-[#0a0a0a] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-2 py-0.5 font-mono focus:border-[#ff9900] outline-none"
            >
              <option value="">todos</option>
              <option value="ok">ok</option>
              <option value="partial">partial</option>
              <option value="error">error</option>
            </select>
            <button
              onClick={fetchData}
              className="text-[10px] font-semibold px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[#ff9900] hover:text-[#ff9900] transition-colors"
            >
              ↻
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="text-[var(--t-text-muted)] text-xs p-4 text-center">Cargando…</p>
          ) : runs.length === 0 ? (
            <p className="text-[var(--t-text-muted)] text-xs p-4 text-center">
              Sin registros. Si los jobs corrieron pero no aparecen, revisar que estén instrumentados con JobRunLogger.
            </p>
          ) : (
            <table className="w-full text-[10px] font-mono">
              <thead className="sticky top-0 bg-[#0a0a0a]">
                <tr className="text-left border-b border-[var(--t-border)]">
                  <th className="px-2 py-1 text-[#ff9900] uppercase">Tipo</th>
                  <th className="px-2 py-1 text-[#ff9900] uppercase">Start (ART)</th>
                  <th className="px-2 py-1 text-[#ff9900] uppercase">Duración</th>
                  <th className="px-2 py-1 text-[#ff9900] uppercase">Status</th>
                  <th className="px-2 py-1 text-[#ff9900] uppercase">Resumen</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={`${r.tipo}-${r.started_at}`}
                    onClick={() => setSelected(r)}
                    className="border-b border-[var(--t-border)] hover:bg-[#141414] cursor-pointer"
                  >
                    <td className="px-2 py-1 text-[var(--t-text)]">{r.tipo}</td>
                    <td className="px-2 py-1 text-[var(--t-text-dim)] whitespace-nowrap">{r.started_at}</td>
                    <td className="px-2 py-1 text-[var(--t-text-dim)]">{fmtDuration(r.elapsed_s)}</td>
                    <td className="px-2 py-1"><StatusBadge status={r.status} /></td>
                    <td className="px-2 py-1 text-[var(--t-text-dim)] truncate max-w-[400px]">
                      {r.errors.length > 0
                        ? <span className="text-[#ff9900]">{r.errors[0]}</span>
                        : resumenStats(r.stats)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Drawer de detalle */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[var(--t-panel)] border border-[#ff9900] max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[#ff9900]/10 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
                {selected.tipo} · {selected.started_at} · <StatusBadge status={selected.status} />
              </span>
              <button
                onClick={() => setSelected(null)}
                className="text-[var(--t-text-muted)] hover:text-[#ff9900] text-lg leading-none px-2"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3 text-[11px] font-mono">
              <div className="text-[var(--t-text-dim)]">
                Duración: {fmtDuration(selected.elapsed_s)} · Terminó: {selected.finished_at}
              </div>

              {selected.errors.length > 0 && (
                <div>
                  <div className="text-[#ff9900] uppercase text-[10px] mb-1">Errores</div>
                  <ul className="space-y-0.5 text-[#ff3333]">
                    {selected.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </div>
              )}

              {Object.keys(selected.stats || {}).length > 0 && (
                <div>
                  <div className="text-[#ff9900] uppercase text-[10px] mb-1">Stats</div>
                  <pre className="bg-[#0a0a0a] border border-[var(--t-border)] p-2 text-[var(--t-text)] overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(selected.stats, null, 2)}
                  </pre>
                </div>
              )}

              {selected.log && selected.log.length > 0 && (
                <div>
                  <div className="text-[#ff9900] uppercase text-[10px] mb-1">Log ({selected.log.length} líneas)</div>
                  <pre className="bg-[#0a0a0a] border border-[var(--t-border)] p-2 text-[var(--t-text-dim)] overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                    {selected.log.join("\n")}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function resumenStats(stats: Record<string, unknown>): string {
  if (!stats) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v === "number" || typeof v === "string") {
      parts.push(`${k}=${v}`);
    } else if (Array.isArray(v)) {
      parts.push(`${k}=[${v.length}]`);
    }
    if (parts.length >= 4) break;
  }
  return parts.join(" · ");
}
