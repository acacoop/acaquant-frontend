"use client";

import { useEffect, useState } from "react";

// Tab BOLETOS dentro de MANAGER → AUNESA. Sub-tabs:
//   FALTANTES — lista boletos sin arancel (Fase A — implementado).
//   BACKFILL  — dispara el matching contra Aunesa /informes (Fase B — pendiente).
//
// Backend: GET /api/manager/aunesa/boletos/faltantes?desde&hasta&id_cuenta
// Excluye futuros DLR (USDL) en backend (api/services/_negocio_futuros.py).

type Sub = "faltantes" | "backfill";

interface ResumenRow {
  categoria: string | null;
  op: string | null;
  n: number;
  importe_abs: number;
  n_cuentas: number;
}

interface BoletoRow {
  comprobante: string | null;
  id_cuenta: string | null;
  cuenta: string | null;
  fecha: string | null;
  categoria: string | null;
  op: string | null;
  informacion: string | null;
  moneda: string | null;
  ticker: string | null;
  unidad: string | null;
  importe: number | null;
  arancel: number | null;
}

interface FaltantesResp {
  desde: string;
  hasta: string;
  id_cuenta: string | null;
  n_total: number;
  truncado: boolean;
  limit: number;
  resumen: ResumenRow[];
  boletos: BoletoRow[];
}

// Fecha hoy en ART (UTC-3) — el backend interpreta YYYY-MM-DD como fecha de
// concertación, no necesita ajuste por TZ.
function hoyArt(): string {
  const d = new Date();
  const ms = d.getTime() - d.getTimezoneOffset() * 60_000 - 3 * 60 * 60_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function inicioMesArt(): string {
  return hoyArt().slice(0, 8) + "01";
}

export function AunesaBoletosPanel() {
  const [sub, setSub] = useState<Sub>("faltantes");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mr-2">BOLETOS</span>
        <button
          onClick={() => setSub("faltantes")}
          className={`px-3 py-1 text-[10px] font-semibold tracking-widest transition-colors ${
            sub === "faltantes" ? "text-[var(--t-accent)] border-b border-[var(--t-accent)]" : "text-[var(--t-text-muted)] hover:text-[var(--t-text-dim)]"
          }`}
        >
          FALTANTES
        </button>
        <button
          onClick={() => setSub("backfill")}
          className={`px-3 py-1 text-[10px] font-semibold tracking-widest transition-colors ${
            sub === "backfill" ? "text-[var(--t-accent)] border-b border-[var(--t-accent)]" : "text-[var(--t-text-muted)] hover:text-[var(--t-text-dim)]"
          }`}
        >
          BACKFILL
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "faltantes" && <Faltantes />}
        {sub === "backfill" && <Backfill />}
      </div>
    </div>
  );
}

