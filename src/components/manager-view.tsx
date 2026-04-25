"use client";

import { useCallback, useEffect, useState } from "react";
import { AsistenteDashboard } from "./asistente-dashboard";
import { JobsRunsPanel } from "./jobs-runs-panel";
import { LogsPanel } from "./logs-panel";
import { RecursosPanel } from "./recursos-panel";
import { RolesPanel } from "./roles-panel";
import { UsuariosPanel } from "./usuarios-panel";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MotorStatus {
  nombre: string; ultima: string | null; hace: string;
  umbral: number; estado: "ok" | "lento" | "critico" | "fuera_rueda" | "sin_datos";
}
interface JobStatus {
  nombre: string; ultimo: string | null; hace: string;
  frecuencia: string; estado: "ok" | "atrasado" | "critico" | "sin_datos" | "error_parse";
}
interface ApiStatus {
  nombre: string; ultimo: string | null; hace: string;
  cadencia: string; umbral?: string;
  estado: "ok" | "lento" | "critico" | "fuera_rueda" | "sin_datos" | "error_parse";
}
interface StatusData {
  ahora_ar: string; en_rueda: boolean;
  motores: MotorStatus[]; jobs: JobStatus[]; apis: ApiStatus[];
}
interface Job { status: "running" | "done" | "error"; tipo: string; result?: string; started_at?: string; finished_at?: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const ESTADO_COLOR: Record<string, string> = {
  ok:          "#00cc66",
  lento:       "#ff9900",
  atrasado:    "#ff9900",
  critico:     "#ff3333",
  fuera_rueda: "#555555",
  sin_datos:   "#555555",
  error_parse: "#555555",
};
const ESTADO_LABEL: Record<string, string> = {
  ok: "OK", lento: "LENTO", atrasado: "ATRASADO",
  critico: "CRÍTICO", fuera_rueda: "FUERA RUEDA", sin_datos: "SIN DATOS", error_parse: "ERR PARSE",
};

function Badge({ estado }: { estado: string }) {
  const color = ESTADO_COLOR[estado] ?? "#555555";
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 font-mono"
      style={{ color, border: `1px solid ${color}40`, backgroundColor: `${color}12` }}>
      {ESTADO_LABEL[estado] ?? estado.toUpperCase()}
    </span>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 text-[11px] font-semibold tracking-wide transition-colors border ${
        active ? "bg-[#ff9900] text-black border-[#ff9900]"
               : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}>
      {label}
    </button>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
      <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">{title}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
      <SectionHeader title={title} />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

// ── Tab: Diagnóstico ──────────────────────────────────────────────────────────

function TabDiagnostico() {
  const [data, setData] = useState<StatusData | null>(null);
  const [lastCheck, setLastCheck] = useState<string>("");

  const refresh = useCallback(() => {
    fetch("/api/manager/status")
      .then((r) => r.json())
      .then((d: StatusData) => { setData(d); setLastCheck(new Date().toLocaleTimeString("es-AR")); })
      .catch(console.error);
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 10000); return () => clearInterval(id); }, [refresh]);

  return (
    <div className="h-full flex flex-col gap-3 overflow-y-auto p-3">
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-[11px] font-semibold ${data?.en_rueda ? "text-[#00cc66]" : "text-[#555555]"}`}>
          {data ? (data.en_rueda ? "● EN RUEDA" : "● FUERA DE RUEDA") : "—"}
        </span>
        <span className="text-[10px] text-[#555555]">{data?.ahora_ar ?? ""}</span>
        <span className="ml-auto text-[10px] text-[#555555]">Chequeado: {lastCheck} · auto 10s</span>
      </div>

      <Panel title="MOTORES (TIEMPO REAL)">
        <table>
          <thead><tr><th>MOTOR</th><th>ÚLTIMA ACTUALIZACIÓN</th><th>HACE</th><th>UMBRAL</th><th>ESTADO</th></tr></thead>
          <tbody>
            {(data?.motores ?? []).map((m) => (
              <tr key={m.nombre}>
                <td className="text-[#d0d0d0] font-semibold">{m.nombre}</td>
                <td className="font-mono">{m.ultima ?? "—"}</td>
                <td className="font-mono text-[#808080]">{m.hace}</td>
                <td className="font-mono text-[#555555]">{m.umbral}s</td>
                <td><Badge estado={m.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="JOBS (PERIÓDICOS)">
        <table>
          <thead><tr><th>JOB</th><th>ÚLTIMO DATO</th><th>HACE</th><th>FRECUENCIA</th><th>ESTADO</th></tr></thead>
          <tbody>
            {(data?.jobs ?? []).map((j) => (
              <tr key={j.nombre}>
                <td className="text-[#d0d0d0] font-semibold">{j.nombre}</td>
                <td className="font-mono">{j.ultimo ?? "—"}</td>
                <td className="font-mono text-[#808080]">{j.hace}</td>
                <td className="text-[#555555]">{j.frecuencia}</td>
                <td><Badge estado={j.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="APIS EXTERNAS (FUENTES DE DATOS)">
        <table>
          <thead><tr><th>FUENTE</th><th>ÚLTIMO DATO</th><th>HACE</th><th>CADENCIA</th><th>UMBRAL</th><th>ESTADO</th></tr></thead>
          <tbody>
            {(data?.apis ?? []).map((a) => (
              <tr key={a.nombre}>
                <td className="text-[#d0d0d0] font-semibold">{a.nombre}</td>
                <td className="font-mono">{a.ultimo ?? "—"}</td>
                <td className="font-mono text-[#808080]">{a.hace}</td>
                <td className="text-[#555555]">{a.cadencia}</td>
                <td className="font-mono text-[#555555]">{a.umbral ?? "—"}</td>
                <td><Badge estado={a.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ── Tab: Backfills ────────────────────────────────────────────────────────────

const JOBS_DISPONIBLES = [
  { tipo: "aum_backfill",    label: "AuM Backfill",         desc: "Reconstruye AuM para una fecha específica",      needsDate: true  },
  { tipo: "aum_resumen_fci", label: "Rollup AuMResumenFCI", desc: "Materializa resumen FCI post-backfill",           needsDate: false },
  { tipo: "carteras",        label: "Sync Carteras",         desc: "Sincroniza posiciones Aunesa → Valuaciones",     needsDate: false },
  { tipo: "cashflow",        label: "CashFlow --today",      desc: "Movimientos del día desde Aunesa",               needsDate: false },
  { tipo: "flujo",           label: "Flujo Contrapartes",    desc: "Operaciones del día por contraparte",            needsDate: false },
  { tipo: "bcra",            label: "BCRA --today",          desc: "Actualiza CER/DOLAR/BADLAR/TAMAR",               needsDate: false },
  { tipo: "sync_api_copies", label: "Sync API Copies (ALL)", desc: "Re-sincroniza todas las colecciones API",        needsDate: false },
  { tipo: "crear_indices",   label: "Crear Índices",         desc: "Idempotente — crea índices faltantes",           needsDate: false },
  { tipo: "cleanup_curvas",  label: "Cleanup Curvas (--dry)","desc": "Preview de instrumentos a eliminar (solo dry)",needsDate: false },
];

function JobCard({ job_id, tipo, onClear }: { job_id: string; tipo: string; onClear: () => void }) {
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    if (!job_id) return;
    const poll = () => {
      fetch(`/api/manager/jobs/${job_id}`)
        .then((r) => r.json())
        .then((d: Job) => { setJob(d); if (d.status !== "running") clearInterval(id); })
        .catch(console.error);
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [job_id]);

  if (!job) return <span className="text-[10px] text-[#555555]">iniciando…</span>;

  const color = job.status === "done" ? "#00cc66" : job.status === "error" ? "#ff3333" : "#ff9900";
  return (
    <div className="mt-2 border border-[#2a2a2a] p-2 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold" style={{ color }}>
          {job.status === "running" ? "⟳ CORRIENDO…" : job.status === "done" ? "✓ OK" : "✗ ERROR"}
        </span>
        <span className="text-[10px] text-[#555555] font-mono">{tipo} · {job_id}</span>
        {job.status !== "running" && (
          <button onClick={onClear} className="ml-auto text-[10px] text-[#555555] hover:text-[#ff9900]">cerrar</button>
        )}
      </div>
      {job.result && (
        <pre className="text-[9px] text-[#808080] font-mono whitespace-pre-wrap max-h-[120px] overflow-y-auto bg-[#0a0a0a] p-1.5">
          {job.result}
        </pre>
      )}
    </div>
  );
}

// ── Panel: Opciones → elegir vencimientos a trackear ───────────────────────

function fmtExpiry(s: string): string {
  if (s.length !== 8) return s;
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

interface ExpiriesData {
  disponibles: string[];
  activos:     string[];
  auto_pick:   boolean;
  actualizado: string | null;
}

function OpcionesExpiriesPanel() {
  const [data, setData] = useState<ExpiriesData | null>(null);
  const [seleccion, setSeleccion] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    fetch("/api/manager/options/expiries")
      .then((r) => r.json())
      .then((d: ExpiriesData) => {
        setData(d);
        setSeleccion(d.activos || []);
      })
      .catch((e) => setMsg(`Error: ${e}`));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggle = (exp: string) => {
    setSeleccion((s) => (s.includes(exp) ? s.filter((x) => x !== exp) : [...s, exp]));
  };

  const guardar = () => {
    setSaving(true);
    setMsg(null);
    fetch("/api/manager/options/expiries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiries: seleccion }),
    })
      .then((r) => r.json())
      .then((d) => {
        setMsg(d.auto_pick ? "Guardado — auto-pick activado" : `Guardado — ${d.expiries.length} vencimiento(s)`);
        fetchData();
      })
      .catch((e) => setMsg(`Error: ${e}`))
      .finally(() => setSaving(false));
  };

  const volverAuto = () => {
    setSeleccion([]);
    setSaving(true);
    setMsg(null);
    fetch("/api/manager/options/expiries", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiries: [] }),
    })
      .then(() => {
        setMsg("Auto-pick activado");
        fetchData();
      })
      .finally(() => setSaving(false));
  };

  return (
    <div className="border border-[#1a1a1a] bg-[#080808]">
      <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
          Opciones — vencimientos a trackear
        </span>
        <span className="text-[9px] text-[#555555]">
          (engine aplica en el próximo chequeo ~5 min)
        </span>
        {data?.actualizado && (
          <span className="ml-auto text-[9px] text-[#555555] font-mono">
            disponibles actualizados: {data.actualizado}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {!data ? (
          <div className="text-[10px] text-[#555555] font-mono">Cargando…</div>
        ) : data.disponibles.length === 0 ? (
          <div className="text-[10px] text-[#ff9900] font-mono">
            No hay vencimientos disponibles en Metadata. ¿Está corriendo el motor de opciones?
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {data.disponibles.map((exp) => {
                const sel = seleccion.includes(exp);
                return (
                  <button
                    key={exp}
                    onClick={() => toggle(exp)}
                    disabled={saving}
                    className={`px-2 py-1 text-[10px] font-mono border transition-colors ${
                      sel
                        ? "bg-[#ff9900] text-black border-[#ff9900]"
                        : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
                    }`}
                  >
                    {fmtExpiry(exp)}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={guardar}
                disabled={saving}
                className="px-3 py-1 text-[10px] font-semibold border border-[#ff9900] text-[#ff9900] hover:bg-[#ff9900] hover:text-black transition-colors disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar selección"}
              </button>
              <button
                onClick={volverAuto}
                disabled={saving}
                className="px-3 py-1 text-[10px] font-semibold border border-[#2a2a2a] text-[#555555] hover:border-[#ff9900] hover:text-[#ff9900] transition-colors disabled:opacity-40"
              >
                Volver a auto-pick
              </button>
              <span className="text-[10px] font-mono text-[#808080]">
                estado actual:{" "}
                {data.auto_pick ? (
                  <span className="text-[#00cc66]">AUTO (próximo &gt; hoy)</span>
                ) : (
                  <span className="text-[#ff9900]">
                    {data.activos.map(fmtExpiry).join(", ")}
                  </span>
                )}
              </span>
              {msg && <span className="text-[10px] font-mono text-[#00cc66] ml-auto">{msg}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}


function TabBackfills() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [activeJobs, setActiveJobs] = useState<Record<string, { job_id: string; tipo: string }>>({});

  const runJob = (tipo: string, args: string[] = []) => {
    fetch("/api/manager/jobs/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, args }),
    })
      .then((r) => r.json())
      .then((d) => setActiveJobs((prev) => ({ ...prev, [tipo]: { job_id: d.job_id, tipo } })))
      .catch(console.error);
  };

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      <OpcionesExpiriesPanel />
      <div className="grid grid-cols-2 gap-3">
        {JOBS_DISPONIBLES.map(({ tipo, label, desc, needsDate }) => (
          <div key={tipo} className="border border-[#1a1a1a] bg-[#080808] p-3 flex flex-col gap-2">
            <div>
              <div className="text-[11px] font-semibold text-[#d0d0d0]">{label}</div>
              <div className="text-[10px] text-[#555555] mt-0.5">{desc}</div>
            </div>
            {needsDate && (
              <input
                type="date" value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-[#0a0a0a] border border-[#2a2a2a] text-[#d0d0d0] text-[10px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none w-full"
              />
            )}
            <button
              onClick={() => runJob(tipo, needsDate ? [date] : [])}
              disabled={!!activeJobs[tipo] && activeJobs[tipo].job_id !== ""}
              className="px-3 py-1 text-[10px] font-semibold border border-[#2a2a2a] text-[#555555] hover:border-[#ff9900] hover:text-[#ff9900] transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-left"
            >
              ▶ Ejecutar
            </button>
            {activeJobs[tipo] && (
              <JobCard
                job_id={activeJobs[tipo].job_id}
                tipo={tipo}
                onClear={() => setActiveJobs((prev) => { const n = { ...prev }; delete n[tipo]; return n; })}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

// ── Tab: Validaciones ─────────────────────────────────────────────────────────

function CheckPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#1a1a1a] bg-[#080808]">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#0e0e0e] transition-colors">
        <span className="text-[10px] text-[#555555]">{open ? "▾" : "▸"}</span>
        <span className="text-[11px] font-semibold text-[#d0d0d0]">{title}</span>
      </button>
      {open && <div className="border-t border-[#1a1a1a] p-3">{children}</div>}
    </div>
  );
}

function RunBtn({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="px-3 py-1 text-[10px] font-semibold border border-[#2a2a2a] text-[#555555] hover:border-[#ff9900] hover:text-[#ff9900] transition-colors disabled:opacity-40 mb-2">
      {loading ? "Ejecutando…" : "▶ Ejecutar"}
    </button>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label?: string }) {
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5"
      style={{ color: ok ? "#00cc66" : "#ff3333", border: `1px solid ${ok ? "#00cc6640" : "#ff333340"}`, backgroundColor: ok ? "#00cc6612" : "#ff333312" }}>
      {label ?? (ok ? "OK" : "ERROR")}
    </span>
  );
}

function TabValidaciones() {
  // Curvas pendientes
  const [cpLoading, setCpLoading] = useState(false);
  const [cpData, setCpData] = useState<{ total: number; ok: boolean; tickers: { ticker: string; pendientes: number }[] } | null>(null);

  // Forwards
  const [fwdLoading, setFwdLoading] = useState(false);
  const [fwdData, setFwdData] = useState<{ curva: string; tickers: { ticker: string; vto: string; tea: number | null; duration: number | null; ultimo: string | null; ok: boolean }[]; live_ok: boolean }[] | null>(null);

  // CER
  const [cerLoading, setCerLoading] = useState(false);
  const [cerData, setCerData] = useState<{ cer_reciente: string | null; dias_habiles: number; instrumentos: { ticker: string; ultimo_trade?: string; settlement?: string; cer_fecha?: string; cer_valor?: number; cer_emision?: number; ratio?: number; paridad?: number; ok: boolean }[] } | null>(null);

  // Tasa Fija
  const [tfLoading, setTfLoading] = useState(false);
  const [tfData, setTfData] = useState<{ snapshot: string | null; ok: number; sin_posicion: number; sin_assets: number; instrumentos: { ticker: string; estado: string }[] } | null>(null);

  // Debug Forward
  const [tickers, setTickers] = useState<string[]>([]);
  const [tcA, setTcA] = useState("");
  const [tcB, setTcB] = useState("");
  const [dbfLoading, setDbfLoading] = useState(false);
  const [dbfData, setDbfData] = useState<{ tc_a: string; tc_b: string; tea_a: number | null; duration_a: number | null; ts_a: string | null; tea_b: number | null; duration_b: number | null; ts_b: string | null; forward: number | null; error: string | null; pasos: { paso: string; valor: string }[] } | null>(null);

  // Debug Breakevens (por fila, compara Buscar Objetivo vs Fisher)
  const [bkvDebugLoading, setBkvDebugLoading] = useState(false);
  const [bkvDebugData, setBkvDebugData] = useState<{
    fecha_cer_max: string | null;
    cer_actual: number | null;
    pares: {
      lecap: string;
      cer: string;
      fecha_vto: string;
      dias: number;
      fecha_cer_liq: string | null;
      meses_pendientes: number | null;
      precio_lecap: number | null;
      flujo_vto_lecap: number | null;
      precio_cer: number | null;
      vn_cer: number | null;
      cer_emision: number | null;
      retorno_lecap: number | null;
      factor_bo: number | null;
      be_buscar_obj: number | null;
      tem_lecap: number | null;
      paridad_cer: number | null;
      retorno_fisher: number | null;
      inflacion_fisher: number | null;
      be_fisher: number | null;
    }[];
  } | null>(null);
  const [bkvExpanded, setBkvExpanded] = useState<string | null>(null);

  // Debug Soberano
  const [tcSob, setTcSob] = useState("");
  const [sobLoading, setSobLoading] = useState(false);
  const [sobData, setSobData] = useState<{
    instrumento: { ticker: string; ticker_corto: string; tipo: string; curva: string; fecha_emision: string; fecha_vencimiento: string; valor_nominal: number; flujos_total: number };
    precio: { ultimo_trade_ts: string | null; precio_rofex: number | null; mep: number | null; precio_usd: number | null };
    settlement: string;
    flujos_futuros: { fecha: string; amortizacion_pct: number; cupon_sobre_residual: number; residual_previo_pct: number; monto_usd: number }[];
    total_flujos_usd: number;
    cashflow: { fecha: string; monto: number }[];
    resultado: { tea_pct: number | null; duration: number | null; paridad: number | null };
  } | null>(null);
  const [sobError, setSobError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/manager/checks/tickers-curvas").then(r => r.json()).then((d: string[]) => {
      setTickers(d);
      if (d.length > 0) setTcA(d[0]);
      if (d.length > 1) setTcB(d[1]);
    }).catch(console.error);
  }, []);

  const runCp  = () => { setCpLoading(true);  fetch("/api/manager/checks/curvas-pendientes").then(r => r.json()).then(setCpData).finally(() => setCpLoading(false)); };
  const runFwd = () => { setFwdLoading(true); fetch("/api/manager/checks/forwards").then(r => r.json()).then(setFwdData).finally(() => setFwdLoading(false)); };
  const runCer = () => { setCerLoading(true); fetch("/api/manager/checks/cer").then(r => r.json()).then(setCerData).finally(() => setCerLoading(false)); };
  const runTf  = () => { setTfLoading(true);  fetch("/api/manager/checks/tasa-fija").then(r => r.json()).then(setTfData).finally(() => setTfLoading(false)); };
  const runBkvDebug = () => {
    setBkvDebugLoading(true);
    fetch("/api/manager/checks/breakevens-debug")
      .then(r => r.json()).then(setBkvDebugData).finally(() => setBkvDebugLoading(false));
  };
  const runDbf = () => {
    if (!tcA || !tcB || tcA === tcB) return;
    setDbfLoading(true);
    fetch(`/api/manager/checks/debug-forward?tc_a=${tcA}&tc_b=${tcB}`)
      .then(r => r.json()).then(setDbfData).finally(() => setDbfLoading(false));
  };
  const runSob = () => {
    if (!tcSob) return;
    setSobLoading(true);
    setSobError(null);
    fetch(`/api/manager/checks/debug-soberano?ticker_corto=${encodeURIComponent(tcSob)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.text();
          throw new Error(body || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(setSobData)
      .catch((e) => { setSobData(null); setSobError(e instanceof Error ? e.message : String(e)); })
      .finally(() => setSobLoading(false));
  };

  const ESTADO_LABEL: Record<string, string> = { ok: "✅ En vista", sin_posicion: "⚠️ Sin posición", sin_assets: "❌ Sin Assets" };

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-2">

      <CheckPanel title="Curvas Pendientes — docs sin duration en TimeSales">
        <RunBtn onClick={runCp} loading={cpLoading} />
        {cpData && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge ok={cpData.ok} label={cpData.ok ? "Sin pendientes" : `${cpData.total.toLocaleString()} pendientes`} />
            </div>
            {!cpData.ok && (
              <table><thead><tr><th>TICKER</th><th className="text-right">PENDIENTES</th></tr></thead>
                <tbody>{cpData.tickers.map(t => (
                  <tr key={t.ticker}><td className="text-[#ff9900]">{t.ticker}</td><td className="text-right font-mono">{t.pendientes.toLocaleString()}</td></tr>
                ))}</tbody>
              </table>
            )}
          </>
        )}
      </CheckPanel>

      <CheckPanel title="Check Forwards — TEA disponible por instrumento">
        <RunBtn onClick={runFwd} loading={fwdLoading} />
        {fwdData && fwdData.map(curva => (
          <div key={curva.curva} className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] font-semibold text-[#d0d0d0]">{curva.curva.toUpperCase()}</span>
              <StatusBadge ok={curva.live_ok} label={curva.live_ok ? "ForwardsLive OK" : "ForwardsLive difiere"} />
            </div>
            <table><thead><tr><th>TICKER</th><th>VTO.</th><th className="text-right">TEA</th><th className="text-right">DURATION</th><th>ÚLTIMO</th><th>ESTADO</th></tr></thead>
              <tbody>{curva.tickers.map(t => (
                <tr key={t.ticker}>
                  <td className="text-[#ff9900]">{t.ticker}</td>
                  <td className="text-[#808080]">{t.vto}</td>
                  <td className="text-right font-mono">{t.tea != null ? `${t.tea.toFixed(2)}%` : "—"}</td>
                  <td className="text-right font-mono">{t.duration != null ? t.duration.toFixed(3) : "—"}</td>
                  <td className="text-[#808080]">{t.ultimo ?? "—"}</td>
                  <td><StatusBadge ok={t.ok} label={t.ok ? "✅" : "❌"} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ))}
      </CheckPanel>

      <CheckPanel title="Check CER — CER usado en último trade enriquecido">
        <RunBtn onClick={runCer} loading={cerLoading} />
        {cerData && (
          <>
            <div className="text-[10px] text-[#555555] mb-2">
              CER más reciente: {cerData.cer_reciente ?? "—"} · Días hábiles: {cerData.dias_habiles}
            </div>
            <table><thead><tr><th>TICKER</th><th>ÚLTIMO TRADE</th><th>SETTLEMENT</th><th>CER FECHA</th><th className="text-right">CER VALOR</th><th className="text-right">RATIO</th><th className="text-right">PARIDAD</th></tr></thead>
              <tbody>{cerData.instrumentos.map(r => (
                <tr key={r.ticker}>
                  <td className="text-[#ff9900]">{r.ticker}</td>
                  <td className="text-[#808080] font-mono">{r.ultimo_trade ?? "—"}</td>
                  <td className="text-[#808080]">{r.settlement ?? "—"}</td>
                  <td className="text-[#808080]">{r.cer_fecha ?? "—"}</td>
                  <td className="text-right font-mono">{r.cer_valor?.toFixed(6) ?? "—"}</td>
                  <td className="text-right font-mono">{r.ratio?.toFixed(6) ?? "—"}</td>
                  <td className="text-right font-mono">{r.paridad?.toFixed(2) ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </>
        )}
      </CheckPanel>

      <CheckPanel title="Debug Breakevens — comparar Buscar Objetivo vs Fisher">
        <RunBtn onClick={runBkvDebug} loading={bkvDebugLoading} />
        {bkvDebugData && (
          <>
            <div className="text-[10px] text-[#555555] font-mono mb-2">
              CER publicado más reciente:{" "}
              <span className="text-[#ff9900]">{bkvDebugData.fecha_cer_max ?? "—"}</span>
              {bkvDebugData.cer_actual != null && (
                <> ({bkvDebugData.cer_actual.toFixed(4)})</>
              )}
              {" · "}Click en una fila para el desglose paso a paso.
            </div>
            <table>
              <thead>
                <tr>
                  <th>LECAP</th><th>CER</th>
                  <th className="text-right">DÍAS</th>
                  <th className="text-right">MESES PEND</th>
                  <th className="text-right">BE BUSCAR OBJ</th>
                  <th className="text-right">BE FISHER</th>
                  <th className="text-right">Δ</th>
                </tr>
              </thead>
              <tbody>
                {bkvDebugData.pares.map((p) => {
                  const key = `${p.lecap}__${p.cer}`;
                  const expanded = bkvExpanded === key;
                  const bo = p.be_buscar_obj;
                  const fisher = p.be_fisher;
                  const delta = bo != null && fisher != null ? (bo - fisher) * 100 : null;
                  return (
                    <>
                      <tr
                        key={key}
                        onClick={() => setBkvExpanded(expanded ? null : key)}
                        className="cursor-pointer hover:bg-[#ff9900]/10"
                      >
                        <td className="text-[#ff9900]">{p.lecap}</td>
                        <td className="text-[#808080]">{p.cer}</td>
                        <td className="text-right text-[#808080] font-mono">{p.dias}</td>
                        <td className="text-right font-mono">
                          {p.meses_pendientes != null ? p.meses_pendientes.toFixed(3) : "—"}
                        </td>
                        <td className="text-right font-bold font-mono text-[#ff9900]">
                          {bo != null ? `${(bo * 100).toFixed(2)}%` : "—"}
                        </td>
                        <td className="text-right font-mono text-[#808080]">
                          {fisher != null ? `${(fisher * 100).toFixed(2)}%` : "—"}
                        </td>
                        <td
                          className="text-right font-mono"
                          style={{ color: delta != null && Math.abs(delta) > 0.5 ? "#ff9900" : "#888" }}
                        >
                          {delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}pp` : "—"}
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${key}_detail`}>
                          <td colSpan={7} className="!py-2 !px-3 bg-[#0a0a0a] border-l-2 border-l-[#ff9900]">
                            <div className="font-mono text-[10px] text-[#d0d0d0] grid grid-cols-2 gap-4">
                              {/* Buscar Objetivo */}
                              <div className="flex flex-col gap-1">
                                <div className="text-[#ff9900] font-semibold uppercase tracking-wide">
                                  Buscar Objetivo
                                </div>
                                <div className="text-[#555]">Inputs:</div>
                                <div>P<sub>lecap</sub> = {p.precio_lecap ?? "—"}</div>
                                <div>Flujo<sub>vto lecap</sub> = {p.flujo_vto_lecap ?? "—"}</div>
                                <div>P<sub>cer</sub> = {p.precio_cer ?? "—"}</div>
                                <div>VN<sub>cer</sub> = {p.vn_cer ?? "—"}</div>
                                <div>CER<sub>emision</sub> = {p.cer_emision ?? "—"}</div>
                                <div>CER<sub>actual</sub> = {bkvDebugData.cer_actual?.toFixed(4) ?? "—"}</div>
                                <div>Meses<sub>pend</sub> = {p.meses_pendientes?.toFixed(4) ?? "—"}</div>
                                <div className="text-[#555] mt-1">Cálculo:</div>
                                <div>
                                  R<sub>lecap</sub> = Flujo/P − 1
                                  <span className="text-[#ff9900] font-semibold">
                                    {" = "}{p.retorno_lecap != null ? `${(p.retorno_lecap * 100).toFixed(3)}%` : "—"}
                                  </span>
                                </div>
                                <div>
                                  factor = (1+R) × (P<sub>cer</sub> × CER<sub>emi</sub>) / (VN × CER<sub>act</sub>)
                                </div>
                                <div className="text-[#888]">
                                  {" = "}{p.factor_bo?.toFixed(6) ?? "—"}
                                </div>
                                <div>
                                  BE = factor^(1/meses) − 1
                                  <span className="text-[#00cc66] font-bold">
                                    {" = "}{bo != null ? `${(bo * 100).toFixed(3)}%` : "—"}
                                  </span>
                                </div>
                              </div>
                              {/* Fisher */}
                              <div className="flex flex-col gap-1">
                                <div className="text-[#888] font-semibold uppercase tracking-wide">
                                  Fisher (clásico)
                                </div>
                                <div className="text-[#555]">Inputs:</div>
                                <div>TEM = {p.tem_lecap != null ? `${(p.tem_lecap * 100).toFixed(4)}%` : "—"}</div>
                                <div>Paridad<sub>cer</sub> = {p.paridad_cer != null ? `${p.paridad_cer.toFixed(2)}%` : "—"}</div>
                                <div>Días = {p.dias}</div>
                                <div className="text-[#555] mt-1">Cálculo:</div>
                                <div>
                                  R = (1+TEM)^(días/30) − 1
                                  <span className="text-[#888]">
                                    {" = "}{p.retorno_fisher != null ? `${(p.retorno_fisher * 100).toFixed(3)}%` : "—"}
                                  </span>
                                </div>
                                <div>
                                  π = (1+R) × (paridad/100) − 1
                                </div>
                                <div className="text-[#888]">
                                  {" = "}{p.inflacion_fisher != null ? `${(p.inflacion_fisher * 100).toFixed(3)}%` : "—"}
                                </div>
                                <div>
                                  BE = (1+π)^(30/días) − 1
                                  <span className="text-[#888] font-semibold">
                                    {" = "}{fisher != null ? `${(fisher * 100).toFixed(3)}%` : "—"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </CheckPanel>

      <CheckPanel title="Check Tasa Fija — estado de instrumentos en AuM">
        <RunBtn onClick={runTf} loading={tfLoading} />
        {tfData && (
          <>
            <div className="flex items-center gap-3 mb-2 text-[10px] font-mono">
              <span className="text-[#555555]">Snapshot: {tfData.snapshot ?? "—"}</span>
              <span style={{ color: "#00cc66" }}>✅ {tfData.ok}</span>
              <span style={{ color: "#ff9900" }}>⚠️ {tfData.sin_posicion}</span>
              <span style={{ color: "#ff3333" }}>❌ {tfData.sin_assets}</span>
            </div>
            <table><thead><tr><th>TICKER</th><th>ESTADO</th></tr></thead>
              <tbody>{tfData.instrumentos.map(r => (
                <tr key={r.ticker}>
                  <td className="text-[#ff9900]">{r.ticker}</td>
                  <td className={r.estado === "ok" ? "text-[#00cc66]" : r.estado === "sin_posicion" ? "text-[#ff9900]" : "text-[#ff3333]"}>
                    {ESTADO_LABEL[r.estado] ?? r.estado}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </>
        )}
      </CheckPanel>

      <CheckPanel title="Debug Forward — cálculo paso a paso entre dos instrumentos">
        <div className="flex items-center gap-2 mb-2">
          <select value={tcA} onChange={e => setTcA(e.target.value)}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#ff9900] text-[10px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none">
            {tickers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-[#555555] text-[10px]">→</span>
          <select value={tcB} onChange={e => setTcB(e.target.value)}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#ff9900] text-[10px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none">
            {tickers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={runDbf} disabled={dbfLoading || tcA === tcB}
            className="px-3 py-1 text-[10px] font-semibold border border-[#2a2a2a] text-[#555555] hover:border-[#ff9900] hover:text-[#ff9900] transition-colors disabled:opacity-40">
            {dbfLoading ? "Calculando…" : "Calcular"}
          </button>
        </div>
        {dbfData && (
          <>
            {dbfData.error ? (
              <p className="text-[#ff3333] text-[10px]">{dbfData.error}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  {[{ tc: dbfData.tc_a, tea: dbfData.tea_a, dur: dbfData.duration_a, ts: dbfData.ts_a },
                    { tc: dbfData.tc_b, tea: dbfData.tea_b, dur: dbfData.duration_b, ts: dbfData.ts_b }].map(x => (
                    <div key={x.tc} className="border border-[#1a1a1a] p-2">
                      <div className="text-[11px] font-semibold text-[#ff9900]">{x.tc}</div>
                      <div className="text-[10px] font-mono text-[#d0d0d0]">TEA: {x.tea != null ? `${(x.tea * 100).toFixed(4)}%` : "—"}</div>
                      <div className="text-[10px] font-mono text-[#808080]">Duration: {x.dur?.toFixed(6) ?? "—"}</div>
                      <div className="text-[9px] text-[#555555]">{x.ts ?? ""}</div>
                    </div>
                  ))}
                </div>
                {dbfData.forward != null && (
                  <div className="text-[14px] font-semibold text-[#00cc66] font-mono mb-2">
                    Forward {dbfData.tc_a} → {dbfData.tc_b}: {dbfData.forward.toFixed(4)}%
                  </div>
                )}
                <table><thead><tr><th>PASO</th><th className="text-right">VALOR</th></tr></thead>
                  <tbody>{dbfData.pasos.map((p, i) => (
                    <tr key={i}><td className="text-[#808080]">{p.paso}</td><td className="text-right font-mono">{p.valor}</td></tr>
                  ))}</tbody>
                </table>
              </>
            )}
          </>
        )}
      </CheckPanel>

      <CheckPanel title="Debug Soberano — cálculo paso a paso del YTM (GD30D / GD35D / GD38D)">
        <div className="flex items-center gap-2 mb-2">
          <select value={tcSob} onChange={e => setTcSob(e.target.value)}
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#ff9900] text-[10px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none">
            <option value="">— elegir ticker —</option>
            {tickers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={runSob} disabled={sobLoading || !tcSob}
            className="px-3 py-1 text-[10px] font-semibold border border-[#2a2a2a] text-[#555555] hover:border-[#ff9900] hover:text-[#ff9900] transition-colors disabled:opacity-40">
            {sobLoading ? "Calculando…" : "Calcular"}
          </button>
        </div>
        {sobError && <p className="text-[#ff3333] text-[10px] mb-2">{sobError}</p>}
        {sobData && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="border border-[#1a1a1a] p-2">
                <div className="text-[11px] font-semibold text-[#ff9900] mb-1">{sobData.instrumento.ticker_corto}</div>
                <div className="text-[10px] font-mono text-[#d0d0d0]">Ticker: {sobData.instrumento.ticker}</div>
                <div className="text-[10px] font-mono text-[#808080]">Tipo: {sobData.instrumento.tipo} · Curva: {sobData.instrumento.curva}</div>
                <div className="text-[10px] font-mono text-[#808080]">Emisión: {sobData.instrumento.fecha_emision}</div>
                <div className="text-[10px] font-mono text-[#808080]">Vencimiento: {sobData.instrumento.fecha_vencimiento}</div>
                <div className="text-[10px] font-mono text-[#808080]">VN: {sobData.instrumento.valor_nominal} · Flujos totales: {sobData.instrumento.flujos_total}</div>
              </div>
              <div className="border border-[#1a1a1a] p-2">
                <div className="text-[11px] font-semibold text-[#ff9900] mb-1">Precio</div>
                <div className="text-[10px] font-mono text-[#d0d0d0]">Último trade: {sobData.precio.ultimo_trade_ts ?? "—"}</div>
                <div className="text-[10px] font-mono text-[#d0d0d0]">Precio ROFEX: {sobData.precio.precio_rofex?.toFixed(4) ?? "—"}</div>
                <div className="text-[10px] font-mono text-[#808080]">MEP: {sobData.precio.mep?.toFixed(2) ?? "—"}</div>
                <div className="text-[10px] font-mono text-[#00cc66]">Precio USD: {sobData.precio.precio_usd?.toFixed(4) ?? "—"}</div>
                <div className="text-[10px] font-mono text-[#808080] mt-1">Settlement: {sobData.settlement}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="border border-[#00cc66]/30 bg-[#00cc66]/5 p-2 text-center">
                <div className="text-[9px] text-[#808080] uppercase tracking-wide">TEA (YTM)</div>
                <div className="text-[16px] font-semibold font-mono text-[#00cc66]">
                  {sobData.resultado.tea_pct != null ? `${sobData.resultado.tea_pct.toFixed(2)}%` : "—"}
                </div>
              </div>
              <div className="border border-[#1a1a1a] p-2 text-center">
                <div className="text-[9px] text-[#808080] uppercase tracking-wide">Duration</div>
                <div className="text-[16px] font-semibold font-mono text-[#d0d0d0]">
                  {sobData.resultado.duration?.toFixed(4) ?? "—"}
                </div>
              </div>
              <div className="border border-[#1a1a1a] p-2 text-center">
                <div className="text-[9px] text-[#808080] uppercase tracking-wide">Paridad</div>
                <div className="text-[16px] font-semibold font-mono text-[#d0d0d0]">
                  {sobData.resultado.paridad != null ? `${sobData.resultado.paridad.toFixed(2)}%` : "—"}
                </div>
              </div>
            </div>

            <div className="text-[10px] text-[#808080] mb-1">
              Flujos futuros ({sobData.flujos_futuros.length}) · Total USD: {sobData.total_flujos_usd.toFixed(2)}
            </div>
            <table><thead><tr>
              <th>FECHA</th>
              <th className="text-right">AMORT %</th>
              <th className="text-right">CUP s/RES</th>
              <th className="text-right">RES PREVIO %</th>
              <th className="text-right">MONTO USD</th>
            </tr></thead>
              <tbody>{sobData.flujos_futuros.map(f => (
                <tr key={f.fecha}>
                  <td className="text-[#d0d0d0]">{f.fecha}</td>
                  <td className="text-right font-mono">{f.amortizacion_pct.toFixed(2)}</td>
                  <td className="text-right font-mono">{f.cupon_sobre_residual.toFixed(4)}</td>
                  <td className="text-right font-mono">{f.residual_previo_pct.toFixed(2)}</td>
                  <td className="text-right font-mono text-[#00cc66]">{f.monto_usd.toFixed(4)}</td>
                </tr>
              ))}</tbody>
            </table>
          </>
        )}
      </CheckPanel>

    </div>
  );
}

type Tab =
  | "diagnostico"
  | "backfills"
  | "jobs"
  | "validaciones"
  | "asistente"
  | "recursos"
  | "logs"
  | "usuarios"
  | "roles";

export function ManagerView() {
  const [tab, setTab] = useState<Tab>("diagnostico");

  const tabs: { id: Tab; label: string }[] = [
    { id: "diagnostico",  label: "DIAGNÓSTICO"  },
    { id: "backfills",    label: "BACKFILLS"    },
    { id: "jobs",         label: "JOBS"         },
    { id: "validaciones", label: "VALIDACIONES" },
    { id: "recursos",     label: "RECURSOS"     },
    { id: "logs",         label: "LOGS"         },
    { id: "asistente",    label: "ASISTENTE"    },
    { id: "usuarios",     label: "USUARIOS"     },
    { id: "roles",        label: "ROLES Y PERMISOS" },
  ];

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
        <span className="text-[11px] font-semibold text-[#ff9900] tracking-widest mr-3">MANAGER</span>
        {tabs.map((t) => (
          <Pill key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "diagnostico"  && <TabDiagnostico />}
        {tab === "backfills"    && <TabBackfills />}
        {tab === "jobs"         && <JobsRunsPanel />}
        {tab === "validaciones" && <TabValidaciones />}
        {tab === "recursos"     && <RecursosPanel />}
        {tab === "logs"         && <LogsPanel />}
        {tab === "asistente"    && <AsistenteDashboard />}
        {tab === "usuarios"     && <UsuariosPanel />}
        {tab === "roles"        && <RolesPanel />}
      </div>
    </div>
  );
}
