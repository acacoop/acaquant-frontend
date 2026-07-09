"use client";

import { useEffect, useMemo, useState } from "react";
import { JobsRunsPanel } from "./jobs-runs-panel";
import { usePersistedState } from "@/lib/use-persisted-state";

/**
 * OBSERVABILIDAD → JOBS — dos sub-vistas:
 *
 *  CATÁLOGO  — TODOS los jobs agendados, siempre completo: el backend parsea
 *              deploy/crontab.txt en runtime (un cron nuevo aparece solo) y
 *              joinea el último run de cada módulo. Los no instrumentados
 *              (sin JobRunLogger) salen igual, marcados SIN REGISTRO.
 *  HISTORIAL — el historial crudo de corridas (manager.job_runs) con filtros.
 */

interface UltimoRun {
  status: string;
  started_at: string;
  finished_at: string | null;
  elapsed_s: number | null;
  resumen: string;
}

interface CatalogoRun {
  modulo: string;
  tipo: string;
  ultimo: UltimoRun | null;
}

interface CatalogoJob {
  label: string;
  schedule: string;
  timeout: string;
  modules: string[];
  runs: CatalogoRun[];
  instrumentado: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--t-pos)",
  partial: "#ff9900",
  error: "var(--t-neg)",
};

function humanizarCron(expr: string): string {
  const [min, hora, , , dow] = expr.split(" ");
  const dias = dow === "1-5" ? " L-V" : dow === "*" ? " todos los días" : ` (dow ${dow})`;
  if (min.startsWith("*/") && hora === "*") return `cada ${min.slice(2)} min${dias}`;
  if (min.startsWith("*/")) return `cada ${min.slice(2)} min, ${hora} UTC${dias}`;
  if (hora === "*") return `minuto ${min} de cada hora${dias}`;
  if (hora.includes("-") || hora.includes(",")) return `${hora} UTC a los ${min} min${dias}`;
  return `${hora.padStart(2, "0")}:${min.padStart(2, "0")} UTC${dias}`;
}

function fmtHace(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso.replace(" ", "T").replace(/\+00(:00)?$/, "Z")).getTime();
  if (!Number.isFinite(t)) return iso;
  const min = Math.floor((Date.now() - t) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min}m`;
  if (min < 60 * 48) return `hace ${Math.floor(min / 60)}h`;
  return `hace ${Math.floor(min / 1440)}d`;
}

function fmtDur(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s < 1) return `${(s * 1000).toFixed(0)}ms`;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s`;
}

function CatalogoTable() {
  const [jobs, setJobs] = useState<CatalogoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/manager/jobs/catalogo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => {
        if (!alive) return;
        setJobs(Array.isArray(j.jobs) ? j.jobs : []);
        setErr(null);
      })
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  // Una fila por (cron, módulo) — los chains muestran cada módulo con su run.
  const filas = useMemo(() => {
    const out: { job: CatalogoJob; run: CatalogoRun; primero: boolean }[] = [];
    const ql = q.trim().toLowerCase();
    for (const j of [...jobs].sort((a, b) => a.label.localeCompare(b.label))) {
      if (ql && !j.label.toLowerCase().includes(ql) && !j.modules.some((m) => m.toLowerCase().includes(ql))) continue;
      j.runs.forEach((r, i) => out.push({ job: j, run: r, primero: i === 0 }));
      if (j.runs.length === 0) {
        out.push({ job: j, run: { modulo: "—", tipo: "—", ultimo: null }, primero: true });
      }
    }
    return out;
  }, [jobs, q]);

  const sinRegistro = jobs.filter((j) => !j.instrumentado).length;

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0">
        <span className="text-[10px] font-mono text-[var(--t-text-dim)]">
          {jobs.length} crons agendados (fuente: crontab del deploy — siempre completo)
          {sinRegistro > 0 && (
            <span className="text-[var(--t-text-muted)]"> · {sinRegistro} sin registro de runs</span>
          )}
        </span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filtrar…"
          className="ml-auto bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[10px] px-2 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none w-[160px]"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && <div className="text-center text-[var(--t-text-muted)] text-[11px] py-8">Cargando…</div>}
        {err && <div className="text-center text-[var(--t-neg)] text-[11px] py-8">Error: {err}</div>}
        {!loading && !err && (
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10 text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">
              <tr className="border-b border-[var(--t-border)]">
                <th className="!px-3 !py-1 text-left">Job</th>
                <th className="!px-2 !py-1 text-left">Programación</th>
                <th className="!px-2 !py-1 text-left">Módulo</th>
                <th className="!px-2 !py-1 text-left w-[90px]">Último run</th>
                <th className="!px-2 !py-1 text-left w-[70px]">Status</th>
                <th className="!px-2 !py-1 text-right w-[70px]">Duración</th>
                <th className="!px-2 !py-1 text-left">Resumen</th>
              </tr>
            </thead>
            <tbody>
              {filas.map(({ job, run, primero }, idx) => {
                const u = run.ultimo;
                const color = u ? (STATUS_COLOR[u.status] ?? "#888") : "#666";
                return (
                  <tr key={`${job.label}-${run.modulo}-${idx}`} className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5">
                    <td className="!px-3 !py-1 text-[var(--t-text)] font-semibold">
                      {primero ? job.label : ""}
                    </td>
                    <td className="!px-2 !py-1 text-[var(--t-text-dim)] whitespace-nowrap" title={job.schedule}>
                      {primero ? humanizarCron(job.schedule) : ""}
                    </td>
                    <td className="!px-2 !py-1 text-[var(--t-text-dim)]">{run.modulo.replace(/^(jobs|engines|scripts)\./, "")}</td>
                    <td className="!px-2 !py-1 whitespace-nowrap" title={u?.started_at ?? ""}>
                      {u ? fmtHace(u.started_at) : "—"}
                    </td>
                    <td className="!px-2 !py-1">
                      {u ? (
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5"
                          style={{ color, border: `1px solid ${color}40`, backgroundColor: `${color}12` }}
                        >
                          {u.status.toUpperCase()}
                        </span>
                      ) : (
                        <span className="text-[9px] text-[var(--t-text-muted)]" title="El job no registra corridas (sin JobRunLogger)">
                          ⚪ SIN REGISTRO
                        </span>
                      )}
                    </td>
                    <td className="!px-2 !py-1 text-right text-[var(--t-text-dim)]">{fmtDur(u?.elapsed_s)}</td>
                    <td className="!px-2 !py-1 text-[var(--t-text-dim)] truncate max-w-[320px]" title={u?.resumen ?? ""}>
                      {u?.resumen || ""}
                    </td>
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

export function JobsGroup() {
  const [sub, setSub] = usePersistedState<"catalogo" | "historial">("manager.jobs.sub", "catalogo");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mr-2">JOBS</span>
        {(["catalogo", "historial"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSub(s)}
            className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
              sub === s
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}
          >
            {s === "catalogo" ? "CATÁLOGO" : "HISTORIAL"}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "catalogo" && <CatalogoTable />}
        {sub === "historial" && <JobsRunsPanel />}
      </div>
    </div>
  );
}