function Faltantes() {
  const [desde, setDesde] = useState(inicioMesArt());
  const [hasta, setHasta] = useState(hoyArt());
  const [idCuenta, setIdCuenta] = useState("");
  const [data, setData] = useState<FaltantesResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetalle, setShowDetalle] = useState(false);

  async function buscar() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (idCuenta.trim()) params.set("id_cuenta", idCuenta.trim());
      const r = await fetch(`/api/manager/aunesa/boletos/faltantes?${params}`, {
        cache: "no-store",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || `error ${r.status}`);
      }
      setData(await r.json());
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  // Buscar al montar — UX más fluida que el form en blanco.
  useEffect(() => {
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importeTotal = data?.resumen.reduce((s, r) => s + (r.importe_abs ?? 0), 0) ?? 0;
  // Header KPI: ahora el resumen agrupa por (categoria, op) → el max de n_cuentas
  // entre las filas es el peor escenario; sumar n_cuentas dobla cuentas que tienen
  // boletos en varias categorías. Mostramos el max como aproximación útil.
  const cuentasMax = data?.resumen.reduce((m, r) => Math.max(m, r.n_cuentas ?? 0), 0) ?? 0;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Form */}
      <div className="flex items-end gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <Field label="DESDE">
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="HASTA">
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="ID CUENTA (opcional)">
          <input
            type="text"
            value={idCuenta}
            onChange={(e) => setIdCuenta(e.target.value)}
            placeholder="ej. 1346"
            className={inputCls + " w-[120px]"}
          />
        </Field>
        <button
          onClick={buscar}
          disabled={loading}
          className="bg-[var(--t-accent)] text-black font-bold tracking-wide px-4 py-1 text-[11px] hover:bg-[#ffaa22] disabled:opacity-40"
        >
          {loading ? "BUSCANDO…" : "BUSCAR"}
        </button>
        {data && (
          <div className="ml-auto flex items-center gap-4 text-[10px] text-[var(--t-text-dim)]">
            <span>
              Boletos sin arancel:{" "}
              <span className="text-[var(--t-accent)] font-bold">{data.n_total.toLocaleString("es-AR")}</span>
            </span>
            <span>Cuentas (máx): {cuentasMax}</span>
            <span>
              Importe abs:{" "}
              <span className="text-[var(--t-text)]">
                ${importeTotal.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </span>
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 text-[11px] text-[#ff7f7f] bg-[#1a0a0a] border-b border-[#2a1a1a]">
          {error}
        </div>
      )}

      {/* Resumen por (cuenta, fecha) */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!data ? (
          <div className="p-6 text-[11px] text-[var(--t-text-muted)] text-center">
            {loading ? "Cargando…" : "Sin datos"}
          </div>
        ) : data.resumen.length === 0 ? (
          <div className="p-6 text-[11px] text-[#7fff7f] text-center">
            ✓ Sin boletos faltantes en el rango — todos tienen arancel.
          </div>
        ) : (
          <>
            {/* Resumen agrupado por (categoría, op) — dice qué tipos de
                movimiento están rebotando el match. n_cuentas = ámbito. */}
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="text-[9px] text-[var(--t-text-muted)] tracking-widest bg-[var(--t-panel)] sticky top-0 z-10">
                <tr>
                  <th className="text-left px-2 py-1 border-b border-[var(--t-border)]">CATEGORÍA</th>
                  <th className="text-left px-2 py-1 border-b border-[var(--t-border)]">OP</th>
                  <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">N</th>
                  <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">CUENTAS</th>
                  <th className="text-right px-2 py-1 border-b border-[var(--t-border)]">IMPORTE ABS</th>
                </tr>
              </thead>
              <tbody>
                {data.resumen.map((r, i) => (
                  <tr
                    key={`${r.categoria}-${r.op}-${i}`}
                    className="border-b border-[#101010] hover:bg-[var(--t-surface)]"
                  >
                    <td className="px-2 py-0.5 text-[var(--t-accent)]">{r.categoria ?? "—"}</td>
                    <td className="px-2 py-0.5 text-[var(--t-text)]">{r.op ?? "—"}</td>
                    <td className="px-2 py-0.5 text-right text-[var(--t-text)]">
                      {r.n.toLocaleString("es-AR")}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
                      {r.n_cuentas.toLocaleString("es-AR")}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
                      ${r.importe_abs.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Detalle plegable — boletos individuales con columnas útiles
                para el control (informacion truncada al final). */}
            <div className="border-t border-[var(--t-border)] mt-2 px-3 py-2">
              <button
                onClick={() => setShowDetalle((v) => !v)}
                className="text-[10px] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] tracking-wide"
              >
                {showDetalle ? "▾" : "▸"} DETALLE POR BOLETO ({data.boletos.length}
                {data.truncado ? ` de ${data.n_total} — truncado a ${data.limit}` : ""})
              </button>
              {showDetalle && (
                <table className="w-full text-[10px] font-mono tabular-nums mt-2">
                  <thead className="text-[9px] text-[var(--t-text-muted)] tracking-widest">
                    <tr>
                      <th className="text-left px-2 py-1">FECHA</th>
                      <th className="text-left px-2 py-1">CUENTA</th>
                      <th className="text-left px-2 py-1">TICKER</th>
                      <th className="text-left px-2 py-1">CATEGORÍA</th>
                      <th className="text-left px-2 py-1">OP</th>
                      <th className="text-left px-2 py-1">MON</th>
                      <th className="text-right px-2 py-1">IMPORTE</th>
                      <th className="text-left px-2 py-1">INFORMACIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.boletos.map((b, i) => (
                      <tr
                        key={`${b.comprobante}-${i}`}
                        className="border-t border-[#101010] hover:bg-[var(--t-surface)]"
                      >
                        <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{b.fecha ?? "—"}</td>
                        <td className="px-2 py-0.5 text-[var(--t-accent)]">{b.id_cuenta ?? "—"}</td>
                        <td className="px-2 py-0.5 text-[var(--t-text)]">{b.ticker ?? "—"}</td>
                        <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{b.categoria ?? "—"}</td>
                        <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{b.op ?? "—"}</td>
                        <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{b.moneda ?? "—"}</td>
                        <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
                          {b.importe != null
                            ? b.importe.toLocaleString("es-AR", { maximumFractionDigits: 2 })
                            : "—"}
                        </td>
                        <td
                          className="px-2 py-0.5 text-[var(--t-text-muted)] max-w-[280px] truncate"
                          title={b.informacion ?? undefined}
                        >
                          {b.informacion ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[var(--t-text)] px-2 py-1 text-[11px] tabular-nums focus:border-[var(--t-accent)] outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">{label}</span>
      {children}
    </div>
  );
}

// ── BACKFILL ────────────────────────────────────────────────────────────────

interface JobStats {
  inf: number;
  match: number;
  sin_match: number;
  escritos: number;
}

interface JobError {
  cuenta: string;
  error: string;
}

interface Job {
  job_id?: string;  // viene en el response del POST start, no en el doc Mongo
  status: "running" | "done" | "error" | "stale";
  actor: string | null;
  desde: string;
  hasta: string;
  cuentas: string[] | null;
  workers: number;
  apply: boolean;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
  cuentas_total: number;
  cuentas_done: number;
  stats: JobStats;
  ejemplos: string[];
  errores: JobError[];
  error: string | null;
}

function Backfill() {
  const [desde, setDesde] = useState(inicioMesArt());
  const [hasta, setHasta] = useState(hoyArt());
  const [cuentasTxt, setCuentasTxt] = useState("");  // CSV opcional
  const [workers, setWorkers] = useState(6);
  const [apply, setApply] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [historial, setHistorial] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function refreshHistorial() {
    try {
      const r = await fetch("/api/manager/aunesa/boletos/backfill?limit=10", {
        cache: "no-store",
      });
      if (r.ok) setHistorial(await r.json());
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void refreshHistorial();
  }, []);

  // Polling cuando hay un job activo. Se detiene cuando el job termina.
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/manager/aunesa/boletos/backfill/${jobId}`, {
          cache: "no-store",
        });
        if (!alive) return;
        if (r.ok) {
          const j = (await r.json()) as Job;
          setJob(j);
          if (j.status !== "running") {
            void refreshHistorial();
            return; // detiene el polling
          }
        }
      } catch {
        // ignore — el siguiente tick reintenta
      }
      if (alive) setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      alive = false;
    };
  }, [jobId]);

  async function start() {
    setStarting(true);
    setError(null);
    setJob(null);
    try {
      const cuentas = cuentasTxt
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const r = await fetch("/api/manager/aunesa/boletos/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desde,
          hasta,
          cuentas: cuentas.length ? cuentas : null,
          workers,
          apply,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.detail || `error ${r.status}`);
      }
      const j = await r.json();
      setJobId(j.job_id);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setStarting(false);
    }
  }

  const progressPct =
    job && job.cuentas_total > 0
      ? Math.round((job.cuentas_done / job.cuentas_total) * 100)
      : 0;

  return (
    <div className="h-full flex flex-col min-h-0 overflow-y-auto">
      {/* Form */}
      <div className="flex items-end gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <Field label="DESDE">
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="HASTA">
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="CUENTAS (CSV opcional)">
          <input
            type="text"
            value={cuentasTxt}
            onChange={(e) => setCuentasTxt(e.target.value)}
            placeholder="ej. 1346, 101 — vacío = todas del rango"
            className={inputCls + " w-[300px]"}
          />
        </Field>
        <Field label="WORKERS">
          <input
            type="number"
            min={1}
            max={20}
            value={workers}
            onChange={(e) => setWorkers(parseInt(e.target.value, 10) || 6)}
            className={inputCls + " w-[60px]"}
          />
        </Field>
        <label className="flex items-center gap-1.5 text-[10px] text-[var(--t-text-dim)] mb-1">
          <input
            type="checkbox"
            checked={apply}
            onChange={(e) => setApply(e.target.checked)}
            className="accent-[var(--t-accent)]"
          />
          <span className="tracking-wide">
            {apply ? (
              <span className="text-[var(--t-accent)] font-bold">APPLY</span>
            ) : (
              "DRY-RUN"
            )}
          </span>
        </label>
        <button
          onClick={start}
          disabled={starting || job?.status === "running"}
          className="bg-[var(--t-accent)] text-black font-bold tracking-wide px-4 py-1 text-[11px] hover:bg-[#ffaa22] disabled:opacity-40"
        >
          {starting
            ? "ARRANCANDO…"
            : job?.status === "running"
              ? "EN CURSO…"
              : "EJECUTAR"}
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 text-[11px] text-[#ff7f7f] bg-[#1a0a0a] border-b border-[#2a1a1a]">
          {error}
        </div>
      )}

      {/* Job en curso / último resultado */}
      {job && (
        <div className="px-3 py-3 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
          <div className="flex items-center gap-3 mb-2">
            <span
              className={`text-[10px] font-bold tracking-widest px-2 py-0.5 ${
                job.status === "done"
                  ? "bg-[#0d2a0d] text-[#7fff7f]"
                  : job.status === "error"
                    ? "bg-[#2a0d0d] text-[#ff7f7f]"
                    : job.status === "stale"
                      ? "bg-[#2a1a0a] text-[#ffaa44]"
                      : "bg-[#0a1a2a] text-[#7faaff]"
              }`}
            >
              {job.status.toUpperCase()}
            </span>
            <span className="text-[10px] text-[var(--t-text-dim)]">
              {job.cuentas_done.toLocaleString("es-AR")} /{" "}
              {job.cuentas_total.toLocaleString("es-AR")} cuentas ({progressPct}%)
            </span>
            <span className="text-[10px] text-[var(--t-text-muted)] ml-auto">
              {job.apply ? "APPLY" : "DRY-RUN"} · workers={job.workers} · actor={job.actor ?? "—"}
            </span>
          </div>

          {/* Barra de progreso */}
          <div className="h-1.5 bg-[var(--t-border)] mb-3">
            <div
              className={`h-full ${job.status === "error" ? "bg-[#ff7f7f]" : "bg-[var(--t-accent)]"}`}
              style={{ width: `${progressPct}%`, transition: "width 0.3s ease-out" }}
            />
          </div>

          <div className="grid grid-cols-4 gap-2 text-[10px]">
            <Kpi label="Informes (Aunesa)" v={job.stats.inf} />
            <Kpi label="Match" v={job.stats.match} color="#7fff7f" />
            <Kpi label="Sin match" v={job.stats.sin_match} color="#ffaa44" />
            <Kpi
              label={job.apply ? "Escritos" : "Escribiría"}
              v={job.stats.escritos}
              color="#ff9900"
            />
          </div>

          {job.status === "error" && job.error && (
            <div className="mt-2 text-[10px] text-[#ff7f7f]">
              <span className="font-bold">Error fatal:</span> {job.error}
            </div>
          )}

          {job.errores.length > 0 && (
            <div className="mt-2 text-[10px] text-[#ffaa44]">
              {job.errores.length} cuenta(s) con error tras reintento:{" "}
              <span className="text-[var(--t-text-dim)]">
                {job.errores.slice(0, 5).map((e) => e.cuenta).join(", ")}
                {job.errores.length > 5 ? ` … +${job.errores.length - 5}` : ""}
              </span>
            </div>
          )}

          {!job.apply && job.ejemplos.length > 0 && (
            <div className="mt-2 text-[9px] text-[var(--t-text-muted)]">
              <div className="font-bold text-[var(--t-text-dim)] mb-0.5">Ejemplos (dry-run):</div>
              {job.ejemplos.map((ej, i) => (
                <div key={i} className="font-mono">{ej}</div>
              ))}
            </div>
          )}

          {job.status === "stale" && (
            <div className="mt-2 text-[10px] text-[#ffaa44]">
              ⚠ El proceso API se reinició o se cortó. El job no terminó.
              Podés re-ejecutar el mismo rango — es idempotente.
            </div>
          )}
        </div>
      )}

      {/* Historial */}
      <div className="flex-1 min-h-0">
        <div className="px-3 py-1.5 text-[9px] text-[var(--t-text-muted)] tracking-widest border-b border-[var(--t-border)]">
          HISTORIAL (últimos 10)
        </div>
        {historial.length === 0 ? (
          <div className="p-6 text-[11px] text-[var(--t-text-muted)] text-center">
            Sin corridas previas
          </div>
        ) : (
          <table className="w-full text-[10px] font-mono tabular-nums">
            <thead className="text-[9px] text-[var(--t-text-muted)] tracking-widest bg-[var(--t-panel)]">
              <tr>
                <th className="text-left px-2 py-1">START</th>
                <th className="text-left px-2 py-1">ACTOR</th>
                <th className="text-left px-2 py-1">RANGO</th>
                <th className="text-left px-2 py-1">MODO</th>
                <th className="text-left px-2 py-1">STATUS</th>
                <th className="text-right px-2 py-1">CUENTAS</th>
                <th className="text-right px-2 py-1">MATCH</th>
                <th className="text-right px-2 py-1">ESCRITOS</th>
              </tr>
            </thead>
            <tbody>
              {historial.map((h, i) => (
                <tr key={i} className="border-t border-[#101010] hover:bg-[var(--t-surface)]">
                  <td className="px-2 py-0.5 text-[var(--t-text-dim)]">
                    {h.started_at?.replace("T", " ").slice(0, 19) ?? "—"}
                  </td>
                  <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{h.actor ?? "—"}</td>
                  <td className="px-2 py-0.5 text-[var(--t-text)]">
                    {h.desde} → {h.hasta}
                  </td>
                  <td className="px-2 py-0.5 text-[var(--t-text-dim)]">
                    {h.apply ? "APPLY" : "DRY"}
                  </td>
                  <td
                    className={`px-2 py-0.5 font-bold ${
                      h.status === "done"
                        ? "text-[#7fff7f]"
                        : h.status === "error"
                          ? "text-[#ff7f7f]"
                          : h.status === "stale"
                            ? "text-[#ffaa44]"
                            : "text-[#7faaff]"
                    }`}
                  >
                    {h.status}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)]">
                    {h.cuentas_done}/{h.cuentas_total}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[#7fff7f]">
                    {h.stats.match}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[var(--t-accent)]">
                    {h.stats.escritos}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, v, color }: { label: string; v: number; color?: string }) {
  return (
    <div className="bg-[var(--t-panel)] border border-[var(--t-border)] px-2 py-1">
      <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest">{label}</div>
      <div
        className="text-[14px] font-bold tabular-nums"
        style={{ color: color ?? "#d0d0d0" }}
      >
        {v.toLocaleString("es-AR")}
      </div>
    </div>
  );
}
