"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Sub-paneles cargados on-demand (cada tab trae su JS al seleccionarse, en vez
// de bundlear los 16 en la carga inicial de /manager). ssr:false → son
// client-only (charts/fetches) y la page ya es force-dynamic. Turbopack exige
// que las options de dynamic() sean un objeto literal inline (no una variable).
function Loading() {
  return <div className="p-4 text-[11px] text-[var(--t-text-muted)]">Cargando…</div>;
}

const AsistenteDashboard = dynamic(() => import("./asistente-dashboard").then((m) => m.AsistenteDashboard), { ssr: false, loading: Loading });
const ChatView = dynamic(() => import("./chat-view").then((m) => m.ChatView), { ssr: false, loading: Loading });
const AunesaExplorarPanel = dynamic(() => import("./aunesa-explorar-panel").then((m) => m.AunesaExplorarPanel), { ssr: false, loading: Loading });
const AunesaAumPanel = dynamic(() => import("./aunesa-aum-panel").then((m) => m.AunesaAumPanel), { ssr: false, loading: Loading });
const AunesaPosicionPanel = dynamic(() => import("./aunesa-posicion-panel").then((m) => m.AunesaPosicionPanel), { ssr: false, loading: Loading });
const AunesaBoletosPanel = dynamic(() => import("./aunesa-boletos-panel").then((m) => m.AunesaBoletosPanel), { ssr: false, loading: Loading });
const JobsRunsPanel = dynamic(() => import("./jobs-runs-panel").then((m) => m.JobsRunsPanel), { ssr: false, loading: Loading });
const GruposPanel = dynamic(() => import("./grupos-panel").then((m) => m.GruposPanel), { ssr: false, loading: Loading });
const ComercialPanel = dynamic(() => import("./comercial-panel").then((m) => m.ComercialPanel), { ssr: false, loading: Loading });
const LogsPanel = dynamic(() => import("./logs-panel").then((m) => m.LogsPanel), { ssr: false, loading: Loading });
const ManagerDebugXirrPanel = dynamic(() => import("./manager-debug-xirr").then((m) => m.ManagerDebugXirrPanel), { ssr: false, loading: Loading });
const ManagerDebugSegmentoPanel = dynamic(() => import("./manager-debug-segmento").then((m) => m.ManagerDebugSegmentoPanel), { ssr: false, loading: Loading });
const ManagerDebugComercialPanel = dynamic(() => import("./manager-debug-comercial").then((m) => m.ManagerDebugComercialPanel), { ssr: false, loading: Loading });
const RecursosPanel = dynamic(() => import("./recursos-panel").then((m) => m.RecursosPanel), { ssr: false, loading: Loading });
const RolesPanel = dynamic(() => import("./roles-panel").then((m) => m.RolesPanel), { ssr: false, loading: Loading });
const UsuariosPanel = dynamic(() => import("./usuarios-panel").then((m) => m.UsuariosPanel), { ssr: false, loading: Loading });

// ── Types ─────────────────────────────────────────────────────────────────────

interface CurvaDebugResp {
  ok: boolean;
  message?: string;
  instrumento?: {
    ticker: string; ticker_corto: string; curva: string;
    fecha_emision: string; fecha_vencimiento: string | null;
    valor_nominal: number; cer_emision: number | null; n_flujos: number;
  };
  trade?: {
    timestamp: string | null; price: number;
    TEA_persistido: number | null; TEM_persistido: number | null;
    duration_persistido: number | null; mod_duration_persistido: number | null;
    convexity_persistido: number | null; paridad_persistido: number | null;
  };
  settlement?: {
    fecha_trade: string; fecha_settlement: string;
    dias_a_vto_trade: number; dias_a_vto_settle: number; regla: string;
  };
  cer_info?: { cer_emision: number; cer_liq: number; ratio: number } | null;
  tc_info?: { fuente: string; valor: number | null; precio_usd?: number } | null;
  flujos_futuros?: { fecha: string; monto: number; raw: Record<string, unknown> }[];
  cashflow_xirr?: { fecha: string; monto: number; concepto: string }[];
  calculado?: {
    TEA?: number; TEM?: number; duration?: number;
    mod_duration?: number; convexity?: number; paridad?: number;
  };
  diff?: Record<string, string>;
  error_calc?: string | null;
}

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
        active ? "bg-[var(--t-accent)] text-black border-[var(--t-accent)]"
               : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}>
      {label}
    </button>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0">
      <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">{title}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="h-full min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col overflow-hidden">
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
    <div className="h-full flex flex-col gap-3 p-3 min-h-0">
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-[11px] font-semibold ${data?.en_rueda ? "text-[#00cc66]" : "text-[var(--t-text-muted)]"}`}>
          {data ? (data.en_rueda ? "● EN RUEDA" : "● FUERA DE RUEDA") : "—"}
        </span>
        <span className="text-[10px] text-[var(--t-text-muted)]">{data?.ahora_ar ?? ""}</span>
        <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">Chequeado: {lastCheck} · auto 10s</span>
      </div>

      {/* Izq 50% (full height): motores · Der 50%: apis arriba / jobs abajo */}
      <div className="flex-1 min-h-0 flex gap-3">
        <div className="w-1/2 min-h-0">
          <Panel title="MOTORES (TIEMPO REAL)">
            <table>
              <thead><tr><th>MOTOR</th><th>ÚLTIMA ACTUALIZACIÓN</th><th>HACE</th><th>UMBRAL</th><th>ESTADO</th></tr></thead>
              <tbody>
                {(data?.motores ?? []).map((m) => (
                  <tr key={m.nombre}>
                    <td className="text-[var(--t-text)] font-semibold">{m.nombre}</td>
                    <td className="font-mono">{m.ultima ?? "—"}</td>
                    <td className="font-mono text-[var(--t-text-dim)]">{m.hace}</td>
                    <td className="font-mono text-[var(--t-text-muted)]">{m.umbral}s</td>
                    <td><Badge estado={m.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <div className="w-1/2 min-h-0 flex flex-col gap-3">
          <div className="flex-1 min-h-0">
            <Panel title="APIS EXTERNAS (FUENTES DE DATOS)">
              <table>
                <thead><tr><th>FUENTE</th><th>ÚLTIMO DATO</th><th>HACE</th><th>CADENCIA</th><th>UMBRAL</th><th>ESTADO</th></tr></thead>
                <tbody>
                  {(data?.apis ?? []).map((a) => (
                    <tr key={a.nombre}>
                      <td className="text-[var(--t-text)] font-semibold">{a.nombre}</td>
                      <td className="font-mono">{a.ultimo ?? "—"}</td>
                      <td className="font-mono text-[var(--t-text-dim)]">{a.hace}</td>
                      <td className="text-[var(--t-text-muted)]">{a.cadencia}</td>
                      <td className="font-mono text-[var(--t-text-muted)]">{a.umbral ?? "—"}</td>
                      <td><Badge estado={a.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>

          <div className="flex-1 min-h-0">
            <Panel title="JOBS (PERIÓDICOS)">
              <table>
                <thead><tr><th>JOB</th><th>ÚLTIMO DATO</th><th>HACE</th><th>FRECUENCIA</th><th>ESTADO</th></tr></thead>
                <tbody>
                  {(data?.jobs ?? []).map((j) => (
                    <tr key={j.nombre}>
                      <td className="text-[var(--t-text)] font-semibold">{j.nombre}</td>
                      <td className="font-mono">{j.ultimo ?? "—"}</td>
                      <td className="font-mono text-[var(--t-text-dim)]">{j.hace}</td>
                      <td className="text-[var(--t-text-muted)]">{j.frecuencia}</td>
                      <td><Badge estado={j.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </div>
        </div>
      </div>
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
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
          Opciones — vencimientos a trackear
        </span>
        <span className="text-[9px] text-[var(--t-text-muted)]">
          (engine aplica en el próximo chequeo ~5 min)
        </span>
        {data?.actualizado && (
          <span className="ml-auto text-[9px] text-[var(--t-text-muted)] font-mono">
            disponibles actualizados: {data.actualizado}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {!data ? (
          <div className="text-[10px] text-[var(--t-text-muted)] font-mono">Cargando…</div>
        ) : data.disponibles.length === 0 ? (
          <div className="text-[10px] text-[var(--t-accent)] font-mono">
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
                        ? "bg-[var(--t-accent)] text-black border-[var(--t-accent)]"
                        : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
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
                className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-black transition-colors disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Guardar selección"}
              </button>
              <button
                onClick={volverAuto}
                disabled={saving}
                className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
              >
                Volver a auto-pick
              </button>
              <span className="text-[10px] font-mono text-[var(--t-text-dim)]">
                estado actual:{" "}
                {data.auto_pick ? (
                  <span className="text-[#00cc66]">AUTO (próximo &gt; hoy)</span>
                ) : (
                  <span className="text-[var(--t-accent)]">
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



// ── Main view ─────────────────────────────────────────────────────────────────

// ── Tab: Validaciones ─────────────────────────────────────────────────────────

function CheckPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--t-surface)] transition-colors">
        <span className="text-[10px] text-[var(--t-text-muted)]">{open ? "▾" : "▸"}</span>
        <span className="text-[11px] font-semibold text-[var(--t-text)]">{title}</span>
      </button>
      {open && <div className="border-t border-[var(--t-border)] p-3">{children}</div>}
    </div>
  );
}

function RunBtn({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40 mb-2">
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

function d10(s?: string | null): string {
  return s ? String(s).slice(0, 10) : "—";
}

interface PivotVela { fecha: string; high: number | null; low: number | null; close: number | null; }
interface PivotFrame {
  label: string;
  rango_desde: string;
  rango_hasta: string;
  n_velas: number;
  velas: PivotVela[];
  ok: boolean;
  motivo?: string;
  h?: { valor: number; fecha: string };
  l?: { valor: number; fecha: string };
  c?: { valor: number; fecha: string };
  formula?: { paso: string; valor: string }[];
  levels?: { pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number };
}
interface PivotDebugResp {
  ticker: string;
  last: number | null;
  last_fecha: string | null;
  frames: { diario: PivotFrame; semanal: PivotFrame; mensual: PivotFrame; anual: PivotFrame };
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

  // Debug TEA Curvas (renta fija)
  const [curvaTickerInput, setCurvaTickerInput] = useState("");
  const [curvaLoading, setCurvaLoading] = useState(false);
  const [curvaData, setCurvaData] = useState<CurvaDebugResp | null>(null);

  // Debug TNA Futuros DLR
  const [tnaLoading, setTnaLoading] = useState(false);
  const [tnaData, setTnaData] = useState<{
    spot: { valor: number | null; fuente: string | null };
    filas: {
      ticker: string; vto: string; dias: number;
      bid: number | null; last: number | null; offer: number | null; mid_book: number | null;
      directo_last: number | null; tna_lineal_last: number | null; tea_compuesta_last: number | null;
      tna_lineal_mid: number | null; tea_compuesta_mid: number | null;
      tna_persistida: number | null;
    }[];
    total: number;
    nota: string;
  } | null>(null);

  // Debug Pivot Points
  const [pvTicker, setPvTicker] = useState("");
  const [pvLoading, setPvLoading] = useState(false);
  const [pvData, setPvData] = useState<PivotDebugResp | null>(null);

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
  const runTna = () => {
    setTnaLoading(true);
    fetch("/api/manager/checks/debug-tna-futuros")
      .then(r => r.json()).then(setTnaData).finally(() => setTnaLoading(false));
  };
  const runPv = () => {
    if (!pvTicker.trim()) return;
    setPvLoading(true);
    fetch(`/api/manager/checks/debug-pivot?ticker=${encodeURIComponent(pvTicker.trim())}`)
      .then(r => r.json()).then(setPvData).finally(() => setPvLoading(false));
  };
  const runCurva = () => {
    if (!curvaTickerInput.trim()) return;
    setCurvaLoading(true);
    fetch(`/api/manager/checks/debug-curva-tea?ticker=${encodeURIComponent(curvaTickerInput.trim())}`)
      .then(r => r.json()).then(setCurvaData).finally(() => setCurvaLoading(false));
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

      <ManagerDebugComercialPanel />

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
                  <tr key={t.ticker}><td className="text-[var(--t-accent)]">{t.ticker}</td><td className="text-right font-mono">{t.pendientes.toLocaleString()}</td></tr>
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
              <span className="text-[11px] font-semibold text-[var(--t-text)]">{curva.curva.toUpperCase()}</span>
              <StatusBadge ok={curva.live_ok} label={curva.live_ok ? "ForwardsLive OK" : "ForwardsLive difiere"} />
            </div>
            <table><thead><tr><th>TICKER</th><th>VTO.</th><th className="text-right">TEA</th><th className="text-right">DURATION</th><th>ÚLTIMO</th><th>ESTADO</th></tr></thead>
              <tbody>{curva.tickers.map(t => (
                <tr key={t.ticker}>
                  <td className="text-[var(--t-accent)]">{t.ticker}</td>
                  <td className="text-[var(--t-text-dim)]">{t.vto}</td>
                  <td className="text-right font-mono">{t.tea != null ? `${t.tea.toFixed(2)}%` : "—"}</td>
                  <td className="text-right font-mono">{t.duration != null ? t.duration.toFixed(3) : "—"}</td>
                  <td className="text-[var(--t-text-dim)]">{t.ultimo ?? "—"}</td>
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
            <div className="text-[10px] text-[var(--t-text-muted)] mb-2">
              CER más reciente: {cerData.cer_reciente ?? "—"} · Días hábiles: {cerData.dias_habiles}
            </div>
            <table><thead><tr><th>TICKER</th><th>ÚLTIMO TRADE</th><th>SETTLEMENT</th><th>CER FECHA</th><th className="text-right">CER VALOR</th><th className="text-right">RATIO</th><th className="text-right">PARIDAD</th></tr></thead>
              <tbody>{cerData.instrumentos.map(r => (
                <tr key={r.ticker}>
                  <td className="text-[var(--t-accent)]">{r.ticker}</td>
                  <td className="text-[var(--t-text-dim)] font-mono">{r.ultimo_trade ?? "—"}</td>
                  <td className="text-[var(--t-text-dim)]">{r.settlement ?? "—"}</td>
                  <td className="text-[var(--t-text-dim)]">{r.cer_fecha ?? "—"}</td>
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
            <div className="text-[10px] text-[var(--t-text-muted)] font-mono mb-2">
              CER publicado más reciente:{" "}
              <span className="text-[var(--t-accent)]">{bkvDebugData.fecha_cer_max ?? "—"}</span>
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
                        className="cursor-pointer hover:bg-[var(--t-accent)]/10"
                      >
                        <td className="text-[var(--t-accent)]">{p.lecap}</td>
                        <td className="text-[var(--t-text-dim)]">{p.cer}</td>
                        <td className="text-right text-[var(--t-text-dim)] font-mono">{p.dias}</td>
                        <td className="text-right font-mono">
                          {p.meses_pendientes != null ? p.meses_pendientes.toFixed(3) : "—"}
                        </td>
                        <td className="text-right font-bold font-mono text-[var(--t-accent)]">
                          {bo != null ? `${(bo * 100).toFixed(2)}%` : "—"}
                        </td>
                        <td className="text-right font-mono text-[var(--t-text-dim)]">
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
                          <td colSpan={7} className="!py-2 !px-3 bg-[#0a0a0a] border-l-2 border-l-[var(--t-accent)]">
                            <div className="font-mono text-[10px] text-[var(--t-text)] grid grid-cols-2 gap-4">
                              {/* Buscar Objetivo */}
                              <div className="flex flex-col gap-1">
                                <div className="text-[var(--t-accent)] font-semibold uppercase tracking-wide">
                                  Buscar Objetivo
                                </div>
                                <div className="text-[var(--t-text-muted)]">Inputs:</div>
                                <div>P<sub>lecap</sub> = {p.precio_lecap ?? "—"}</div>
                                <div>Flujo<sub>vto lecap</sub> = {p.flujo_vto_lecap ?? "—"}</div>
                                <div>P<sub>cer</sub> = {p.precio_cer ?? "—"}</div>
                                <div>VN<sub>cer</sub> = {p.vn_cer ?? "—"}</div>
                                <div>CER<sub>emision</sub> = {p.cer_emision ?? "—"}</div>
                                <div>CER<sub>actual</sub> = {bkvDebugData.cer_actual?.toFixed(4) ?? "—"}</div>
                                <div>Meses<sub>pend</sub> = {p.meses_pendientes?.toFixed(4) ?? "—"}</div>
                                <div className="text-[var(--t-text-muted)] mt-1">Cálculo:</div>
                                <div>
                                  R<sub>lecap</sub> = Flujo/P − 1
                                  <span className="text-[var(--t-accent)] font-semibold">
                                    {" = "}{p.retorno_lecap != null ? `${(p.retorno_lecap * 100).toFixed(3)}%` : "—"}
                                  </span>
                                </div>
                                <div>
                                  factor = (1+R) × (P<sub>cer</sub> × CER<sub>emi</sub>) / (VN × CER<sub>act</sub>)
                                </div>
                                <div className="text-[var(--t-text-dim)]">
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
                                <div className="text-[var(--t-text-dim)] font-semibold uppercase tracking-wide">
                                  Fisher (clásico)
                                </div>
                                <div className="text-[var(--t-text-muted)]">Inputs:</div>
                                <div>TEM = {p.tem_lecap != null ? `${(p.tem_lecap * 100).toFixed(4)}%` : "—"}</div>
                                <div>Paridad<sub>cer</sub> = {p.paridad_cer != null ? `${p.paridad_cer.toFixed(2)}%` : "—"}</div>
                                <div>Días = {p.dias}</div>
                                <div className="text-[var(--t-text-muted)] mt-1">Cálculo:</div>
                                <div>
                                  R = (1+TEM)^(días/30) − 1
                                  <span className="text-[var(--t-text-dim)]">
                                    {" = "}{p.retorno_fisher != null ? `${(p.retorno_fisher * 100).toFixed(3)}%` : "—"}
                                  </span>
                                </div>
                                <div>
                                  π = (1+R) × (paridad/100) − 1
                                </div>
                                <div className="text-[var(--t-text-dim)]">
                                  {" = "}{p.inflacion_fisher != null ? `${(p.inflacion_fisher * 100).toFixed(3)}%` : "—"}
                                </div>
                                <div>
                                  BE = (1+π)^(30/días) − 1
                                  <span className="text-[var(--t-text-dim)] font-semibold">
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
              <span className="text-[var(--t-text-muted)]">Snapshot: {tfData.snapshot ?? "—"}</span>
              <span style={{ color: "#00cc66" }}>✅ {tfData.ok}</span>
              <span style={{ color: "#ff9900" }}>⚠️ {tfData.sin_posicion}</span>
              <span style={{ color: "#ff3333" }}>❌ {tfData.sin_assets}</span>
            </div>
            <table><thead><tr><th>TICKER</th><th>ESTADO</th></tr></thead>
              <tbody>{tfData.instrumentos.map(r => (
                <tr key={r.ticker}>
                  <td className="text-[var(--t-accent)]">{r.ticker}</td>
                  <td className={r.estado === "ok" ? "text-[#00cc66]" : r.estado === "sin_posicion" ? "text-[var(--t-accent)]" : "text-[#ff3333]"}>
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
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-accent)] text-[10px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none">
            {tickers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-[var(--t-text-muted)] text-[10px]">→</span>
          <select value={tcB} onChange={e => setTcB(e.target.value)}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-accent)] text-[10px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none">
            {tickers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={runDbf} disabled={dbfLoading || tcA === tcB}
            className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
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
                    <div key={x.tc} className="border border-[var(--t-border)] p-2">
                      <div className="text-[11px] font-semibold text-[var(--t-accent)]">{x.tc}</div>
                      <div className="text-[10px] font-mono text-[var(--t-text)]">TEA: {x.tea != null ? `${(x.tea * 100).toFixed(4)}%` : "—"}</div>
                      <div className="text-[10px] font-mono text-[var(--t-text-dim)]">Duration: {x.dur?.toFixed(6) ?? "—"}</div>
                      <div className="text-[9px] text-[var(--t-text-muted)]">{x.ts ?? ""}</div>
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
                    <tr key={i}><td className="text-[var(--t-text-dim)]">{p.paso}</td><td className="text-right font-mono">{p.valor}</td></tr>
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
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-accent)] text-[10px] px-2 py-1 font-mono focus:border-[var(--t-accent)] outline-none">
            <option value="">— elegir ticker —</option>
            {tickers.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button onClick={runSob} disabled={sobLoading || !tcSob}
            className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
            {sobLoading ? "Calculando…" : "Calcular"}
          </button>
        </div>
        {sobError && <p className="text-[#ff3333] text-[10px] mb-2">{sobError}</p>}
        {sobData && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="border border-[var(--t-border)] p-2">
                <div className="text-[11px] font-semibold text-[var(--t-accent)] mb-1">{sobData.instrumento.ticker_corto}</div>
                <div className="text-[10px] font-mono text-[var(--t-text)]">Ticker: {sobData.instrumento.ticker}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)]">Tipo: {sobData.instrumento.tipo} · Curva: {sobData.instrumento.curva}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)]">Emisión: {sobData.instrumento.fecha_emision}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)]">Vencimiento: {sobData.instrumento.fecha_vencimiento}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)]">VN: {sobData.instrumento.valor_nominal} · Flujos totales: {sobData.instrumento.flujos_total}</div>
              </div>
              <div className="border border-[var(--t-border)] p-2">
                <div className="text-[11px] font-semibold text-[var(--t-accent)] mb-1">Precio</div>
                <div className="text-[10px] font-mono text-[var(--t-text)]">Último trade: {sobData.precio.ultimo_trade_ts ?? "—"}</div>
                <div className="text-[10px] font-mono text-[var(--t-text)]">Precio ROFEX: {sobData.precio.precio_rofex?.toFixed(4) ?? "—"}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)]">MEP: {sobData.precio.mep?.toFixed(2) ?? "—"}</div>
                <div className="text-[10px] font-mono text-[#00cc66]">Precio USD: {sobData.precio.precio_usd?.toFixed(4) ?? "—"}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)] mt-1">Settlement: {sobData.settlement}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="border border-[#00cc66]/30 bg-[#00cc66]/5 p-2 text-center">
                <div className="text-[9px] text-[var(--t-text-dim)] uppercase tracking-wide">TEA (YTM)</div>
                <div className="text-[16px] font-semibold font-mono text-[#00cc66]">
                  {sobData.resultado.tea_pct != null ? `${sobData.resultado.tea_pct.toFixed(2)}%` : "—"}
                </div>
              </div>
              <div className="border border-[var(--t-border)] p-2 text-center">
                <div className="text-[9px] text-[var(--t-text-dim)] uppercase tracking-wide">Duration</div>
                <div className="text-[16px] font-semibold font-mono text-[var(--t-text)]">
                  {sobData.resultado.duration?.toFixed(4) ?? "—"}
                </div>
              </div>
              <div className="border border-[var(--t-border)] p-2 text-center">
                <div className="text-[9px] text-[var(--t-text-dim)] uppercase tracking-wide">Paridad</div>
                <div className="text-[16px] font-semibold font-mono text-[var(--t-text)]">
                  {sobData.resultado.paridad != null ? `${sobData.resultado.paridad.toFixed(2)}%` : "—"}
                </div>
              </div>
            </div>

            <div className="text-[10px] text-[var(--t-text-dim)] mb-1">
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
                  <td className="text-[var(--t-text)]">{f.fecha}</td>
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

      <CheckPanel title="Debug TEA Curvas (renta fija — tasa_fija / cer / soberanos / dolar_linked)">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={curvaTickerInput}
            onChange={(e) => setCurvaTickerInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runCurva(); }}
            placeholder="ticker_corto (ej: TX26, AL30D, T15E7, S30M6)"
            className="flex-1 max-w-[280px] bg-black border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
          />
          <button
            onClick={runCurva}
            disabled={curvaLoading || !curvaTickerInput.trim()}
            className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
          >
            {curvaLoading ? "Calculando…" : "▶ Ejecutar"}
          </button>
        </div>

        {curvaData && !curvaData.ok && (
          <div className="text-[10px] text-[#ff7f7f] italic">{curvaData.message}</div>
        )}

        {curvaData?.ok && curvaData.instrumento && curvaData.trade && (
          <div className="space-y-3">
            {/* Instrumento + trade */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
              <div className="border border-[var(--t-border)] p-2">
                <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">INSTRUMENTO</div>
                <div className="font-mono space-y-0.5">
                  <div><span className="text-[var(--t-text-muted)]">ticker</span> <span className="text-[var(--t-accent)]">{curvaData.instrumento.ticker_corto}</span> <span className="text-[var(--t-text-muted)]">({curvaData.instrumento.curva})</span></div>
                  <div><span className="text-[var(--t-text-muted)]">vto</span> {curvaData.instrumento.fecha_vencimiento ?? "—"}</div>
                  <div><span className="text-[var(--t-text-muted)]">VN</span> {curvaData.instrumento.valor_nominal}</div>
                  {curvaData.instrumento.cer_emision !== null && (
                    <div><span className="text-[var(--t-text-muted)]">cer_emision</span> {curvaData.instrumento.cer_emision}</div>
                  )}
                  <div><span className="text-[var(--t-text-muted)]">flujos en JSON</span> {curvaData.instrumento.n_flujos}</div>
                </div>
              </div>
              <div className="border border-[var(--t-border)] p-2">
                <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">ÚLTIMO TRADE (TimeSales)</div>
                <div className="font-mono space-y-0.5">
                  <div><span className="text-[var(--t-text-muted)]">ts</span> {curvaData.trade.timestamp ? new Date(curvaData.trade.timestamp).toLocaleString("es-AR") : "—"}</div>
                  <div><span className="text-[var(--t-text-muted)]">price</span> <span className="text-[var(--t-text)]">{curvaData.trade.price.toFixed(3)}</span></div>
                  <div><span className="text-[var(--t-text-muted)]">TEA persistido</span> <span className="text-[var(--t-accent)]">{curvaData.trade.TEA_persistido !== null ? `${(curvaData.trade.TEA_persistido * 100).toFixed(4)}%` : "—"}</span></div>
                  <div><span className="text-[var(--t-text-muted)]">duration persistido</span> {curvaData.trade.duration_persistido?.toFixed(4) ?? "—"}</div>
                  <div><span className="text-[var(--t-text-muted)]">paridad persistido</span> {curvaData.trade.paridad_persistido?.toFixed(2) ?? "—"}{curvaData.trade.paridad_persistido !== null && "%"}</div>
                </div>
              </div>
            </div>

            {/* Settlement + CER/TC */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px]">
              {curvaData.settlement && (
                <div className="border border-[var(--t-border)] p-2">
                  <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">SETTLEMENT</div>
                  <div className="font-mono space-y-0.5">
                    <div><span className="text-[var(--t-text-muted)]">fecha trade</span> {curvaData.settlement.fecha_trade}</div>
                    <div><span className="text-[var(--t-text-muted)]">fecha settle</span> <span className="text-[#3fbf6f]">{curvaData.settlement.fecha_settlement}</span></div>
                    <div><span className="text-[var(--t-text-muted)]">días al vto (trade)</span> {curvaData.settlement.dias_a_vto_trade}</div>
                    <div><span className="text-[var(--t-text-muted)]">días al vto (settle)</span> {curvaData.settlement.dias_a_vto_settle}</div>
                    <div className="text-[var(--t-text-muted)] text-[9px] italic mt-1">{curvaData.settlement.regla}</div>
                  </div>
                </div>
              )}
              {curvaData.cer_info && (
                <div className="border border-[var(--t-border)] p-2">
                  <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">CER (T-10 hábiles del settlement)</div>
                  <div className="font-mono space-y-0.5">
                    <div><span className="text-[var(--t-text-muted)]">CER emisión</span> {curvaData.cer_info.cer_emision.toFixed(4)}</div>
                    <div><span className="text-[var(--t-text-muted)]">CER liquidación</span> {curvaData.cer_info.cer_liq.toFixed(4)}</div>
                    <div><span className="text-[var(--t-text-muted)]">ratio (CER_liq / CER_em)</span> <span className="text-[var(--t-accent)]">{curvaData.cer_info.ratio.toFixed(6)}</span></div>
                  </div>
                </div>
              )}
              {curvaData.tc_info && (
                <div className="border border-[var(--t-border)] p-2">
                  <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">TC ({curvaData.tc_info.fuente})</div>
                  <div className="font-mono space-y-0.5">
                    <div><span className="text-[var(--t-text-muted)]">valor</span> {curvaData.tc_info.valor?.toFixed(4) ?? "—"}</div>
                    {curvaData.tc_info.precio_usd !== undefined && (
                      <div><span className="text-[var(--t-text-muted)]">precio_usd</span> <span className="text-[#3fbf6f]">{curvaData.tc_info.precio_usd.toFixed(6)}</span></div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Cashflow para XIRR */}
            {curvaData.cashflow_xirr && curvaData.cashflow_xirr.length > 0 && (
              <div className="border border-[var(--t-border)] p-2">
                <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest mb-1">CASHFLOW XIRR ({curvaData.cashflow_xirr.length})</div>
                <table className="w-full text-[10px] font-mono">
                  <thead className="text-[var(--t-text-muted)] text-[9px]">
                    <tr><th className="text-left">FECHA</th><th className="text-left">CONCEPTO</th><th className="text-right">MONTO</th></tr>
                  </thead>
                  <tbody>
                    {curvaData.cashflow_xirr.map((c, i) => (
                      <tr key={i}>
                        <td className="text-[var(--t-text-dim)]">{c.fecha}</td>
                        <td className="text-[var(--t-text-muted)]">{c.concepto}</td>
                        <td className={`text-right ${c.monto < 0 ? "text-[#ff7f7f]" : "text-[#3fbf6f]"}`}>{c.monto.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Resultado calculado vs persistido */}
            <div className="border border-[var(--t-accent)]/40 p-2">
              <div className="text-[9px] text-[var(--t-accent)] tracking-widest mb-1">RESULTADO CALCULADO vs PERSISTIDO</div>
              {curvaData.error_calc ? (
                <div className="text-[10px] text-[#ff7f7f] italic">⚠ {curvaData.error_calc}</div>
              ) : (
                <table className="w-full text-[10px] font-mono">
                  <thead className="text-[var(--t-text-muted)] text-[9px]">
                    <tr>
                      <th className="text-left">CAMPO</th>
                      <th className="text-right">CALCULADO</th>
                      <th className="text-right">PERSISTIDO</th>
                      <th className="text-right">DIFF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { k: "TEA",          c: curvaData.calculado?.TEA,          p: curvaData.trade.TEA_persistido,          pct: true },
                      { k: "TEM",          c: curvaData.calculado?.TEM,          p: curvaData.trade.TEM_persistido,          pct: true },
                      { k: "duration",     c: curvaData.calculado?.duration,     p: curvaData.trade.duration_persistido,     pct: false },
                      { k: "mod_duration", c: curvaData.calculado?.mod_duration, p: curvaData.trade.mod_duration_persistido, pct: false },
                      { k: "convexity",    c: curvaData.calculado?.convexity,    p: curvaData.trade.convexity_persistido,    pct: false },
                      { k: "paridad",      c: curvaData.calculado?.paridad,      p: curvaData.trade.paridad_persistido,      pct: false, suffix: "%" },
                    ].map((row) => {
                      const diff = curvaData.diff?.[row.k];
                      const diffOk = diff === "OK";
                      return (
                        <tr key={row.k} className="border-b border-[var(--t-border)]">
                          <td className="text-[var(--t-text)]">{row.k}</td>
                          <td className="text-right text-[#3fbf6f]">
                            {row.c !== undefined && row.c !== null
                              ? (row.pct ? `${(row.c * 100).toFixed(4)}%` : `${row.c.toFixed(4)}${row.suffix ?? ""}`)
                              : "—"}
                          </td>
                          <td className="text-right text-[var(--t-text-dim)]">
                            {row.p !== null && row.p !== undefined
                              ? (row.pct ? `${(row.p * 100).toFixed(4)}%` : `${row.p.toFixed(4)}${row.suffix ?? ""}`)
                              : "—"}
                          </td>
                          <td className={`text-right ${diffOk ? "text-[#3fbf6f]" : diff === "—" ? "text-[var(--t-text-muted)]" : "text-[var(--t-accent)]"}`}>{diff ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="text-[9px] text-[var(--t-text-muted)] mt-2 italic">
                Si DIFF ≠ OK, los inputs cambiaron desde que se persistió el trade (precio nuevo, CER nuevo, MEP nuevo, etc.). El motor reescribe TEA/duration cada 5s al detectar trade sin <code>duration</code>; trades viejos pueden tener valores estáticos del momento.
              </div>
            </div>
          </div>
        )}
      </CheckPanel>

      <CheckPanel title="Debug TNA Futuros DLR (TNA lineal vs TEA compuesta)">
        <RunBtn onClick={runTna} loading={tnaLoading} />
        {tnaData && tnaData.total === 0 && (
          <div className="text-[10px] text-[#ff7f7f] italic">
            {tnaData.nota || "Sin datos en FuturosDLRSnapshot."}
          </div>
        )}
        {tnaData && tnaData.total > 0 && (
          <>
            <div className="text-[10px] text-[var(--t-text-dim)] mb-2">
              Spot referencia: <span className="font-mono text-[var(--t-text)]">
                {tnaData.spot?.valor?.toFixed(2) ?? "—"}
              </span>{" "}
              <span className="text-[var(--t-text-muted)]">(fuente: {tnaData.spot?.fuente ?? "—"})</span>
              {" · "}{tnaData.total} outrights
            </div>
            <div className="text-[10px] text-[var(--t-text-dim)] mb-2 italic">{tnaData.nota}</div>
            <table className="w-full text-[10px] font-mono tabular-nums">
              <thead className="text-[var(--t-text-muted)] text-[9px] tracking-widest">
                <tr>
                  <th className="text-left">TICKER</th>
                  <th className="text-right">DÍAS</th>
                  <th className="text-right">LAST</th>
                  <th className="text-right">MID BOOK</th>
                  <th className="text-right">DIRECTO%</th>
                  <th className="text-right text-[#3fbf6f]">TNA LIN (last)</th>
                  <th className="text-right text-[var(--t-accent)]">TEA COMP (last)</th>
                  <th className="text-right text-[#3fbf6f]">TNA LIN (mid)</th>
                  <th className="text-right text-[var(--t-accent)]">TEA COMP (mid)</th>
                  <th className="text-right">PERSISTIDA</th>
                </tr>
              </thead>
              <tbody>
                {tnaData.filas.map((f) => (
                  <tr key={f.ticker} className="border-b border-[var(--t-border)]">
                    <td className="text-[var(--t-text)]">{f.ticker}</td>
                    <td className="text-right">{f.dias}</td>
                    <td className="text-right">{f.last?.toFixed(2) ?? "—"}</td>
                    <td className="text-right text-[var(--t-text-dim)]">{f.mid_book?.toFixed(2) ?? "—"}</td>
                    <td className="text-right">{f.directo_last?.toFixed(3) ?? "—"}%</td>
                    <td className="text-right text-[#3fbf6f]">
                      {f.tna_lineal_last?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="text-right text-[var(--t-accent)]">
                      {f.tea_compuesta_last?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="text-right text-[#3fbf6f]">
                      {f.tna_lineal_mid?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="text-right text-[var(--t-accent)]">
                      {f.tea_compuesta_mid?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="text-right text-[var(--t-text)] font-semibold">
                      {f.tna_persistida?.toFixed(2) ?? "—"}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[10px] text-[var(--t-text-muted)] mt-2">
              <span className="text-[#3fbf6f]">TNA LIN</span> = directo × 365/días (lineal — terminal Rofex){" "}
              · <span className="text-[var(--t-accent)]">TEA COMP</span> = (1+directo)^(365/días) − 1 (compuesta) ·{" "}
              <span className="text-[var(--t-text)]">PERSISTIDA</span> = lo que el motor escribe a Mongo (hoy = TEA COMP)
            </div>
          </>
        )}
      </CheckPanel>

      <CheckPanel title="Debug Pivot Points — velas y fechas usadas por timeframe">
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            value={pvTicker}
            onChange={(e) => setPvTicker(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") runPv(); }}
            placeholder="ticker (ej: NVDA, AAPL, KO)"
            className="flex-1 max-w-[280px] bg-black border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
          />
          <button
            onClick={runPv}
            disabled={pvLoading || !pvTicker.trim()}
            className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
          >
            {pvLoading ? "Calculando…" : "▶ Ejecutar"}
          </button>
        </div>

        {pvData && (
          <div className="space-y-3">
            <div className="text-[10px] text-[var(--t-text-dim)] font-mono">
              {pvData.ticker} · último close{" "}
              <span className="text-[var(--t-text)]">{pvData.last != null ? pvData.last.toFixed(4) : "—"}</span>
              {pvData.last_fecha && <span className="text-[var(--t-text-muted)]"> ({d10(pvData.last_fecha)})</span>}
            </div>

            {(["diario", "semanal", "mensual", "anual"] as const).map((k) => {
              const fr = pvData.frames[k];
              return (
                <div key={k} className="border border-[var(--t-border)] p-2">
                  <div className="text-[9px] text-[var(--t-accent)] tracking-widest mb-1">
                    {fr.label.toUpperCase()} — VENTANA {d10(fr.rango_desde)} → {d10(fr.rango_hasta)} · {fr.n_velas} VELAS
                  </div>
                  {!fr.ok ? (
                    <div className="text-[10px] text-[#ff7f7f] italic">{fr.motivo}</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="max-h-[260px] overflow-y-auto border border-[var(--t-border)]">
                        <table className="w-full text-[10px] font-mono">
                          <thead className="text-[var(--t-text-muted)] text-[9px] sticky top-0 bg-[var(--t-panel)]">
                            <tr>
                              <th className="text-left px-1">FECHA</th>
                              <th className="text-right px-1">HIGH</th>
                              <th className="text-right px-1">LOW</th>
                              <th className="text-right px-1">CLOSE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {fr.velas.map((v, i) => {
                              const esH = !!fr.h && v.fecha === fr.h.fecha;
                              const esL = !!fr.l && v.fecha === fr.l.fecha;
                              const esC = !!fr.c && v.fecha === fr.c.fecha;
                              return (
                                <tr key={i} className="border-b border-[var(--t-border)]">
                                  <td className="text-[var(--t-text-dim)] px-1">{d10(v.fecha)}</td>
                                  <td className={`text-right px-1 ${esH ? "text-[#3fbf6f] font-bold" : "text-[var(--t-text)]"}`}>
                                    {v.high != null ? v.high.toFixed(4) : "—"}{esH ? " ◄H" : ""}
                                  </td>
                                  <td className={`text-right px-1 ${esL ? "text-[#ff7f7f] font-bold" : "text-[var(--t-text)]"}`}>
                                    {v.low != null ? v.low.toFixed(4) : "—"}{esL ? " ◄L" : ""}
                                  </td>
                                  <td className={`text-right px-1 ${esC ? "text-[var(--t-accent)] font-bold" : "text-[var(--t-text)]"}`}>
                                    {v.close != null ? v.close.toFixed(4) : "—"}{esC ? " ◄C" : ""}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="text-[10px] font-mono text-[var(--t-text-dim)]">
                        H = <span className="text-[#3fbf6f]">{fr.h ? fr.h.valor.toFixed(4) : "—"}</span> ({d10(fr.h?.fecha)}) ·{" "}
                        L = <span className="text-[#ff7f7f]">{fr.l ? fr.l.valor.toFixed(4) : "—"}</span> ({d10(fr.l?.fecha)}) ·{" "}
                        C = <span className="text-[var(--t-accent)]">{fr.c ? fr.c.valor.toFixed(4) : "—"}</span> ({d10(fr.c?.fecha)})
                      </div>

                      <table className="w-full text-[10px] font-mono">
                        <tbody>
                          {(fr.formula ?? []).map((f, i) => (
                            <tr key={i} className="border-b border-[var(--t-border)]">
                              <td className="text-[var(--t-text-dim)] pr-3 whitespace-nowrap align-top">{f.paso}</td>
                              <td className="text-[var(--t-text)]">{f.valor}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {fr.levels && (
                        <div className="grid grid-cols-7 gap-1 text-[10px] font-mono text-center">
                          {([["S3", fr.levels.s3], ["S2", fr.levels.s2], ["S1", fr.levels.s1], ["PP", fr.levels.pp], ["R1", fr.levels.r1], ["R2", fr.levels.r2], ["R3", fr.levels.r3]] as [string, number][]).map(([lbl, val]) => (
                            <div key={lbl} className="border border-[var(--t-border)] py-1">
                              <div className="text-[8px] text-[var(--t-text-muted)]">{lbl}</div>
                              <div className={lbl === "PP" ? "text-[var(--t-accent)] font-bold" : "text-[var(--t-text)]"}>{val.toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CheckPanel>

    </div>
  );
}

// ── Tab: Assets ───────────────────────────────────────────────────────────────
// Vista dedicada del catálogo de instrumentos pyRofex agrupado por CFI code.
// Reemplaza al panel discovery que vivía dentro de Validaciones — acá hay más
// espacio + búsqueda para identificar productos antes de extender el motor.

interface CfiInstrument {
  ticker: string; maturity: string; underlying: string;
  currency?: string; tickSize?: number;
  contractMultiplier?: number;
  putOrCall?: string; strikePrice?: number;
  minTradeVol?: number; maxTradeVol?: number;
  lowLimitPrice?: number; highLimitPrice?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// TabAssets — edición de Valuaciones.Assets (fuente de verdad UPPERCASE).
// Lista TODO el catálogo de assets y permite editar los 7 campos
// in-place. Filtro `CAMPO VACÍO` para ver solo los que tienen un campo
// puntual sin completar. PATCH a /api/manager/assets escribe UPPERCASE.
// ─────────────────────────────────────────────────────────────────────────
type AssetGap = {
  unidad: string;
  CARTERA?: string | null;
  EMISOR?: string | null;
  INSTRUMENTO?: string | null;
  CLASE_ACTIVO?: string | null;
  CALIFICACION?: string | null;
  TICKER?: string | null;
  VENCIMIENTO?: string | null;
  actualizado_por?: string | null;
  actualizado_at?: string | null;
};

type RowState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; msg: string };

// Campos UPPERCASE editables — define el orden de columnas de la tabla.
const ASSET_CAMPOS = [
  "CARTERA", "EMISOR", "CLASE_ACTIVO", "CALIFICACION",
  "TICKER", "VENCIMIENTO", "INSTRUMENTO",
] as const;
type AssetCampo = (typeof ASSET_CAMPOS)[number];
type AssetDraft = Record<AssetCampo, string>;

// Campos de dropdown CERRADO: solo se eligen valores existentes, no se
// pueden tipear nuevos. El resto son inputs editables con datalist.
const ASSET_CAMPOS_CERRADOS: readonly AssetCampo[] = ["CARTERA", "CLASE_ACTIVO"];

function emptyDraft(): AssetDraft {
  return {
    CARTERA: "", EMISOR: "", CLASE_ACTIVO: "", CALIFICACION: "",
    TICKER: "", VENCIMIENTO: "", INSTRUMENTO: "",
  };
}
function emptyOpts(): Record<AssetCampo, string[]> {
  return {
    CARTERA: [], EMISOR: [], CLASE_ACTIVO: [], CALIFICACION: [],
    TICKER: [], VENCIMIENTO: [], INSTRUMENTO: [],
  };
}
function draftFromAsset(a: AssetGap): AssetDraft {
  const d = emptyDraft();
  for (const c of ASSET_CAMPOS) d[c] = (a[c] ?? "") as string;
  return d;
}

function TabAssets() {
  const [assets, setAssets] = useState<AssetGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [drafts, setDrafts] = useState<Record<string, AssetDraft>>({});
  // Valores únicos por campo (dropdown cerrado / datalist editable).
  const [valueOpts, setValueOpts] = useState<Record<AssetCampo, string[]>>(emptyOpts);
  // Filtros de la query backend.
  const [filtroCartera, setFiltroCartera] = useState<string>("");
  const [filtroEmisor, setFiltroEmisor] = useState<string>("");
  // "mostrar solo los que tienen este campo vacío". "" = sin filtro (todo).
  const [campoVacio, setCampoVacio] = useState<AssetCampo | "">("");

  const fetchAssets = () => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (filtroCartera) q.set("cartera", filtroCartera);
    if (filtroEmisor) q.set("emisor", filtroEmisor);
    if (campoVacio) q.set("campo_vacio", campoVacio);
    fetch(`/api/manager/assets?${q}`)
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} — ${txt.slice(0, 200) || r.statusText}`);
        }
        return r.json();
      })
      .then((d: { assets: AssetGap[] }) => {
        setAssets(d.assets || []);
        const initial: Record<string, AssetDraft> = {};
        for (const a of d.assets || []) initial[a.unidad] = draftFromAsset(a);
        setDrafts(initial);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch("/api/manager/assets/values")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { values?: Partial<Record<AssetCampo, string[]>>; carteras?: string[]; emisores?: string[] }) => {
        const opts = emptyOpts();
        for (const c of ASSET_CAMPOS) opts[c] = d.values?.[c] ?? [];
        // Fallback a los alias viejos si el backend no manda `values`.
        if (!d.values) {
          opts.CARTERA = d.carteras ?? [];
          opts.EMISOR = d.emisores ?? [];
        }
        setValueOpts(opts);
      })
      .catch(() => { /* silencioso — sin sugerencias el input sigue funcionando */ });
  }, []);

  // Re-fetch cuando cambian los filtros.
  useEffect(() => { fetchAssets(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filtroCartera, filtroEmisor, campoVacio]);

  const setDraftField = (unidad: string, field: AssetCampo, value: string) => {
    setDrafts((prev) => ({
      ...prev,
      [unidad]: { ...(prev[unidad] || emptyDraft()), [field]: value },
    }));
  };

  const saveRow = async (asset: AssetGap, draftOverride?: AssetDraft) => {
    const draft = draftOverride ?? drafts[asset.unidad];
    if (!draft) return;
    const payload: Record<string, string> = { unidad: asset.unidad };
    for (const c of ASSET_CAMPOS) {
      if (draft[c] !== ((asset[c] ?? "") as string)) payload[c] = draft[c];
    }
    // Si no hay nada que cambiar, no llama al backend.
    if (Object.keys(payload).length === 1) return;

    setRowState((s) => ({ ...s, [asset.unidad]: { kind: "saving" } }));
    try {
      // unidad va en el body, no en path — evita problemas de URL-encoding
      // con corchetes, espacios, slashes, etc.
      const r = await fetch(`/api/manager/assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        // Tratamos de parsear como JSON {detail: "..."} (FastAPI default).
        let detail = txt;
        try {
          const j = JSON.parse(txt);
          if (j && typeof j.detail === "string") detail = j.detail;
        } catch { /* texto plano */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      const updated: AssetGap = await r.json();
      setAssets((prev) => prev.map((a) => (a.unidad === asset.unidad ? updated : a)));
      setDrafts((prev) => ({ ...prev, [asset.unidad]: draftFromAsset(updated) }));
      // Sumar valores nuevos al pool de sugerencias para el resto de las filas
      // (sin re-fetch — merge local instantáneo).
      setValueOpts((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const c of ASSET_CAMPOS) {
          const v = (updated[c] ?? "") as string;
          if (v && v !== "NO APLICA" && !next[c].includes(v)) {
            next[c] = [...next[c], v].sort();
            changed = true;
          }
        }
        return changed ? next : prev;
      });
      setRowState((s) => ({ ...s, [asset.unidad]: { kind: "saved" } }));
      setTimeout(() => {
        setRowState((s) => ({ ...s, [asset.unidad]: { kind: "idle" } }));
      }, 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setRowState((s) => ({ ...s, [asset.unidad]: { kind: "error", msg } }));
    }
  };

  // Campos abiertos (input editable): datalist con valores existentes.
  // Los campos cerrados (CARTERA, CLASE_ACTIVO) van como <select> y no usan list.
  const camposAbiertos = ASSET_CAMPOS.filter((c) => !ASSET_CAMPOS_CERRADOS.includes(c));

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Datalists para autocomplete de los campos abiertos — via list="<campo>-options" */}
      {camposAbiertos.map((c) => (
        <datalist key={c} id={`${c}-options`}>
          {(valueOpts[c] || []).map((v) => <option key={v} value={v} />)}
        </datalist>
      ))}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">ASSETS</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">{assets.length} resultados</span>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CARTERA</span>
        <select
          value={filtroCartera}
          onChange={(e) => setFiltroCartera(e.target.value)}
          className="bg-black border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
        >
          <option value="">— todas —</option>
          {valueOpts.CARTERA.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">EMISOR</span>
        <select
          value={filtroEmisor}
          onChange={(e) => setFiltroEmisor(e.target.value)}
          className="bg-black border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
        >
          <option value="">— todos —</option>
          {valueOpts.EMISOR.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CAMPO VACÍO</span>
        <select
          value={campoVacio}
          onChange={(e) => setCampoVacio(e.target.value as AssetCampo | "")}
          className="bg-black border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
          title="Mostrar solo los assets con este campo sin completar"
        >
          <option value="">— sin filtro —</option>
          {ASSET_CAMPOS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <button
          onClick={fetchAssets}
          disabled={loading}
          className="ml-auto px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
        >
          {loading ? "Cargando…" : "↻ Recargar"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {error && <div className="p-3 text-[11px] text-red-400">Error: {error}</div>}
        {!error && loading && assets.length === 0 && (
          <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Cargando…</div>
        )}
        {!error && !loading && assets.length === 0 && (
          <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Sin resultados para el filtro actual.</div>
        )}
        {assets.length > 0 && (
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)]">
              <tr className="text-left text-[var(--t-text-dim)] tracking-widest text-[9px]">
                <th className="px-3 py-2">UNIDAD</th>
                {ASSET_CAMPOS.map((c) => <th key={c} className="px-2 py-2">{c}</th>)}
                <th className="px-3 py-2">EDITADO</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => {
                const draft = drafts[a.unidad] || emptyDraft();
                const state: RowState = rowState[a.unidad] || { kind: "idle" };
                const dirty = ASSET_CAMPOS.some((c) => draft[c] !== ((a[c] ?? "") as string));
                return (
                  <tr key={a.unidad} className="border-b border-[var(--t-border)] hover:bg-[#0c0c0c]">
                    <td
                      className="px-3 py-1.5 text-[var(--t-text)] whitespace-nowrap max-w-[280px] truncate"
                      title={a.unidad}
                    >
                      {a.unidad}
                    </td>
                    {ASSET_CAMPOS.map((c) => {
                      const cerrado = ASSET_CAMPOS_CERRADOS.includes(c);
                      return (
                        <td key={c} className="px-2 py-1.5">
                          {cerrado ? (
                            // Dropdown cerrado: solo valores existentes, sin tipear nuevos.
                            // Guarda al instante al elegir (no depende del blur del select).
                            <select
                              value={draft[c]}
                              onChange={(e) => {
                                const nd = { ...(drafts[a.unidad] || emptyDraft()), [c]: e.target.value };
                                setDraftField(a.unidad, c, e.target.value);
                                saveRow(a, nd);
                              }}
                              className="bg-black border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-full min-w-[90px]"
                            >
                              <option value="">—</option>
                              {/* Incluye el valor actual aunque no esté en la lista (placeholder viejo). */}
                              {(draft[c] && !valueOpts[c].includes(draft[c])
                                ? [draft[c], ...valueOpts[c]]
                                : valueOpts[c]
                              ).map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            // Campo abierto: input editable + datalist (flechita de sugerencias).
                            <input
                              type="text"
                              list={`${c}-options`}
                              value={draft[c]}
                              onChange={(e) => setDraftField(a.unidad, c, e.target.value)}
                              onBlur={() => saveRow(a)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                              placeholder="—"
                              className="bg-black border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-full min-w-[90px]"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-[var(--t-text-muted)] text-[10px] whitespace-nowrap">
                      {a.actualizado_at ? (
                        <>
                          {new Date(a.actualizado_at).toLocaleString("es-AR", {
                            year: "2-digit", month: "2-digit", day: "2-digit",
                            hour: "2-digit", minute: "2-digit",
                          })}
                          {a.actualizado_por && <div className="text-[var(--t-text-muted)]">{a.actualizado_por}</div>}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] whitespace-nowrap">
                      {state.kind === "saving" && <span className="text-[var(--t-accent)]">Guardando…</span>}
                      {state.kind === "saved"  && <span className="text-green-400">✓ guardado</span>}
                      {state.kind === "error"  && (
                        <span
                          className="text-red-400 cursor-help"
                          title={state.msg}
                        >
                          ✗ {state.msg.length > 40 ? state.msg.slice(0, 40) + "…" : state.msg}
                        </span>
                      )}
                      {state.kind === "idle" && dirty && <span className="text-[var(--t-text-muted)]">sin guardar</span>}
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

// ── Tab: Clientes ─────────────────────────────────────────────────────────────
// Edición de Clientes.Comitentes (master del Tablero Comercial). Espejo de
// TabAssets: campos de Aunesa read-only, edición in-place de los 13 campos
// manuales de segmentación. PATCH a /api/manager/clientes.
const CLIENTE_CAMPOS = [
  "nivel_1", "nivel_2", "nivel_3", "nivel_4", "nivel_5",
  "primer_contacto_comercial", "riesgo_la_ft", "division",
  "adc", "dma", "observaciones", "sucursal", "referido",
] as const;
type ClienteCampo = (typeof CLIENTE_CAMPOS)[number];
const CLIENTE_CAMPO_LABEL: Record<ClienteCampo, string> = {
  nivel_1: "NIVEL 1", nivel_2: "NIVEL 2", nivel_3: "NIVEL 3",
  nivel_4: "NIVEL 4", nivel_5: "NIVEL 5",
  primer_contacto_comercial: "1ER CONTACTO", riesgo_la_ft: "RIESGO LA/FT",
  division: "DIVISIÓN", adc: "ADC", dma: "DMA",
  observaciones: "OBSERVACIONES", sucursal: "SUCURSAL", referido: "REFERIDO",
};

type Cliente = {
  id_cuenta: string;
  denominacion?: string | null;
  operador_nombre?: string | null;
  operador_email?: string | null;
  actualizado_por?: string | null;
  actualizado_at?: string | null;
} & Partial<Record<ClienteCampo, string | null>>;

type ClienteDraft = Record<ClienteCampo, string>;

function emptyClienteDraft(): ClienteDraft {
  return Object.fromEntries(CLIENTE_CAMPOS.map((c) => [c, ""])) as ClienteDraft;
}
function draftFromCliente(c: Cliente): ClienteDraft {
  const d = emptyClienteDraft();
  for (const k of CLIENTE_CAMPOS) d[k] = (c[k] ?? "") as string;
  return d;
}

function TabClientesSegmentacion() {
  const [rows, setRows] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [drafts, setDrafts] = useState<Record<string, ClienteDraft>>({});
  const [vals, setVals] = useState<Record<string, string[]>>({});
  const [operadores, setOperadores] = useState<{ email: string; nombre: string }[]>([]);
  // Filtros
  const [fOperador, setFOperador] = useState("");
  const [fNivel1, setFNivel1] = useState("");
  const [campoVacio, setCampoVacio] = useState<ClienteCampo | "">("");
  const [q, setQ] = useState("");
  // Import de archivo (csv/xlsx)
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchClientes = () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (fOperador) qs.set("operador", fOperador);
    if (fNivel1) qs.set("nivel_1", fNivel1);
    if (campoVacio) qs.set("campo_vacio", campoVacio);
    if (q.trim()) qs.set("q", q.trim());
    fetch(`/api/manager/clientes?${qs}`)
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} — ${txt.slice(0, 200) || r.statusText}`);
        }
        return r.json();
      })
      .then((d: { clientes: Cliente[] }) => {
        setRows(d.clientes || []);
        const initial: Record<string, ClienteDraft> = {};
        for (const c of d.clientes || []) initial[c.id_cuenta] = draftFromCliente(c);
        setDrafts(initial);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch("/api/manager/clientes/values")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { values: Record<string, string[]>; operadores: { email: string; nombre: string }[] }) => {
        setVals(d.values || {});
        setOperadores(d.operadores || []);
      })
      .catch(() => { /* silencioso */ });
  }, []);

  // Re-fetch al cambiar filtros de select. La búsqueda libre va por Enter/botón.
  useEffect(() => { fetchClientes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fOperador, fNivel1, campoVacio]);

  const setDraftField = (id: string, field: ClienteCampo, value: string) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || emptyClienteDraft()), [field]: value } }));
  };

  const saveRow = async (c: Cliente) => {
    const draft = drafts[c.id_cuenta];
    if (!draft) return;
    const payload: Record<string, string> = { id_cuenta: c.id_cuenta };
    for (const k of CLIENTE_CAMPOS) {
      if (draft[k] !== ((c[k] ?? "") as string)) payload[k] = draft[k];
    }
    if (Object.keys(payload).length === 1) return;
    setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "saving" } }));
    try {
      const r = await fetch(`/api/manager/clientes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      const updated: Cliente = await r.json();
      setRows((prev) => prev.map((x) => (x.id_cuenta === c.id_cuenta ? updated : x)));
      setDrafts((prev) => ({ ...prev, [c.id_cuenta]: draftFromCliente(updated) }));
      setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "saved" } }));
      setTimeout(() => setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "idle" } })), 1500);
    } catch (e) {
      setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  // Cambio inline del operador (desplegable). Setea mail + nombre juntos (el
  // nombre se busca en la lista de operadores) → quedan coherentes. Para un
  // operador nuevo que no esté en la lista, se usa la carga por Excel.
  const saveOperador = async (c: Cliente, email: string) => {
    if (email === (c.operador_email ?? "")) return;
    const nombre = operadores.find((o) => o.email === email)?.nombre ?? "";
    setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "saving" } }));
    try {
      const r = await fetch(`/api/manager/clientes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cuenta: c.id_cuenta, operador_email: email, operador_nombre: nombre }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      const updated: Cliente = await r.json();
      setRows((prev) => prev.map((x) => (x.id_cuenta === c.id_cuenta ? updated : x)));
      setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "saved" } }));
      setTimeout(() => setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "idle" } })), 1500);
    } catch (e) {
      setRowState((s) => ({ ...s, [c.id_cuenta]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  // Import desde archivo .csv / .xlsx. Columnas válidas = id_cuenta + campos
  // manuales (mismo nombre que la base). Cualquier otra columna → error.
  const onImportFile = async (file: File) => {
    setImportMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
      if (!json.length) { setImportMsg({ ok: false, text: "El archivo está vacío." }); return; }

      const norm = (h: string) => h.trim().toLowerCase().replace(/[-\s]+/g, "_").replace(/\//g, "_");
      // El bulk también puede corregir el operador (mail + nombre). No está en
      // CLIENTE_CAMPOS (en el editor fila-por-fila sigue read-only).
      const OPERADOR_COLS = ["operador_email", "operador_nombre"];
      // Alias: nombres de columna habituales del Excel → campo real de la base.
      const ALIAS: Record<string, string> = {
        operador: "operador_nombre",
        nombre_operador: "operador_nombre",
        comercial: "operador_nombre",
        operador_mail: "operador_email",
        mail_operador: "operador_email",
        email_operador: "operador_email",
      };
      const valid = new Set<string>(["id_cuenta", ...CLIENTE_CAMPOS, ...OPERADOR_COLS]);
      const map: Record<string, string> = {};
      const unknown: string[] = [];
      for (const h of Object.keys(json[0])) {
        const n = ALIAS[norm(h)] ?? norm(h);
        if (valid.has(n)) map[h] = n;
        else unknown.push(h);
      }
      if (unknown.length) {
        setImportMsg({ ok: false, text: `Columnas no reconocidas: ${unknown.join(", ")}. Deben ser id_cuenta + alguno de: ${[...CLIENTE_CAMPOS, ...OPERADOR_COLS].join(", ")}` });
        return;
      }
      const dataCols = Object.values(map).filter((c) => c !== "id_cuenta");
      if (!Object.values(map).includes("id_cuenta")) { setImportMsg({ ok: false, text: "Falta la columna id_cuenta." }); return; }
      if (!dataCols.length) { setImportMsg({ ok: false, text: "Necesitás al menos una columna de datos además de id_cuenta." }); return; }

      const rowsOut: Record<string, string>[] = [];
      for (const r of json) {
        const out: Record<string, string> = {};
        for (const [h, c] of Object.entries(map)) {
          const v = String(r[h] ?? "").trim();
          if (c === "id_cuenta") out.id_cuenta = v;
          else if (v !== "") out[c] = v;
        }
        if (out.id_cuenta) rowsOut.push(out);
      }
      if (!rowsOut.length) { setImportMsg({ ok: false, text: "No hay filas con id_cuenta." }); return; }

      if (!window.confirm(`Importar ${rowsOut.length} filas · columnas: ${dataCols.join(", ")}.\n¿Aplicar?`)) return;

      setImporting(true);
      const res = await fetch("/api/manager/clientes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsOut }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setImportMsg({ ok: false, text: j.detail || `HTTP ${res.status}` }); return; }
      setImportMsg({
        ok: true,
        text: `✓ ${j.actualizadas} actualizadas` + (j.n_no_encontradas ? ` · ${j.n_no_encontradas} id_cuenta no encontradas en el master` : ""),
      });
      fetchClientes();
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : "error parseando el archivo" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Datalists para autocomplete de cada campo manual */}
      {CLIENTE_CAMPOS.map((cmp) => (
        <datalist key={cmp} id={`cli-${cmp}`}>
          {(vals[cmp] || []).map((v) => <option key={v} value={v} />)}
        </datalist>
      ))}

      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">CLIENTES</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">{rows.length} resultados</span>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">OPERADOR</span>
        <select value={fOperador} onChange={(e) => setFOperador(e.target.value)}
          className="bg-black border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {operadores.map((o) => <option key={o.email} value={o.email}>{o.nombre}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">NIVEL 1</span>
        <select value={fNivel1} onChange={(e) => setFNivel1(e.target.value)}
          className="bg-black border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {(vals["nivel_1"] || []).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CAMPO VACÍO</span>
        <select value={campoVacio} onChange={(e) => setCampoVacio(e.target.value as ClienteCampo | "")}
          className="bg-black border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
          title="Mostrar solo los clientes con este campo sin completar">
          <option value="">— sin filtro —</option>
          {CLIENTE_CAMPOS.map((c) => <option key={c} value={c}>{CLIENTE_CAMPO_LABEL[c]}</option>)}
        </select>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") fetchClientes(); }}
          placeholder="buscar id o nombre…"
          className="bg-black border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[170px]"
        />

        <label
          className={`ml-auto px-3 py-1 text-[10px] font-semibold border cursor-pointer transition-colors ${importing ? "opacity-40 pointer-events-none border-[var(--t-border-2)] text-[var(--t-text-muted)]" : "border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"}`}
          title="Subí un .csv/.xlsx con columna id_cuenta + las columnas a rellenar (nombres = campos: nivel_1, riesgo_la_ft, …). Solo rellena lo que traiga el archivo."
        >
          {importing ? "Importando…" : "📁 Importar archivo"}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }}
          />
        </label>

        <button onClick={fetchClientes} disabled={loading}
          className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {loading ? "Cargando…" : "↻ Recargar"}
        </button>
      </div>

      {importMsg && (
        <div className={`px-3 py-1.5 text-[10px] border-b border-[var(--t-border)] shrink-0 ${importMsg.ok ? "bg-[#0c1a0c] text-green-400" : "bg-[#1a0c0c] text-red-400"}`}>
          {importMsg.text}
          <button onClick={() => setImportMsg(null)} className="ml-2 text-[var(--t-text-dim)] hover:text-white">✕</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {error && <div className="p-3 text-[11px] text-red-400">Error: {error}</div>}
        {!error && loading && rows.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Cargando…</div>}
        {!error && !loading && rows.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Sin resultados para el filtro actual.</div>}
        {rows.length > 0 && (
          <table className="text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)]">
              <tr className="text-left text-[var(--t-text-dim)] tracking-widest text-[9px]">
                <th className="px-3 py-2">CUENTA</th>
                <th className="px-2 py-2">DENOMINACIÓN</th>
                <th className="px-2 py-2">OPERADOR</th>
                {CLIENTE_CAMPOS.map((c) => <th key={c} className="px-2 py-2 whitespace-nowrap">{CLIENTE_CAMPO_LABEL[c]}</th>)}
                <th className="px-3 py-2">EDITADO</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const draft = drafts[c.id_cuenta] || emptyClienteDraft();
                const state: RowState = rowState[c.id_cuenta] || { kind: "idle" };
                const dirty = CLIENTE_CAMPOS.some((k) => draft[k] !== ((c[k] ?? "") as string));
                return (
                  <tr key={c.id_cuenta} className="border-b border-[var(--t-border)] hover:bg-[#0c0c0c]">
                    <td className="px-3 py-1.5 text-[var(--t-accent)] whitespace-nowrap">{c.id_cuenta}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text)] whitespace-nowrap max-w-[220px] truncate" title={c.denominacion ?? ""}>{c.denominacion ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <select
                        value={c.operador_email ?? ""}
                        onChange={(e) => saveOperador(c, e.target.value)}
                        title={c.operador_email ?? "sin operador"}
                        className="bg-black border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none min-w-[120px] max-w-[170px]"
                      >
                        {!c.operador_email && <option value="" disabled>— elegí —</option>}
                        {c.operador_email && !operadores.some((o) => o.email === c.operador_email) && (
                          <option value={c.operador_email}>{c.operador_nombre ?? c.operador_email}</option>
                        )}
                        {operadores.map((o) => (
                          <option key={o.email} value={o.email}>{o.nombre || o.email}</option>
                        ))}
                      </select>
                    </td>
                    {CLIENTE_CAMPOS.map((k) => (
                      <td key={k} className="px-2 py-1.5">
                        <input
                          type="text"
                          list={`cli-${k}`}
                          value={draft[k]}
                          onChange={(e) => setDraftField(c.id_cuenta, k, e.target.value)}
                          onBlur={() => saveRow(c)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          placeholder="—"
                          className={`bg-black border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none ${k === "observaciones" ? "min-w-[180px]" : "min-w-[90px]"} w-full`}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-[var(--t-text-muted)] text-[10px] whitespace-nowrap">
                      {c.actualizado_at ? (
                        <>
                          {new Date(c.actualizado_at).toLocaleString("es-AR", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          {c.actualizado_por && <div className="text-[var(--t-text-muted)]">{c.actualizado_por}</div>}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-[10px] whitespace-nowrap">
                      {state.kind === "saving" && <span className="text-[var(--t-accent)]">Guardando…</span>}
                      {state.kind === "saved" && <span className="text-green-400">✓ guardado</span>}
                      {state.kind === "error" && <span className="text-red-400 cursor-help" title={state.msg}>✗ {state.msg.length > 40 ? state.msg.slice(0, 40) + "…" : state.msg}</span>}
                      {state.kind === "idle" && dirty && <span className="text-[var(--t-text-muted)]">sin guardar</span>}
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

// ── Sub-tab: Fondeos ──────────────────────────────────────────────────────────
// Carga masiva del cupo de fondeo del custodio (ARS). Pega a
// POST /api/manager/clientes/bulk-fondeo. Subdoc `cupo` en
// Clientes.Comitentes (ver docs/SEGMENTACION_PATRIMONIAL.md en TradingAV).
type Cupo = {
  transaccional_ars?: number | null;
  usado_ars?: number | null;
  utilizacion_pct?: number | null;
  cargado_en?: string | null;
  fuente?: string | null;
};
type ClienteFondeo = {
  id_cuenta: string;
  denominacion?: string | null;
  tipo_cliente?: string | null;
  operador_nombre?: string | null;
  cupo?: Cupo | null;
};

function fmtARS(n: number | null | undefined): string {
  if (n === null || n === undefined || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function TabClientesFondeos() {
  const [rows, setRows] = useState<ClienteFondeo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [soloCargados, setSoloCargados] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchClientes = () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    fetch(`/api/manager/clientes?${qs}`)
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} — ${txt.slice(0, 200) || r.statusText}`);
        }
        return r.json();
      })
      .then((d: { clientes: ClienteFondeo[] }) => setRows(d.clientes || []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchClientes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const visibles = soloCargados
    ? rows.filter((c) => {
        const lf = c.cupo;
        return lf && (lf.transaccional_ars != null || lf.usado_ars != null);
      })
    : rows;

  // Import .csv / .xlsx. Headers válidos: id_cuenta, cupo_transaccional,
  // cupo_usado. Solo se mandan filas con al menos un valor cargado.
  const onImportFile = async (file: File) => {
    setImportMsg(null);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
      if (!json.length) { setImportMsg({ ok: false, text: "El archivo está vacío." }); return; }

      const norm = (h: string) => h.trim().toLowerCase().replace(/[-\s]+/g, "_").replace(/\//g, "_");
      const valid = new Set<string>(["id_cuenta", "cupo_transaccional", "cupo_usado"]);
      const map: Record<string, string> = {};
      const unknown: string[] = [];
      // xlsx asigna `__EMPTY`, `__EMPTY_1`, ... a columnas sin header. Las
      // ignoramos en silencio — ruido común en Excels reales (columnas en
      // blanco al lado de las útiles, títulos mergeados, etc.).
      const isPhantom = (h: string) => /^__EMPTY(?:_\d+)?$/i.test(h) || h.trim() === "";
      for (const h of Object.keys(json[0])) {
        if (isPhantom(h)) continue;
        const n = norm(h);
        if (valid.has(n)) map[h] = n;
        else unknown.push(h);
      }
      if (unknown.length) {
        setImportMsg({ ok: false, text: `Columnas no reconocidas: ${unknown.join(", ")}. Deben ser: id_cuenta, cupo_transaccional, cupo_usado.` });
        return;
      }
      if (!Object.values(map).includes("id_cuenta")) {
        setImportMsg({ ok: false, text: "Falta la columna id_cuenta." });
        return;
      }
      if (!Object.values(map).some((c) => c !== "id_cuenta")) {
        setImportMsg({ ok: false, text: "Necesitás al menos una columna de cupo (cupo_transaccional y/o cupo_usado)." });
        return;
      }

      const rowsOut: Record<string, string>[] = [];
      for (const r of json) {
        const out: Record<string, string> = {};
        for (const [h, c] of Object.entries(map)) {
          const v = String(r[h] ?? "").trim();
          if (c === "id_cuenta") out.id_cuenta = v;
          else if (v !== "") out[c] = v;
        }
        if (out.id_cuenta && (out.cupo_transaccional || out.cupo_usado)) rowsOut.push(out);
      }
      if (!rowsOut.length) { setImportMsg({ ok: false, text: "No hay filas con id_cuenta + algún límite." }); return; }

      if (!window.confirm(`Importar ${rowsOut.length} filas de fondeo.\nFuente: ${file.name}\n¿Aplicar?`)) return;

      setImporting(true);
      const res = await fetch("/api/manager/clientes/bulk-fondeo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rowsOut, fuente: `archivo:${file.name}` }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setImportMsg({ ok: false, text: j.detail || `HTTP ${res.status}` }); return; }
      const extras: string[] = [];
      if (j.sin_numeros) extras.push(`${j.sin_numeros} filas con valores no numéricos`);
      if (j.n_no_encontradas) extras.push(`${j.n_no_encontradas} id_cuenta no encontradas`);
      setImportMsg({
        ok: true,
        text: `✓ ${j.actualizadas} actualizadas` + (extras.length ? ` · ${extras.join(" · ")}` : ""),
      });
      fetchClientes();
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof Error ? e.message : "error parseando el archivo" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">FONDEOS</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">{visibles.length} / {rows.length}</span>

        <label className="flex items-center gap-1.5 text-[10px] text-[var(--t-text-dim)]">
          <input type="checkbox" checked={soloCargados} onChange={(e) => setSoloCargados(e.target.checked)} className="accent-[var(--t-accent)]" />
          solo con fondeo cargado
        </label>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") fetchClientes(); }}
          placeholder="buscar id o nombre…"
          className="bg-black border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[170px]"
        />

        <label
          className={`ml-auto px-3 py-1 text-[10px] font-semibold border cursor-pointer transition-colors ${importing ? "opacity-40 pointer-events-none border-[var(--t-border-2)] text-[var(--t-text-muted)]" : "border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"}`}
          title="CSV/XLSX con columnas: id_cuenta, cupo_transaccional, cupo_usado (ARS). Solo toca las cuentas que vienen en el archivo."
        >
          {importing ? "Importando…" : "📁 Importar archivo"}
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }}
          />
        </label>

        <button onClick={fetchClientes} disabled={loading}
          className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {loading ? "Cargando…" : "↻ Recargar"}
        </button>
      </div>

      {importMsg && (
        <div className={`px-3 py-1.5 text-[10px] border-b border-[var(--t-border)] shrink-0 ${importMsg.ok ? "bg-[#0c1a0c] text-green-400" : "bg-[#1a0c0c] text-red-400"}`}>
          {importMsg.text}
          <button onClick={() => setImportMsg(null)} className="ml-2 text-[var(--t-text-dim)] hover:text-white">✕</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {error && <div className="p-3 text-[11px] text-red-400">Error: {error}</div>}
        {!error && loading && rows.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Cargando…</div>}
        {!error && !loading && visibles.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">{soloCargados ? "Ninguna cuenta tiene cupo de fondeo cargado." : "Sin resultados."}</div>}
        {visibles.length > 0 && (
          <table className="text-[11px] font-mono w-full">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)]">
              <tr className="text-left text-[var(--t-text-dim)] tracking-widest text-[9px]">
                <th className="px-3 py-2">CUENTA</th>
                <th className="px-2 py-2">DENOMINACIÓN</th>
                <th className="px-2 py-2">TIPO</th>
                <th className="px-2 py-2 text-right">CUPO TRANS. (ARS)</th>
                <th className="px-2 py-2 text-right">CUPO USADO (ARS)</th>
                <th className="px-2 py-2 text-right">% UTIL.</th>
                <th className="px-3 py-2">CARGADO</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((c) => {
                const lf = c.cupo || {};
                const cargado = lf.cargado_en ? new Date(lf.cargado_en).toLocaleDateString("es-AR") : "—";
                return (
                  <tr key={c.id_cuenta} className="border-b border-[var(--t-border)]/50 hover:bg-[#0c0c0c]">
                    <td className="px-3 py-1.5 text-[var(--t-text)]">{c.id_cuenta}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text)]">{c.denominacion || "—"}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text-dim)]">{c.tipo_cliente || "—"}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{fmtARS(lf.transaccional_ars)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{fmtARS(lf.usado_ars)}</td>
                    <td className="px-2 py-1.5 text-right text-[var(--t-text)]">{lf.utilizacion_pct != null ? `${lf.utilizacion_pct.toFixed(1)}%` : "—"}</td>
                    <td className="px-3 py-1.5 text-[var(--t-text-muted)]">{cargado}</td>
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

// ── Wrapper TabClientes: switch entre sub-tabs Segmentación / Fondeos ────────
// canBulk = true → muestra ambas sub-tabs. false → solo SEGMENTACIÓN (carga
// masiva de fondeos requiere el módulo manager_clientes_bulk, admin-only).
function TabClientes({ canBulk = true }: { canBulk?: boolean }) {
  const [subTab, setSubTab] = useState<"segmentacion" | "fondeos">("segmentacion");
  const subs = canBulk
    ? ([
        { id: "segmentacion", label: "SEGMENTACIÓN" },
        { id: "fondeos",      label: "FONDEOS" },
      ] as const)
    : ([{ id: "segmentacion", label: "SEGMENTACIÓN" }] as const);
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[#0a0a0a] shrink-0">
        {subs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-3 py-1 text-[10px] font-semibold tracking-widest transition-colors ${subTab === t.id ? "text-[var(--t-accent)] border-b border-[var(--t-accent)]" : "text-[var(--t-text-muted)] hover:text-[var(--t-text-dim)]"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {subTab === "segmentacion" && <TabClientesSegmentacion />}
        {subTab === "fondeos" && canBulk && <TabClientesFondeos />}
      </div>
    </div>
  );
}

function TabInstrumentos() {
  const [discLoading, setDiscLoading] = useState(false);
  const [discData, setDiscData] = useState<{
    ok: boolean;
    message?: string;
    total_instruments: number;
    by_cficode: {
      cficode: string;
      count: number;
      underlyings: string[];
      samples: { ticker: string; maturity: string; underlying: string }[];
    }[];
    generated_at: string | null;
    stale_h: number | null;
  } | null>(null);

  // CFI seleccionado + drill-down de sus instruments.
  const [selectedCfi, setSelectedCfi] = useState<string>("");
  const [selectedUnderlying, setSelectedUnderlying] = useState<string>("__ALL__");
  const [instruments, setInstruments] = useState<CfiInstrument[]>([]);
  const [instLoading, setInstLoading] = useState(false);
  const [search, setSearch] = useState("");

  const runDisc = () => {
    setDiscLoading(true);
    fetch("/api/manager/checks/discovery-pyrofex")
      .then(r => r.json()).then(setDiscData).finally(() => setDiscLoading(false));
  };

  // Auto-cargar summary al montar.
  useEffect(() => { runDisc(); }, []);

  // Cuando llega el summary y no hay CFI seleccionado, default = primero
  // (el que tiene más count, vienen ordenados desc).
  useEffect(() => {
    if (discData?.ok && discData.by_cficode.length > 0 && !selectedCfi) {
      setSelectedCfi(discData.by_cficode[0].cficode);
    }
  }, [discData, selectedCfi]);

  // Fetch instruments cuando cambia el CFI seleccionado.
  useEffect(() => {
    if (!selectedCfi) {
      setInstruments([]);
      return;
    }
    setInstLoading(true);
    setSearch("");
    setSelectedUnderlying("__ALL__");
    fetch(`/api/manager/checks/instruments-by-cfi?cficode=${encodeURIComponent(selectedCfi)}`)
      .then((r) => r.json())
      .then((d: { instruments?: CfiInstrument[] }) => setInstruments(d.instruments ?? []))
      .finally(() => setInstLoading(false));
  }, [selectedCfi]);

  // Underlyings ordenados desde los instruments cargados (para tener
  // counts por underlying en el dropdown). discData.by_cficode trae solo
  // el set de nombres sin counts.
  const underlyingsConCount = (() => {
    const counts: Record<string, number> = {};
    for (const inst of instruments) {
      counts[inst.underlying] = (counts[inst.underlying] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  })();

  const filteredInst = (() => {
    let list = instruments;
    if (selectedUnderlying !== "__ALL__") {
      list = list.filter((inst) => inst.underlying === selectedUnderlying);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (inst) =>
          inst.ticker.toLowerCase().includes(q) ||
          inst.maturity.includes(q),
      );
    }
    return list;
  })();

  return (
    <div className="space-y-3">
      {/* Header con selector + refresh */}
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={runDisc}
            disabled={discLoading}
            className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
          >
            {discLoading ? "Cargando…" : "↻ Recargar"}
          </button>

          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CFI</span>
          <select
            value={selectedCfi}
            onChange={(e) => setSelectedCfi(e.target.value)}
            className="bg-black border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-accent)] font-mono min-w-[180px] focus:border-[var(--t-accent)] focus:outline-none"
            disabled={!discData?.ok}
          >
            {!discData?.ok && <option value="">— sin data —</option>}
            {discData?.ok && discData.by_cficode.map((g) => (
              <option key={g.cficode} value={g.cficode}>
                {g.cficode}  ({g.count})
              </option>
            ))}
          </select>

          <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">UNDERLYING</span>
          <select
            value={selectedUnderlying}
            onChange={(e) => setSelectedUnderlying(e.target.value)}
            className="bg-black border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono min-w-[300px] focus:border-[var(--t-accent)] focus:outline-none"
            disabled={instruments.length === 0}
          >
            <option value="__ALL__">
              — todos ({instruments.length}) —
            </option>
            {underlyingsConCount.map(([u, n]) => (
              <option key={u} value={u}>
                {u} ({n})
              </option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ticker o maturity"
            className="flex-1 min-w-[200px] bg-black border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
            disabled={!instruments.length}
          />

          {discData?.ok && (
            <div className="text-[10px] text-[var(--t-text-dim)]">
              <span className="font-mono text-[var(--t-text)]">{discData.total_instruments}</span> total
              {" · "}
              <span className="font-mono text-[var(--t-text)]">{discData.by_cficode.length}</span> CFI
            </div>
          )}
        </div>
        {discData?.generated_at && (
          <div className="text-[9px] text-[var(--t-text-muted)] mt-2">
            Snapshot generado {new Date(discData.generated_at).toLocaleString("es-AR")}
            {discData.stale_h !== null && ` (hace ${discData.stale_h}h)`}
            {" — refresh: "}
            <code className="text-[#3fbf6f]">python -m scripts.discovery_pyrofex</code> en el Droplet
          </div>
        )}
      </div>

      {/* Banner si no hay data */}
      {discData && !discData.ok && (
        <div className="border border-[#ff7f7f]/40 bg-[#1a0808] p-3 text-[10px] text-[#ff7f7f] italic">
          {discData.message}
        </div>
      )}

      {/* Tabla única de instruments */}
      {selectedCfi && (
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
          <div className="px-3 py-2 border-b border-[var(--t-border)] flex items-center gap-2 text-[10px]">
            <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">INSTRUMENTS</span>
            <span className="font-mono text-[var(--t-text)]">{filteredInst.length}</span>
            {search && filteredInst.length !== instruments.length && (
              <span className="text-[var(--t-text-muted)]">de {instruments.length}</span>
            )}
            {instLoading && <span className="text-[var(--t-text-muted)] italic ml-2">Cargando…</span>}
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-[10px] font-mono tabular-nums">
              <thead className="text-[var(--t-text-muted)] text-[9px] tracking-widest sticky top-0 bg-[var(--t-panel)] border-b border-[var(--t-border)]">
                <tr>
                  <th className="text-left px-3 py-2">TICKER</th>
                  <th className="text-left px-3 py-2">MATURITY</th>
                  <th className="text-left px-3 py-2">UNDERLYING</th>
                  <th className="text-right px-3 py-2">CCY</th>
                  <th className="text-right px-3 py-2">TICK</th>
                  <th className="text-right px-3 py-2">MULT</th>
                  <th className="text-right px-3 py-2">STRIKE</th>
                  <th className="text-right px-3 py-2">P/C</th>
                </tr>
              </thead>
              <tbody>
                {filteredInst.map((inst, i) => (
                  <tr key={`${inst.ticker}-${i}`} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    <td className="px-3 py-1 text-[#3fbf6f]">{inst.ticker}</td>
                    <td className="px-3 py-1 text-[var(--t-text-dim)]">{inst.maturity}</td>
                    <td className="px-3 py-1 text-[var(--t-text)]">{inst.underlying}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.currency ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.tickSize ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.contractMultiplier ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.strikePrice ?? "—"}</td>
                    <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{inst.putOrCall ?? "—"}</td>
                  </tr>
                ))}
                {!instLoading && filteredInst.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-4 text-center text-[var(--t-text-muted)]">
                      {instruments.length === 0
                        ? "Sin instruments para este CFI. ¿Corriste scripts.discovery_pyrofex tras el último deploy?"
                        : `Sin matches para "${search}"`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Asistente (legacy, no en uso) ────────────────────────────────────────
// Migrado desde la vista standalone /asistente. Sub-tabs: CHAT (vista del
// asistente) + OBSERVABILITY (stats/logs de Manager.AsistenteLogs).
function TabAsistente() {
  const [sub, setSub] = useState<"chat" | "obs">("chat");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[#0a0a0a] shrink-0">
        <span className="text-[10px] font-semibold text-[var(--t-text-muted)] tracking-widest mr-2">
          ASISTENTE · LEGACY
        </span>
        <Pill label="CHAT"          active={sub === "chat"} onClick={() => setSub("chat")} />
        <Pill label="OBSERVABILITY" active={sub === "obs"}  onClick={() => setSub("obs")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "chat" && <ChatView />}
        {sub === "obs"  && <AsistenteDashboard />}
      </div>
    </div>
  );
}

type Tab =
  | "diagnostico"
  | "jobs"
  | "validaciones"
  | "titulos"
  | "comercial"
  | "clientes"
  | "aunesa"
  | "asistente"
  | "usuarios";

// AUNESA es un grupo con tres sub-vistas:
//  - FLUJO:    explorador de movimientos de Aunesa.
//  - AUM:      consulta de Valuaciones.AuM (la base) por cuenta/fecha.
//  - POSICIÓN: pega EN VIVO a Aunesa (posicionValuada) — para comparar
//              lo que Aunesa manda contra lo persistido en AUM.
// ── Grupos consolidados (sub-tabs con Pill, patrón AunesaGroup) ───────────────

const GROUP_HEADER = "flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[#0a0a0a] shrink-0";
const GROUP_TITLE = "text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mr-2";

// DIAGNÓSTICO: Motores (rediseñado 50/50) + Recursos + Logs.
function DiagnosticoGroup() {
  const [sub, setSub] = useState<"motores" | "recursos" | "logs">("motores");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>DIAGNÓSTICO</span>
        <Pill label="MOTORES" active={sub === "motores"} onClick={() => setSub("motores")} />
        <Pill label="RECURSOS" active={sub === "recursos"} onClick={() => setSub("recursos")} />
        <Pill label="LOGS" active={sub === "logs"} onClick={() => setSub("logs")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "motores"  && <TabDiagnostico />}
        {sub === "recursos" && <RecursosPanel />}
        {sub === "logs"     && <LogsPanel />}
      </div>
    </div>
  );
}

// VALIDACIONES: checks + Opciones Vto (relocalizado de Backfills) + Debug XIRR.
function ValidacionesGroup() {
  const [sub, setSub] = useState<"checks" | "opciones" | "xirr" | "segmento">("checks");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>VALIDACIONES</span>
        <Pill label="VALIDACIONES" active={sub === "checks"} onClick={() => setSub("checks")} />
        <Pill label="OPCIONES VTO" active={sub === "opciones"} onClick={() => setSub("opciones")} />
        <Pill label="DEBUG XIRR" active={sub === "xirr"} onClick={() => setSub("xirr")} />
        <Pill label="DEBUG SEGMENTO" active={sub === "segmento"} onClick={() => setSub("segmento")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "checks"   && <TabValidaciones />}
        {sub === "opciones" && <div className="h-full overflow-y-auto p-3"><OpcionesExpiriesPanel /></div>}
        {sub === "xirr"     && <ManagerDebugXirrPanel />}
        {sub === "segmento" && <ManagerDebugSegmentoPanel />}
      </div>
    </div>
  );
}

// TÍTULOS: Instrumentos + Assets.
function TitulosGroup() {
  const [sub, setSub] = useState<"instrumentos" | "assets">("instrumentos");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>TÍTULOS</span>
        <Pill label="INSTRUMENTOS" active={sub === "instrumentos"} onClick={() => setSub("instrumentos")} />
        <Pill label="ASSETS" active={sub === "assets"} onClick={() => setSub("assets")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "instrumentos" && <div className="h-full overflow-y-auto p-3"><TabInstrumentos /></div>}
        {sub === "assets"       && <TabAssets />}
      </div>
    </div>
  );
}

// USUARIOS: Usuarios + Roles y Permisos + Grupos.
function UsuariosGroup() {
  const [sub, setSub] = useState<"usuarios" | "roles" | "grupos">("usuarios");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>USUARIOS</span>
        <Pill label="USUARIOS" active={sub === "usuarios"} onClick={() => setSub("usuarios")} />
        <Pill label="ROLES Y PERMISOS" active={sub === "roles"} onClick={() => setSub("roles")} />
        <Pill label="GRUPOS" active={sub === "grupos"} onClick={() => setSub("grupos")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "usuarios" && <UsuariosPanel />}
        {sub === "roles"    && <RolesPanel />}
        {sub === "grupos"   && <GruposPanel />}
      </div>
    </div>
  );
}

function AunesaGroup() {
  const [sub, setSub] = useState<"flujo" | "aum" | "posicion" | "boletos">("flujo");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[#0a0a0a] shrink-0">
        <span className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mr-2">AUNESA</span>
        <Pill label="FLUJO" active={sub === "flujo"} onClick={() => setSub("flujo")} />
        <Pill label="AUM" active={sub === "aum"} onClick={() => setSub("aum")} />
        <Pill label="POSICIÓN" active={sub === "posicion"} onClick={() => setSub("posicion")} />
        <Pill label="BOLETOS" active={sub === "boletos"} onClick={() => setSub("boletos")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "flujo"    && <AunesaExplorarPanel />}
        {sub === "aum"      && <AunesaAumPanel />}
        {sub === "posicion" && <AunesaPosicionPanel />}
        {sub === "boletos"  && <AunesaBoletosPanel />}
      </div>
    </div>
  );
}

// Cada tab habilita con CUALQUIERA de los módulos listados (OR). El umbrella
// `manager` da acceso a todas (admin); las tabs que también listan un sub-módulo
// (comercial, clientes) son accesibles a `asistente_comercial` aunque NO tenga
// `manager`. Mantener sincronizado con el gating server-side en
// api/routers/manager/__init__.py — la API es la fuente de verdad.
const TAB_MODULES: Record<Tab, string[]> = {
  diagnostico:  ["manager"],
  jobs:         ["manager"],
  validaciones: ["manager"],
  titulos:      ["manager"],
  comercial:    ["manager", "manager_comercial"],
  clientes:     ["manager", "manager_clientes"],
  aunesa:       ["manager"],
  asistente:    ["manager"],
  usuarios:     ["manager"],
};

export function ManagerView({ modules = null }: { modules?: string[] | null }) {
  const allTabs: { id: Tab; label: string }[] = [
    { id: "diagnostico",  label: "DIAGNÓSTICO"  },
    { id: "jobs",         label: "JOBS"         },
    { id: "validaciones", label: "VALIDACIONES" },
    { id: "titulos",      label: "TÍTULOS"      },
    { id: "comercial",    label: "COMERCIAL"    },
    { id: "clientes",     label: "CLIENTES"     },
    { id: "aunesa",       label: "AUNESA"       },
    { id: "asistente",    label: "ASISTENTE"    },
    { id: "usuarios",     label: "USUARIOS"     },
  ];
  // modules === null → dev / backend caído: mostrar todo (sin RBAC en cliente).
  const tabs =
    modules === null
      ? allTabs
      : allTabs.filter((t) =>
          TAB_MODULES[t.id].some((m) => modules.includes(m)),
        );
  // canBulk: `manager` (admin) o `manager_clientes_bulk` (rol futuro con bulks pero sin umbrella).
  const canBulk =
    modules === null ||
    modules.includes("manager") ||
    modules.includes("manager_clientes_bulk");
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? "comercial");

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest mr-3">MANAGER</span>
        {tabs.map((t) => (
          <Pill key={t.id} label={t.label} active={tab === t.id} onClick={() => setTab(t.id)} />
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "diagnostico"  && <DiagnosticoGroup />}
        {tab === "jobs"         && <JobsRunsPanel />}
        {tab === "validaciones" && <ValidacionesGroup />}
        {tab === "titulos"      && <TitulosGroup />}
        {tab === "comercial"    && <ComercialPanel />}
        {tab === "clientes"     && <TabClientes canBulk={canBulk} />}
        {tab === "aunesa"       && <AunesaGroup />}
        {tab === "asistente"    && <TabAsistente />}
        {tab === "usuarios"     && <UsuariosGroup />}
      </div>
    </div>
  );
}
