"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { ControlesPanel } from "./manager-controles-panel";
import { IaPanel } from "./manager-ia-panel";
// Imports estáticos: la carga diferida (next/dynamic) hacía que cada tab trajera
// su chunk al entrar → se sentía lento (sobre todo Clientes). Con imports
// estáticos las tabs son instantáneas (cuesta un poco más el load inicial, pero
// Manager es admin-only y se prioriza la velocidad de navegación entre tabs).
import { AunesaExplorarPanel } from "./aunesa-explorar-panel";
import { AunesaAumPanel } from "./aunesa-aum-panel";
import { AunesaPosicionPanel } from "./aunesa-posicion-panel";
import { AunesaBoletosPanel } from "./aunesa-boletos-panel";
import { JobsGroup } from "./manager-jobs-panel";
import { GruposPanel } from "./grupos-panel";
import { TabContrapartes } from "./manager-contrapartes-view";
import { TabAcaValores } from "./manager-aca-valores-view";
import { TabDocumentos } from "./manager-documentos-view";
import { LogsPanel } from "./logs-panel";
import { ManagerDebugXirrPanel } from "./manager-debug-xirr";
import { ManagerDebugTeaPanel } from "./manager-debug-tea";
import { RecursosPanel } from "./recursos-panel";
import { RolesPanel } from "./roles-panel";
import { UsuariosPanel } from "./usuarios-panel";

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

interface DiagPieza {
  label: string; tipo: "motor" | "job" | "api"; cadencia: string;
  estado: string; ultima: string | null; hace: string;
  umbral_s: number; run_status?: string | null;
}
interface DiagGrupo { grupo: string | null; piezas: DiagPieza[] }
interface DiagVista {
  vista: string; resumen: { ok: number; total: number; alertas: number };
  grupos: DiagGrupo[];
}
interface DiagData { ahora_ar: string; en_rueda: boolean; vistas: DiagVista[] }

const _VISTA_META: Record<string, { icon: string; label: string }> = {
  HOME:        { icon: "🏠", label: "HOME" },
  OPERAR:      { icon: "💱", label: "OPERAR" },
  MERCADOS:    { icon: "📈", label: "MERCADOS" },
  NEGOCIO:     { icon: "💼", label: "NEGOCIO" },
  BACK_OFFICE: { icon: "📦", label: "BACK OFFICE" },
  PORTFOLIOS:  { icon: "📊", label: "PORTFOLIOS / AuM" },
};
const _TIPO_ICON: Record<string, string> = { motor: "⚙", job: "⏱", api: "🔌" };
interface Job { status: "running" | "done" | "error"; tipo: string; result?: string; started_at?: string; finished_at?: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const ESTADO_COLOR: Record<string, string> = {
  ok:          "var(--t-pos)",
  lento:       "#ff9900",
  atrasado:    "#ff9900",
  critico:     "var(--t-neg)",
  error:       "var(--t-neg)",
  fuera_rueda: "#555555",
  sin_datos:   "#555555",
  error_parse: "#555555",
};
const ESTADO_LABEL: Record<string, string> = {
  ok: "OK", lento: "LENTO", atrasado: "ATRASADO", error: "ERROR",
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
        active ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
               : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}>
      {label}
    </button>
  );
}

// ── Tab: Diagnóstico (árbol por vista) ────────────────────────────────────────

function TabDiagnostico() {
  const [data, setData] = useState<DiagData | null>(null);
  const [lastCheck, setLastCheck] = useState<string>("");
  const [colapsadas, setColapsadas] = usePersistedState<string[]>("manager.diag.arbol.colapsadas", []);

  const refresh = useCallback(() => {
    fetch("/api/manager/diagnostico", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: DiagData) => { setData(d); setLastCheck(new Date().toLocaleTimeString("es-AR")); })
      .catch(console.error);
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 10000); return () => clearInterval(id); }, [refresh]);

  const toggle = (v: string) =>
    setColapsadas((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]));

  return (
    <div className="h-full flex flex-col gap-2 p-3 min-h-0">
      <div className="flex items-center gap-3 shrink-0">
        <span className={`text-[11px] font-semibold ${data?.en_rueda ? "text-[var(--t-pos)]" : "text-[var(--t-text-muted)]"}`}>
          {data ? (data.en_rueda ? "● EN RUEDA" : "● FUERA DE RUEDA") : "—"}
        </span>
        <span className="text-[10px] text-[var(--t-text-muted)] font-mono">{data?.ahora_ar ?? ""}</span>
        <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">Chequeado: {lastCheck} · auto 10s</span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
        {!data && <div className="text-[10px] text-[var(--t-text-muted)] font-mono p-2">Cargando…</div>}
        {(data?.vistas ?? []).map((v) => {
          const meta = _VISTA_META[v.vista] ?? { icon: "•", label: v.vista };
          const colapsada = colapsadas.includes(v.vista);
          const hasCrit = v.grupos.some((g) =>
            g.piezas.some((p) => ["critico", "error", "sin_datos"].includes(p.estado)));
          const dot = v.resumen.alertas === 0 ? "var(--t-pos)" : hasCrit ? "var(--t-neg)" : "#ff9900";
          return (
            <div key={v.vista} className="border border-[var(--t-border)] bg-[var(--t-panel)]">
              <button onClick={() => toggle(v.vista)}
                className="w-full flex items-center gap-2 px-3 py-1.5 bg-[var(--t-accent)]/10 hover:bg-[var(--t-accent)]/20 transition-colors">
                <span className="text-[10px] text-[var(--t-text-muted)] w-3">{colapsada ? "▸" : "▾"}</span>
                <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
                  {meta.icon} {meta.label}
                </span>
                <span className="ml-auto text-[10px] text-[var(--t-text-muted)] font-mono">
                  {v.resumen.ok}/{v.resumen.total}{v.resumen.alertas > 0 ? ` · ${v.resumen.alertas} alerta` : ""}
                </span>
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />
              </button>
              {!colapsada && (
                <div className="px-2 py-1">
                  {v.grupos.map((g, gi) => (
                    <div key={gi} className="mb-1">
                      {g.grupo && (
                        <div className="text-[9px] text-[var(--t-text-muted)] tracking-widest px-1 pt-1 pb-0.5 uppercase">
                          {g.grupo}
                        </div>
                      )}
                      <table className="w-full text-[11px]">
                        <tbody>
                          {g.piezas.map((p, pi) => (
                            <tr key={pi} className="border-b border-[var(--t-border)]/40">
                              <td className="px-1 py-0.5 text-[var(--t-text-dim)] w-4">{_TIPO_ICON[p.tipo] ?? "•"}</td>
                              <td className="px-1 py-0.5 text-[var(--t-text)] whitespace-nowrap">{p.label}</td>
                              <td className="px-1 py-0.5 text-[10px] text-[var(--t-text-muted)] whitespace-nowrap">{p.cadencia}</td>
                              <td className="px-1 py-0.5 font-mono text-[var(--t-text-dim)] text-right whitespace-nowrap">{p.hace}</td>
                              <td className="px-1 py-0.5 font-mono text-[9px] text-[var(--t-text-muted)] text-right whitespace-nowrap">{p.ultima ?? "—"}</td>
                              <td className="px-1 py-0.5 text-right"><Badge estado={p.estado} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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
                        ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
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
                className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] transition-colors disabled:opacity-40"
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
                  <span className="text-[var(--t-pos)]">AUTO (próximo &gt; hoy)</span>
                ) : (
                  <span className="text-[var(--t-accent)]">
                    {data.activos.map(fmtExpiry).join(", ")}
                  </span>
                )}
              </span>
              {msg && <span className="text-[10px] font-mono text-[var(--t-pos)] ml-auto">{msg}</span>}
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
      style={{ color: ok ? "var(--t-pos)" : "var(--t-neg)", border: `1px solid ${ok ? "#00cc6640" : "#ff333340"}`, backgroundColor: ok ? "#00cc6612" : "#ff333312" }}>
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

  // Control: títulos (bonos ARS/HD/DL) sin flujo en Curvas
  const [tsfLoading, setTsfLoading] = useState(false);
  const [tsfData, setTsfData] = useState<{
    total: number; en_cartera: number; ok: boolean;
    titulos: { unidad: string; ticker: string | null; cartera: string;
               emisor: string | null; motivo: string; en_cartera: boolean }[];
  } | null>(null);

  // Backfill Tasas — recalcula TEA/TEM de mercado.curvas y rellena las faltantes
  const [btLoading, setBtLoading] = useState(false);
  const [btResult, setBtResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/manager/checks/tickers-curvas").then(r => r.json()).then((d: string[]) => {
      setTickers(d);
      if (d.length > 0) setTcA(d[0]);
      if (d.length > 1) setTcB(d[1]);
    }).catch(console.error);
  }, []);

  const runBackfillTasas = async () => {
    setBtLoading(true);
    setBtResult(null);
    try {
      const start = await fetch("/api/manager/jobs/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "backfill_tasas" }),
      }).then(r => r.json());
      const jobId = start?.job_id;
      if (!jobId) { setBtResult("No se pudo lanzar el job (¿sin permiso?)."); return; }
      // Poll hasta que termine (el job es rápido, pero damos margen).
      for (let i = 0; i < 60; i++) {
        await new Promise(res => setTimeout(res, 2000));
        const job = await fetch(`/api/manager/jobs/${jobId}`, { cache: "no-store" }).then(r => r.json());
        if (job?.status && job.status !== "running") {
          setBtResult(job.result || `(sin salida) status=${job.status}`);
          return;
        }
      }
      setBtResult("Timeout esperando el job (seguí en JOBS → historial).");
    } catch (e) {
      setBtResult(`Error: ${String(e)}`);
    } finally {
      setBtLoading(false);
    }
  };

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
  const runTsf = () => {
    setTsfLoading(true);
    fetch("/api/manager/bonos/sin-flujo")
      .then(r => r.json()).then(setTsfData).finally(() => setTsfLoading(false));
  };

  const ESTADO_LABEL: Record<string, string> = { ok: "✅ En vista", sin_posicion: "⚠️ Sin posición", sin_assets: "❌ Sin Assets" };

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-2">

      <CheckPanel title="Backfill Tasas — recalcular y rellenar TEA/TEM de Renta Fija">
        <div className="text-[10px] text-[var(--t-text-muted)] mb-2 leading-relaxed">
          Recalcula la TEA/TEM de todos los bonos y actualiza los valores.
          Rellena las que están en <b>&quot;--&quot;</b> y refresca las
          existentes, sin esperar al próximo trade (útil tras corregir un flujo o cuando
          el motor no las calculó). Solo escribe lo que puede calcular — no pisa datos buenos.
        </div>
        <RunBtn onClick={runBackfillTasas} loading={btLoading} />
        {btResult && (
          <pre className="text-[10px] text-[var(--t-text)] whitespace-pre-wrap bg-[var(--t-surface)] border border-[var(--t-border)] p-2 mt-1 max-h-64 overflow-y-auto">
            {btResult}
          </pre>
        )}
      </CheckPanel>

      <CheckPanel title="Títulos sin flujo — bonos ARS/HD/DL sin flujo en Curvas">
        <RunBtn onClick={runTsf} loading={tsfLoading} />
        {tsfData && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge ok={tsfData.ok} label={tsfData.ok ? "Todos con flujo" : `${tsfData.total} sin flujo · ${tsfData.en_cartera} en cartera`} />
            </div>
            {!tsfData.ok && (
              <table><thead><tr><th>CART</th><th>UNIDAD</th><th>TICKER</th><th>HOY</th><th>MOTIVO</th></tr></thead>
                <tbody>{tsfData.titulos.map(t => (
                  <tr key={t.unidad}>
                    <td>{t.cartera}</td>
                    <td className="text-[var(--t-accent)]">{t.unidad}</td>
                    <td className="font-mono">{t.ticker ?? "—"}</td>
                    <td className="text-center">{t.en_cartera ? "🔴" : "·"}</td>
                    <td className="text-[var(--t-text-dim)]">{t.motivo}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </>
        )}
      </CheckPanel>

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
                          <td colSpan={7} className="!py-2 !px-3 bg-[var(--t-panel)] border-l-2 border-l-[var(--t-accent)]">
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
                                  <span className="text-[var(--t-pos)] font-bold">
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
              <span className="text-[var(--t-text-muted)]">Corte: {tfData.snapshot ?? "—"}</span>
              <span style={{ color: "var(--t-pos)" }}>✅ {tfData.ok}</span>
              <span style={{ color: "#ff9900" }}>⚠️ {tfData.sin_posicion}</span>
              <span style={{ color: "var(--t-neg)" }}>❌ {tfData.sin_assets}</span>
            </div>
            <table><thead><tr><th>TICKER</th><th>ESTADO</th></tr></thead>
              <tbody>{tfData.instrumentos.map(r => (
                <tr key={r.ticker}>
                  <td className="text-[var(--t-accent)]">{r.ticker}</td>
                  <td className={r.estado === "ok" ? "text-[var(--t-pos)]" : r.estado === "sin_posicion" ? "text-[var(--t-accent)]" : "text-[var(--t-neg)]"}>
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
              <p className="text-[var(--t-neg)] text-[10px]">{dbfData.error}</p>
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
                  <div className="text-[14px] font-semibold text-[var(--t-pos)] font-mono mb-2">
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
        {sobError && <p className="text-[var(--t-neg)] text-[10px] mb-2">{sobError}</p>}
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
                <div className="text-[10px] font-mono text-[var(--t-pos)]">Precio USD: {sobData.precio.precio_usd?.toFixed(4) ?? "—"}</div>
                <div className="text-[10px] font-mono text-[var(--t-text-dim)] mt-1">Settlement: {sobData.settlement}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="border border-[#00cc66]/30 bg-[#00cc66]/5 p-2 text-center">
                <div className="text-[9px] text-[var(--t-text-dim)] uppercase tracking-wide">TEA (YTM)</div>
                <div className="text-[16px] font-semibold font-mono text-[var(--t-pos)]">
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
                  <td className="text-right font-mono text-[var(--t-pos)]">{f.monto_usd.toFixed(4)}</td>
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
            className="flex-1 max-w-[280px] bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
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
          <div className="text-[10px] text-[var(--t-neg)] italic">{curvaData.message}</div>
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
                    <div><span className="text-[var(--t-text-muted)]">fecha settle</span> <span className="text-[var(--t-pos)]">{curvaData.settlement.fecha_settlement}</span></div>
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
                      <div><span className="text-[var(--t-text-muted)]">precio_usd</span> <span className="text-[var(--t-pos)]">{curvaData.tc_info.precio_usd.toFixed(6)}</span></div>
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
                        <td className={`text-right ${c.monto < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]"}`}>{c.monto.toFixed(4)}</td>
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
                <div className="text-[10px] text-[var(--t-neg)] italic">⚠ {curvaData.error_calc}</div>
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
                          <td className="text-right text-[var(--t-pos)]">
                            {row.c !== undefined && row.c !== null
                              ? (row.pct ? `${(row.c * 100).toFixed(4)}%` : `${row.c.toFixed(4)}${row.suffix ?? ""}`)
                              : "—"}
                          </td>
                          <td className="text-right text-[var(--t-text-dim)]">
                            {row.p !== null && row.p !== undefined
                              ? (row.pct ? `${(row.p * 100).toFixed(4)}%` : `${row.p.toFixed(4)}${row.suffix ?? ""}`)
                              : "—"}
                          </td>
                          <td className={`text-right ${diffOk ? "text-[var(--t-pos)]" : diff === "—" ? "text-[var(--t-text-muted)]" : "text-[var(--t-accent)]"}`}>{diff ?? "—"}</td>
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
          <div className="text-[10px] text-[var(--t-neg)] italic">
            {tnaData.nota || "Sin datos de futuros DLR."}
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
                  <th className="text-right text-[var(--t-pos)]">TNA LIN (last)</th>
                  <th className="text-right text-[var(--t-accent)]">TEA COMP (last)</th>
                  <th className="text-right text-[var(--t-pos)]">TNA LIN (mid)</th>
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
                    <td className="text-right text-[var(--t-pos)]">
                      {f.tna_lineal_last?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="text-right text-[var(--t-accent)]">
                      {f.tea_compuesta_last?.toFixed(2) ?? "—"}%
                    </td>
                    <td className="text-right text-[var(--t-pos)]">
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
              <span className="text-[var(--t-pos)]">TNA LIN</span> = directo × 365/días (lineal — terminal Rofex){" "}
              · <span className="text-[var(--t-accent)]">TEA COMP</span> = (1+directo)^(365/días) − 1 (compuesta) ·{" "}
              <span className="text-[var(--t-text)]">PERSISTIDA</span> = valor calculado y guardado (hoy = TEA COMP)
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
            className="flex-1 max-w-[280px] bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
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
                    <div className="text-[10px] text-[var(--t-neg)] italic">{fr.motivo}</div>
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
                                  <td className={`text-right px-1 ${esH ? "text-[var(--t-pos)] font-bold" : "text-[var(--t-text)]"}`}>
                                    {v.high != null ? v.high.toFixed(4) : "—"}{esH ? " ◄H" : ""}
                                  </td>
                                  <td className={`text-right px-1 ${esL ? "text-[var(--t-neg)] font-bold" : "text-[var(--t-text)]"}`}>
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
                        H = <span className="text-[var(--t-pos)]">{fr.h ? fr.h.valor.toFixed(4) : "—"}</span> ({d10(fr.h?.fecha)}) ·{" "}
                        L = <span className="text-[var(--t-neg)]">{fr.l ? fr.l.valor.toFixed(4) : "—"}</span> ({d10(fr.l?.fecha)}) ·{" "}
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
  // Código CNV del instrumento (string; puede tener ceros a la izquierda).
  CODIGO_CNV?: string | null;
  // Fee de administración del FCI: FRACCIÓN decimal (0.01 = 1%). Solo FCI.
  FEE_ADMIN?: number | null;
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
  "TICKER", "VENCIMIENTO", "INSTRUMENTO", "CODIGO_CNV",
] as const;
type AssetCampo = (typeof ASSET_CAMPOS)[number];
type AssetDraft = Record<AssetCampo, string>;

// Campos de dropdown CERRADO: solo se eligen valores existentes, no se
// pueden tipear nuevos. El resto son inputs editables con datalist.
const ASSET_CAMPOS_CERRADOS: readonly AssetCampo[] = ["CARTERA", "CLASE_ACTIVO"];

function emptyDraft(): AssetDraft {
  return {
    CARTERA: "", EMISOR: "", CLASE_ACTIVO: "", CALIFICACION: "",
    TICKER: "", VENCIMIENTO: "", INSTRUMENTO: "", CODIGO_CNV: "",
  };
}
function emptyOpts(): Record<AssetCampo, string[]> {
  return {
    CARTERA: [], EMISOR: [], CLASE_ACTIVO: [], CALIFICACION: [],
    TICKER: [], VENCIMIENTO: [], INSTRUMENTO: [], CODIGO_CNV: [],
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
  // FEE_ADMIN editado por unidad (string mientras se tipea; numérico al guardar).
  // Aparte de `drafts` porque es numérico — no contamina la maquinaria de strings.
  const [feeDrafts, setFeeDrafts] = useState<Record<string, string>>({});
  // Valores únicos por campo (dropdown cerrado / datalist editable).
  const [valueOpts, setValueOpts] = useState<Record<AssetCampo, string[]>>(emptyOpts);
  // Filtros de la query backend.
  const [filtroCartera, setFiltroCartera] = useState<string>("");
  const [filtroEmisor, setFiltroEmisor] = useState<string>("");
  // "mostrar solo los que tienen este campo vacío". "" = sin filtro (todo).
  const [campoVacio, setCampoVacio] = useState<AssetCampo | "">("");
  // Buscador por unidad — filtro en el CLIENTE sobre el catálogo ya cargado (instantáneo,
  // sin pegarle al backend en cada tecla). Matchea substring case-insensitive.
  const [buscaUnidad, setBuscaUnidad] = useState("");

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
        const feeInit: Record<string, string> = {};
        for (const a of d.assets || []) {
          initial[a.unidad] = draftFromAsset(a);
          feeInit[a.unidad] = a.FEE_ADMIN != null ? String(a.FEE_ADMIN) : "";
        }
        setDrafts(initial);
        setFeeDrafts(feeInit);
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

  // Guarda el fee del FCI (numérico, fracción 0.01 = 1%). Independiente de
  // saveRow (que solo manda los campos string). Vacío = no tocar.
  const saveFee = async (a: AssetGap) => {
    const raw = (feeDrafts[a.unidad] ?? "").trim();
    if (raw === "") return;
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      setRowState((s) => ({ ...s, [a.unidad]: { kind: "error", msg: "fee inválido" } }));
      return;
    }
    if (a.FEE_ADMIN != null && num === a.FEE_ADMIN) return; // sin cambio
    setRowState((s) => ({ ...s, [a.unidad]: { kind: "saving" } }));
    try {
      const r = await fetch(`/api/manager/assets`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unidad: a.unidad, FEE_ADMIN: num }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* texto plano */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      const updated: AssetGap = await r.json();
      setAssets((prev) => prev.map((x) => (x.unidad === a.unidad ? updated : x)));
      setFeeDrafts((prev) => ({ ...prev, [a.unidad]: updated.FEE_ADMIN != null ? String(updated.FEE_ADMIN) : "" }));
      setRowState((s) => ({ ...s, [a.unidad]: { kind: "saved" } }));
      setTimeout(() => setRowState((s) => ({ ...s, [a.unidad]: { kind: "idle" } })), 1500);
    } catch (e) {
      setRowState((s) => ({ ...s, [a.unidad]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  // Campos abiertos (input editable): datalist con valores existentes.
  // Los campos cerrados (CARTERA, CLASE_ACTIVO) van como <select> y no usan list.
  const camposAbiertos = ASSET_CAMPOS.filter((c) => !ASSET_CAMPOS_CERRADOS.includes(c));

  // Filtro por unidad en el cliente (el catálogo entero ya está cargado por fetchAssets).
  const qUnidad = buscaUnidad.trim().toUpperCase();
  const assetsVisibles = qUnidad
    ? assets.filter((a) => (a.unidad || "").toUpperCase().includes(qUnidad))
    : assets;

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
        <span className="text-[10px] text-[var(--t-text-muted)]">
          {assetsVisibles.length}{qUnidad ? ` / ${assets.length}` : ""} resultados
        </span>

        {/* Buscador por unidad (filtra el catálogo ya cargado, en vivo mientras tipeás) */}
        <input
          value={buscaUnidad}
          onChange={(e) => setBuscaUnidad(e.target.value)}
          placeholder="Buscar unidad…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none w-[180px]"
        />
        {buscaUnidad && (
          <button
            onClick={() => setBuscaUnidad("")}
            className="text-[var(--t-text-muted)] hover:text-[var(--t-accent)] text-[12px]"
            title="Limpiar búsqueda"
          >
            ✕
          </button>
        )}

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CARTERA</span>
        <select
          value={filtroCartera}
          onChange={(e) => setFiltroCartera(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
        >
          <option value="">— todas —</option>
          {valueOpts.CARTERA.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">EMISOR</span>
        <select
          value={filtroEmisor}
          onChange={(e) => setFiltroEmisor(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
        >
          <option value="">— todos —</option>
          {valueOpts.EMISOR.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CAMPO VACÍO</span>
        <select
          value={campoVacio}
          onChange={(e) => setCampoVacio(e.target.value as AssetCampo | "")}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
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
                <th className="px-3 py-2 min-w-[280px]">UNIDAD</th>
                {ASSET_CAMPOS.map((c) => <th key={c} className="px-2 py-2">{c}</th>)}
                <th className="px-2 py-2 w-px whitespace-nowrap">FEE ADMIN<span className="text-[var(--t-text-muted)]"> (frac.)</span></th>
                <th className="px-2 py-2 w-px whitespace-nowrap">EDITADO</th>
                <th className="px-3 py-2 w-px"></th>
              </tr>
            </thead>
            <tbody>
              {assetsVisibles.length === 0 && (
                <tr><td colSpan={20} className="px-3 py-3 text-[11px] text-[var(--t-text-muted)]">
                  Sin assets que matcheen “{buscaUnidad}”.
                </td></tr>
              )}
              {assetsVisibles.map((a) => {
                const draft = drafts[a.unidad] || emptyDraft();
                const state: RowState = rowState[a.unidad] || { kind: "idle" };
                const dirty = ASSET_CAMPOS.some((c) => draft[c] !== ((a[c] ?? "") as string));
                return (
                  <tr key={a.unidad} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                    <td
                      className="px-3 py-1.5 text-[var(--t-text)] whitespace-nowrap max-w-[520px] min-w-[280px] truncate"
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
                              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-full min-w-[90px]"
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
                              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-full min-w-[90px]"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 w-px whitespace-nowrap">
                      {(a.CARTERA || "").toUpperCase().includes("FCI") ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number" step="0.0001" min="0" max="1"
                            value={feeDrafts[a.unidad] ?? ""}
                            onChange={(e) => setFeeDrafts((p) => ({ ...p, [a.unidad]: e.target.value }))}
                            onBlur={() => saveFee(a)}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                            placeholder="—"
                            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[78px]"
                          />
                          <span className="text-[9px] text-[var(--t-text-muted)] tabular-nums w-[52px]">
                            {feeDrafts[a.unidad] && Number.isFinite(Number(feeDrafts[a.unidad]))
                              ? `= ${(Number(feeDrafts[a.unidad]) * 100).toFixed(2)}%` : ""}
                          </span>
                        </div>
                      ) : <span className="text-[var(--t-text-muted)]">—</span>}
                    </td>
                    <td className="px-2 py-1.5 text-[var(--t-text-muted)] text-[10px] w-px whitespace-nowrap">
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
                    <td className="px-3 py-1.5 text-[10px] w-px whitespace-nowrap">
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
  // Jerarquía de segmentación (combos nivel_1..5) + cuál input de nivel está
  // enfocado → para sugerir en cascada (nivel_N filtra por los niveles padre).
  const [niveles, setNiveles] = useState<Record<string, string>[]>([]);
  const [nivelFocus, setNivelFocus] = useState<{ row: string; level: ClienteCampo } | null>(null);
  // Filtros
  const [fOperador, setFOperador] = useState("");
  const [fNivel1, setFNivel1] = useState("");
  const [fNivel2, setFNivel2] = useState("");
  const [fNivel3, setFNivel3] = useState("");
  const [fNivel4, setFNivel4] = useState("");
  const [fNivel5, setFNivel5] = useState("");
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
    if (fNivel2) qs.set("nivel_2", fNivel2);
    if (fNivel3) qs.set("nivel_3", fNivel3);
    if (fNivel4) qs.set("nivel_4", fNivel4);
    if (fNivel5) qs.set("nivel_5", fNivel5);
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
        // Cuentas ordenadas por id_cuenta ascendente (numérico) — no desparramadas.
        const ordenadas = [...(d.clientes || [])].sort(
          (a, b) => (Number(a.id_cuenta) || 0) - (Number(b.id_cuenta) || 0),
        );
        setRows(ordenadas);
        const initial: Record<string, ClienteDraft> = {};
        for (const c of ordenadas) initial[c.id_cuenta] = draftFromCliente(c);
        setDrafts(initial);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch("/api/manager/clientes/values")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { values: Record<string, string[]>; operadores: { email: string; nombre: string }[]; niveles?: Record<string, string>[] }) => {
        setVals(d.values || {});
        setOperadores(d.operadores || []);
        setNiveles(d.niveles || []);
      })
      .catch(() => { /* silencioso */ });
  }, []);

  // Opciones del nivel ENFOCADO, filtradas por los niveles PADRE de esa fila:
  // nivel_N sugiere solo lo que co-ocurre con nivel_1..N-1 ya elegidos (padre
  // vacío = no filtra). Así no se cruzan valores de distintos nivel_1.
  const NIVELES_ORD: ClienteCampo[] = ["nivel_1", "nivel_2", "nivel_3", "nivel_4", "nivel_5"];
  const nivelDynOpts = useMemo(() => {
    if (!nivelFocus) return [];
    const idx = NIVELES_ORD.indexOf(nivelFocus.level);
    const draft = drafts[nivelFocus.row];
    if (idx < 0 || !draft) return [];
    const padres = NIVELES_ORD.slice(0, idx);
    const out = new Set<string>();
    for (const combo of niveles) {
      if (padres.every((p) => !draft[p] || combo[p] === draft[p]) && combo[nivelFocus.level]) {
        out.add(combo[nivelFocus.level]);
      }
    }
    return [...out].sort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivelFocus, drafts, niveles]);

  // Opciones del FILTRO de nivel 2: solo las que conviven con el nivel 1
  // elegido (mismo criterio de cascada que los combos de la tabla, sobre los
  // mismos datos ya cargados — sin pedirle nada más al backend). Una lista
  // plana mostraría valores de otros nivel_1 que siempre dan cero resultados.
  const opcionesNivel2 = useMemo(() => {
    const out = new Set<string>();
    for (const combo of niveles) {
      if ((!fNivel1 || combo["nivel_1"] === fNivel1) && combo["nivel_2"]) {
        out.add(combo["nivel_2"]);
      }
    }
    return [...out].sort();
  }, [niveles, fNivel1]);

  // Opciones del FILTRO de nivel 3: las que conviven con el nivel_1 / nivel_2
  // ya elegidos (mismo criterio de cascada).
  const opcionesNivel3 = useMemo(() => {
    const out = new Set<string>();
    for (const combo of niveles) {
      if ((!fNivel1 || combo["nivel_1"] === fNivel1) && (!fNivel2 || combo["nivel_2"] === fNivel2) && combo["nivel_3"]) {
        out.add(combo["nivel_3"]);
      }
    }
    return [...out].sort();
  }, [niveles, fNivel1, fNivel2]);

  // Opciones del FILTRO de nivel 4: conviven con nivel_1..3 elegidos.
  const opcionesNivel4 = useMemo(() => {
    const out = new Set<string>();
    for (const combo of niveles) {
      if ((!fNivel1 || combo["nivel_1"] === fNivel1) && (!fNivel2 || combo["nivel_2"] === fNivel2) && (!fNivel3 || combo["nivel_3"] === fNivel3) && combo["nivel_4"]) {
        out.add(combo["nivel_4"]);
      }
    }
    return [...out].sort();
  }, [niveles, fNivel1, fNivel2, fNivel3]);

  // Opciones del FILTRO de nivel 5: conviven con nivel_1..4 elegidos.
  const opcionesNivel5 = useMemo(() => {
    const out = new Set<string>();
    for (const combo of niveles) {
      if ((!fNivel1 || combo["nivel_1"] === fNivel1) && (!fNivel2 || combo["nivel_2"] === fNivel2) && (!fNivel3 || combo["nivel_3"] === fNivel3) && (!fNivel4 || combo["nivel_4"] === fNivel4) && combo["nivel_5"]) {
        out.add(combo["nivel_5"]);
      }
    }
    return [...out].sort();
  }, [niveles, fNivel1, fNivel2, fNivel3, fNivel4]);

  // Re-fetch al cambiar filtros de select. La búsqueda libre va por Enter/botón.
  useEffect(() => { fetchClientes(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [fOperador, fNivel1, fNivel2, fNivel3, fNivel4, fNivel5, campoVacio]);

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
      {/* Datalist dinámico de niveles: opciones en cascada del input enfocado. */}
      <datalist id="cli-nivel-dyn">
        {nivelDynOpts.map((v) => <option key={v} value={v} />)}
      </datalist>

      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">CLIENTES</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">{rows.length} resultados</span>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">OPERADOR</span>
        <select value={fOperador} onChange={(e) => setFOperador(e.target.value)}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          <option value="__vacio__">(sin operador)</option>
          {operadores.map((o) => <option key={o.email} value={o.email}>{o.nombre}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">NIVEL 1</span>
        <select value={fNivel1}
          onChange={(e) => {
            setFNivel1(e.target.value);
            // el nivel 2..5 elegido puede no existir dentro del nuevo nivel 1 →
            // sin esto quedaría un filtro invisible que devuelve cero
            setFNivel2("");
            setFNivel3("");
            setFNivel4("");
            setFNivel5("");
          }}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {(vals["nivel_1"] || []).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">NIVEL 2</span>
        <select value={fNivel2}
          onChange={(e) => {
            setFNivel2(e.target.value);
            // idem: los niveles inferiores pueden no convivir con el nuevo nivel 2
            setFNivel3("");
            setFNivel4("");
            setFNivel5("");
          }}
          title={fNivel1 ? `Subsegmentos dentro de ${fNivel1}` : "Subsegmento (nivel 2)"}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {opcionesNivel2.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">NIVEL 3</span>
        <select value={fNivel3}
          onChange={(e) => {
            setFNivel3(e.target.value);
            setFNivel4("");
            setFNivel5("");
          }}
          title={fNivel2 ? `Subsegmentos dentro de ${fNivel2}` : "Subsegmento (nivel 3)"}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {opcionesNivel3.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">NIVEL 4</span>
        <select value={fNivel4}
          onChange={(e) => {
            setFNivel4(e.target.value);
            setFNivel5("");
          }}
          title={fNivel3 ? `Subsegmentos dentro de ${fNivel3}` : "Subsegmento (nivel 4)"}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {opcionesNivel4.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">NIVEL 5</span>
        <select value={fNivel5} onChange={(e) => setFNivel5(e.target.value)}
          title={fNivel4 ? `Subsegmentos dentro de ${fNivel4}` : "Subsegmento (nivel 5)"}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none">
          <option value="">— todos —</option>
          {opcionesNivel5.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)]">CAMPO VACÍO</span>
        <select value={campoVacio} onChange={(e) => setCampoVacio(e.target.value as ClienteCampo | "")}
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
          title="Mostrar solo los clientes con este campo sin completar">
          <option value="">— sin filtro —</option>
          {CLIENTE_CAMPOS.map((c) => <option key={c} value={c}>{CLIENTE_CAMPO_LABEL[c]}</option>)}
        </select>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") fetchClientes(); }}
          placeholder="buscar id o nombre…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[170px]"
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
        <div className={`px-3 py-1.5 text-[10px] border-b border-[var(--t-border)] shrink-0 ${importMsg.ok ? "bg-[var(--t-tint-green)] text-green-400" : "bg-[var(--t-tint-red)] text-red-400"}`}>
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
                  <tr key={c.id_cuenta} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                    <td className="px-3 py-1.5 text-[var(--t-accent)] whitespace-nowrap">{c.id_cuenta}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text)] whitespace-nowrap max-w-[220px] truncate" title={c.denominacion ?? ""}>{c.denominacion ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <select
                        value={c.operador_email ?? ""}
                        onChange={(e) => saveOperador(c, e.target.value)}
                        title={c.operador_email ?? "sin operador"}
                        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none min-w-[120px] max-w-[170px]"
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
                          // observaciones = texto libre (sin datalist). nivel_N =
                          // datalist dinámico en cascada (filtra por niveles padre).
                          // resto = datalist plano del campo.
                          list={k === "observaciones" ? undefined : k.startsWith("nivel_") ? "cli-nivel-dyn" : `cli-${k}`}
                          onFocus={k.startsWith("nivel_") ? () => setNivelFocus({ row: c.id_cuenta, level: k }) : undefined}
                          value={draft[k]}
                          onChange={(e) => setDraftField(c.id_cuenta, k, e.target.value)}
                          onBlur={() => saveRow(c)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          placeholder="—"
                          className={`bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none ${k === "observaciones" ? "min-w-[180px]" : "min-w-[90px]"} w-full`}
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
  nivel_3?: string | null;
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
  const [nivelSel, setNivelSel] = useState<string | null>(null);
  const [nivel3Opts, setNivel3Opts] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [recalc, setRecalc] = useState(false);
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

  // Valores existentes de nivel_3 (para el select — NO se pueden crear nuevos).
  useEffect(() => {
    fetch("/api/manager/clientes/values")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { values?: Record<string, string[]> } | null) => setNivel3Opts(d?.values?.nivel_3 ?? []))
      .catch(() => { /* silencioso */ });
  }, []);

  // Segmentar inline: setea nivel_3 (solo valores existentes) vía PATCH.
  const saveNivel3 = async (id_cuenta: string, nivel_3: string) => {
    setSavingId(id_cuenta);
    try {
      const res = await fetch("/api/manager/clientes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cuenta, nivel_3 }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows((prev) => prev.map((c) => (c.id_cuenta === id_cuenta ? { ...c, nivel_3: nivel_3 || null } : c)));
    } catch {
      setImportMsg({ ok: false, text: `No se pudo guardar el nivel 3 de ${id_cuenta}.` });
    } finally {
      setSavingId(null);
    }
  };

  // Recalcular nivel_3 patrimonial de TODAS las activas (motor de segmentación).
  // Preview → confirmación → aplica. NO destructivo (no borra niveles existentes).
  const recalcularNiveles = async () => {
    setRecalc(true);
    setImportMsg(null);
    try {
      const post = (apply: boolean) =>
        fetch("/api/manager/clientes/recalcular-niveles", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apply }),
        }).then((r) => r.json());
      const prev = await post(false);
      if (!prev || prev.evaluadas == null) throw new Error("preview falló");
      if (!prev.cambios) {
        setImportMsg({ ok: true, text: "Niveles al día — no hay nada que recalcular." });
        return;
      }
      const warn = prev.sin_uva ? "\n⚠ Sin UVA cargada → las PJ no se calculan." : "";
      const ok = window.confirm(
        "Recalcular niveles patrimoniales\n(FCI/contraparte → PJ GRANDE; PH por cupo/MEP; PJ por cupo/UVA).\n\n" +
        `${prev.cambios} cuentas cambiarían de nivel (de ${prev.evaluadas} activas).\n` +
        `No borra los niveles existentes — solo asigna lo que puede derivar.${warn}\n\n¿Aplicar?`,
      );
      if (!ok) return;
      const res = await post(true);
      setImportMsg({ ok: true, text: `✓ Recalculado: ${res.modificadas} niveles actualizados de ${res.evaluadas} cuentas.` });
      fetchClientes();
    } catch {
      setImportMsg({ ok: false, text: "Error al recalcular niveles." });
    } finally {
      setRecalc(false);
    }
  };

  // Resumen de segmentación (nivel_3) sobre TODAS las cuentas — para ver de un
  // vistazo cuántas hay por nivel y cuántas sin segmentar. Click en un chip
  // filtra la tabla por ese nivel.
  const nivel3De = (c: ClienteFondeo) => c.nivel_3 || "(sin segmentar)";
  const tieneCupo = (c: ClienteFondeo) =>
    !!(c.cupo && (c.cupo.transaccional_ars != null || c.cupo.usado_ars != null));
  const resumenNivel = (() => {
    const m = new Map<string, number>();
    for (const c of rows) m.set(nivel3De(c), (m.get(nivel3De(c)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) =>
      // "(sin segmentar)" siempre al final; el resto por count desc.
      (a[0] === "(sin segmentar)" ? 1 : 0) - (b[0] === "(sin segmentar)" ? 1 : 0) || b[1] - a[1]);
  })();
  const nSinSegmentar = rows.filter((c) => !c.nivel_3).length;
  const nConCupo = rows.filter(tieneCupo).length;

  const visibles = rows.filter((c) => {
    if (nivelSel && nivel3De(c) !== nivelSel) return false;
    if (soloCargados) return tieneCupo(c);
    return true;
  });

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
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[170px]"
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
        <div className={`px-3 py-1.5 text-[10px] border-b border-[var(--t-border)] shrink-0 ${importMsg.ok ? "bg-[var(--t-tint-green)] text-green-400" : "bg-[var(--t-tint-red)] text-red-400"}`}>
          {importMsg.text}
          <button onClick={() => setImportMsg(null)} className="ml-2 text-[var(--t-text-dim)] hover:text-white">✕</button>
        </div>
      )}

      {/* Resumen de segmentación (nivel_3) — chips clickeables que filtran la tabla.
          "(sin segmentar)" resaltado en ámbar para verlo de un vistazo. */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] mr-1">Nivel 3:</span>
        <button onClick={() => setNivelSel(null)}
          className={"px-2 py-0.5 text-[10px] border tabular-nums " + (nivelSel === null ? "border-[var(--t-accent)] text-[var(--t-accent)] bg-[var(--t-accent)]/10" : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)]")}>
          TODAS <span className="font-semibold">{rows.length}</span>
        </button>
        {resumenNivel.map(([n, c]) => {
          const sinSeg = n === "(sin segmentar)";
          const active = nivelSel === n;
          return (
            <button key={n} onClick={() => setNivelSel(active ? null : n)}
              className={"px-2 py-0.5 text-[10px] border tabular-nums " + (active
                ? "border-[var(--t-accent)] text-[var(--t-accent)] bg-[var(--t-accent)]/10"
                : sinSeg
                  ? "border-amber-500/50 text-amber-400 hover:border-amber-500"
                  : "border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)]")}>
              {n} <span className="font-semibold">{c}</span>
            </button>
          );
        })}
        <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">
          sin segmentar <span className="font-semibold text-amber-400">{nSinSegmentar}</span>
          {" · "}con cupo <span className="font-semibold text-[var(--t-text)]">{nConCupo}</span>
        </span>
        <button onClick={recalcularNiveles} disabled={recalc || loading}
          className="px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-accent)]/60 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 transition-colors disabled:opacity-40"
          title="Recalcula el nivel_3 patrimonial de todas las cuentas activas (FCI/contraparte → PJ GRANDE; PH/PJ por cupo). No borra los niveles existentes; previsualiza antes de aplicar.">
          {recalc ? "Recalculando…" : "⟳ Recalcular niveles"}
        </button>
      </div>

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
                <th className="px-2 py-2">NIVEL 3</th>
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
                  <tr key={c.id_cuenta} className="border-b border-[var(--t-border)]/50 hover:bg-[var(--t-surface-2)]">
                    <td className="px-3 py-1.5 text-[var(--t-text)]">{c.id_cuenta}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text)]">{c.denominacion || "—"}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text-dim)]">{c.tipo_cliente || "—"}</td>
                    <td className="px-2 py-1.5">
                      <select value={c.nivel_3 ?? ""} disabled={savingId === c.id_cuenta}
                        onChange={(e) => saveNivel3(c.id_cuenta, e.target.value)}
                        className={"bg-[var(--t-panel)] border px-1.5 py-0.5 text-[10px] focus:outline-none focus:border-[var(--t-accent)] [color-scheme:dark] disabled:opacity-40 " + (c.nivel_3 ? "border-[var(--t-border-2)] text-[var(--t-text)]" : "border-amber-500/50 text-amber-400")}>
                        <option value="">— sin segmentar —</option>
                        {nivel3Opts.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
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
// ── Clientes → Control Automático (concilia Excel de CUITs ↔ cuentas) ──────────

interface ReconcFila {
  cuit: string; id_cuenta: string; denominacion: string | null;
  operador: string | null; nivel_1: string | null; ya_productor: boolean;
}
interface ReconcData {
  tenemos: ReconcFila[]; no_tenemos: { cuit: string }[];
  n_excel: number; n_tenemos: number; n_no_tenemos: number;
}

function TabControlAutomatico() {
  const [data, setData] = useState<ReconcData | null>(null);
  const [loading, setLoading] = useState(false);
  const [segmentando, setSegmentando] = useState(false);
  const [fileName, setFileName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const onFile = async (file: File) => {
    setMsg(null); setData(null); setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
      if (!json.length) { setMsg({ ok: false, text: "El archivo está vacío." }); return; }
      const cols = Object.keys(json[0]);
      // El CUIT está en 'Nº ident.fis.1' (normalizado → contiene 'identfis1').
      const cuitCol = cols.find((k) => k.toLowerCase().replace(/[^a-z0-9]/g, "").includes("identfis1"));
      if (!cuitCol) {
        setMsg({ ok: false, text: `No encontré la columna 'Nº ident.fis.1'. Columnas: ${cols.join(", ")}` });
        return;
      }
      const cuits = json.map((r) => String(r[cuitCol] ?? "").trim()).filter(Boolean);
      if (!cuits.length) { setMsg({ ok: false, text: `La columna '${cuitCol}' está vacía.` }); return; }
      setLoading(true);
      const r = await fetch("/api/manager/control-automatico/reconciliar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuits }),
      });
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  const segmentar = async () => {
    if (!data) return;
    const ids = data.tenemos.filter((t) => !t.ya_productor).map((t) => t.id_cuenta);
    if (!ids.length) { setMsg({ ok: true, text: "Todas las que tenemos ya son PRODUCTORES." }); return; }
    setSegmentando(true); setMsg(null);
    try {
      const r = await fetch("/api/manager/control-automatico/segmentar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_cuentas: ids }),
      });
      if (!r.ok) throw new Error(await r.text());
      const res = await r.json();
      setMsg({ ok: true, text: `✅ ${res.modificadas} cuenta(s) marcadas nivel_1 = PRODUCTORES.` });
      setData((d) => d ? { ...d, tenemos: d.tenemos.map((t) => ({ ...t, nivel_1: "PRODUCTORES", ya_productor: true })) } : d);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSegmentando(false);
    }
  };

  const pendientes = data ? data.tenemos.filter((t) => !t.ya_productor).length : 0;

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-2">
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <label className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] cursor-pointer transition-colors">
          {loading ? "Conciliando…" : "📄 Subir Excel"}
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </label>
        {fileName && <span className="text-[10px] text-[var(--t-text-dim)] font-mono">{fileName}</span>}
        {data && (
          <span className="text-[10px] text-[var(--t-text-muted)]">
            {data.n_excel} en el Excel · <span className="text-[var(--t-pos)] font-semibold">{data.n_tenemos} tenemos</span> · {data.n_no_tenemos} no
          </span>
        )}
        {data && data.n_tenemos > 0 && (
          <button onClick={segmentar} disabled={segmentando || pendientes === 0}
            className="ml-auto px-3 py-1 text-[10px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40 transition-colors">
            {segmentando ? "Segmentando…" : `Segmentar a PRODUCTORES (${pendientes})`}
          </button>
        )}
      </div>
      {msg && <div className={`text-[10px] shrink-0 ${msg.ok ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}>{msg.text}</div>}
      {!data && !loading && (
        <div className="text-[10px] text-[var(--t-text-muted)] p-2">
          Subí el Excel de clientes (el CUIT se lee de la columna <span className="font-mono">Nº ident.fis.1</span>).
          Te muestro cuáles tenemos (con su id de cuenta) y cuáles no; el botón marca las que tenemos como
          productores de nivel 1.
        </div>
      )}

      {data && (
        <div className="flex-1 min-h-0 flex gap-3">
          {/* TENEMOS */}
          <div className="w-2/3 min-h-0 flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)]">
            <div className="px-3 py-1 border-b border-[var(--t-border)] bg-[var(--t-pos)]/10 text-[10px] font-semibold text-[var(--t-pos)] tracking-widest shrink-0">
              LAS QUE TENEMOS ({data.n_tenemos})
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="text-[9px] text-[var(--t-text-muted)] tracking-wider sticky top-0 bg-[var(--t-panel)]">
                  <tr>
                    <th className="text-left px-2 py-1">CUIT</th>
                    <th className="text-left px-2 py-1">ID CUENTA</th>
                    <th className="text-left px-2 py-1">DENOMINACIÓN</th>
                    <th className="text-left px-2 py-1">OPERADOR</th>
                    <th className="text-left px-2 py-1">NIVEL 1</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tenemos.map((t) => (
                    <tr key={t.id_cuenta} className="border-b border-[var(--t-border)]/40">
                      <td className="px-2 py-0.5 font-mono text-[var(--t-text-dim)]">{t.cuit}</td>
                      <td className="px-2 py-0.5 font-mono text-[var(--t-accent)]">{t.id_cuenta}</td>
                      <td className="px-2 py-0.5 text-[var(--t-text)]">{t.denominacion ?? "—"}</td>
                      <td className="px-2 py-0.5 text-[var(--t-text-muted)]">{t.operador ?? "—"}</td>
                      <td className="px-2 py-0.5 font-mono">
                        {t.ya_productor
                          ? <span className="text-[var(--t-pos)]">PRODUCTORES</span>
                          : <span className="text-[var(--t-text-muted)]">{t.nivel_1 ?? "—"}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* NO TENEMOS */}
          <div className="w-1/3 min-h-0 flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)]">
            <div className="px-3 py-1 border-b border-[var(--t-border)] bg-[var(--t-text-muted)]/10 text-[10px] font-semibold text-[var(--t-text-muted)] tracking-widest shrink-0">
              NO LAS TENEMOS ({data.n_no_tenemos})
            </div>
            <div className="flex-1 overflow-y-auto p-1">
              {data.no_tenemos.map((n, i) => (
                <div key={i} className="px-2 py-0.5 font-mono text-[10px] text-[var(--t-text-dim)]">{n.cuit}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Clientes → Sin Operador (cuentas que caen en "(sin operador)" del ranking) ──

interface SinOpFila {
  id_cuenta: string; vol: number; cuenta?: string;
  denominacion?: string; estado?: string; categoria?: string;
}
interface SinOpData {
  clientes_sin_operador: SinOpFila[];
  no_clientes: SinOpFila[];
  resumen_no_clientes: { categoria: string; n: number; vol: number }[];
  n_clientes_sin_op: number; n_no_clientes: number; sin_clasificar: number;
}

function TabSinOperador() {
  const [data, setData] = useState<SinOpData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [catFilter, setCatFilter] = useState<string>("SIN CLASIFICAR");

  const cargar = useCallback(() => {
    setLoading(true); setErr(null);
    fetch("/api/manager/clientes/sin-operador", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: SinOpData) => setData(d))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-2">
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">SIN OPERADOR</span>
        {data && (
          <span className="text-[10px] text-[var(--t-text-muted)]">
            <span className="text-[var(--t-neg)] font-semibold">{data.n_clientes_sin_op}</span> clientes reales sin operador
            {" · "}{data.n_no_clientes} no-clientes
            {data.sin_clasificar > 0 && <span className="text-[#ff9900]">{" · ⚠ "}{data.sin_clasificar} sin clasificar</span>}
          </span>
        )}
        <button onClick={cargar} disabled={loading}
          className="ml-auto px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-40 transition-colors">
          {loading ? "Calculando…" : "↻ Recalcular"}
        </button>
      </div>
      {err && <div className="text-[10px] text-[var(--t-neg)] shrink-0">Error: {err}</div>}
      {!data && !loading && <div className="text-[10px] text-[var(--t-text-muted)] p-2">Cargando…</div>}

      {data && (
        <div className="flex-1 min-h-0 flex gap-3">
          {/* A: clientes reales sin operador → accionable */}
          <div className="w-1/3 min-h-0 flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)]">
            <div className="px-3 py-1 border-b border-[var(--t-border)] bg-[var(--t-neg)]/10 text-[10px] font-semibold text-[var(--t-neg)] tracking-widest shrink-0">
              CLIENTES REALES SIN OPERADOR ({data.n_clientes_sin_op})
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="text-[9px] text-[var(--t-text-muted)] tracking-wider sticky top-0 bg-[var(--t-panel)]">
                  <tr>
                    <th className="text-left px-2 py-1">ID</th>
                    <th className="text-left px-2 py-1">DENOMINACIÓN</th>
                    <th className="text-right px-2 py-1">VOL (ARS)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.clientes_sin_operador.map((f) => (
                    <tr key={f.id_cuenta} className="border-b border-[var(--t-border)]/40">
                      <td className="px-2 py-0.5 font-mono text-[var(--t-accent)]">{f.id_cuenta}</td>
                      <td className="px-2 py-0.5 text-[var(--t-text)]">{f.denominacion ?? "—"}</td>
                      <td className="px-2 py-0.5 font-mono text-[var(--t-text-dim)] text-right">{fmt(f.vol)}</td>
                    </tr>
                  ))}
                  {data.clientes_sin_operador.length === 0 && (
                    <tr><td colSpan={3} className="px-2 py-2 text-[10px] text-[var(--t-pos)]">✓ Ningún cliente real quedó sin operador.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {/* B: no-clientes — DETALLE con filtro por categoría (SIN CLASIFICAR = revisar) */}
          <div className="w-2/3 min-h-0 flex flex-col border border-[var(--t-border)] bg-[var(--t-panel)]">
            <div className="px-2 py-1 border-b border-[var(--t-border)] bg-[var(--t-text-muted)]/10 flex items-center gap-1 flex-wrap shrink-0">
              <span className="text-[10px] font-semibold text-[var(--t-text-muted)] tracking-widest mr-1">NO-CLIENTES</span>
              <button onClick={() => setCatFilter("")}
                className={`px-1.5 py-0.5 text-[9px] border font-mono ${catFilter === "" ? "border-[var(--t-accent)] text-[var(--t-accent)]" : "border-[var(--t-border-2)] text-[var(--t-text-dim)]"}`}>
                todas ({data.n_no_clientes})
              </button>
              {data.resumen_no_clientes.map((r) => {
                const sc = r.categoria === "SIN CLASIFICAR";
                const on = catFilter === r.categoria;
                return (
                  <button key={r.categoria} onClick={() => setCatFilter(r.categoria)}
                    className={`px-1.5 py-0.5 text-[9px] border font-mono ${on ? "border-[var(--t-accent)] text-[var(--t-accent)]" : sc ? "border-[#ff9900] text-[#ff9900]" : "border-[var(--t-border-2)] text-[var(--t-text-dim)]"}`}>
                    {sc ? "⚠ " : ""}{r.categoria} ({r.n})
                  </button>
                );
              })}
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="text-[9px] text-[var(--t-text-muted)] tracking-wider sticky top-0 bg-[var(--t-panel)]">
                  <tr>
                    <th className="text-left px-2 py-1">ID CUENTA</th>
                    <th className="text-left px-2 py-1">CUENTA (cruda)</th>
                    <th className="text-left px-2 py-1">CATEGORÍA</th>
                    <th className="text-right px-2 py-1">VOLUMEN (ARS)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.no_clientes
                    .filter((f) => !catFilter || f.categoria === catFilter)
                    .map((f) => {
                      const sc = f.categoria === "SIN CLASIFICAR";
                      return (
                        <tr key={f.id_cuenta} className="border-b border-[var(--t-border)]/40">
                          <td className="px-2 py-0.5 font-mono text-[var(--t-text-dim)]">{f.id_cuenta}</td>
                          <td className="px-2 py-0.5 text-[var(--t-text)]">{f.cuenta ?? "—"}</td>
                          <td className={`px-2 py-0.5 font-mono ${sc ? "text-[#ff9900]" : "text-[var(--t-text-muted)]"}`}>{f.categoria}</td>
                          <td className="px-2 py-0.5 font-mono text-[var(--t-text-dim)] text-right">{fmt(f.vol)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabClientes({ canBulk = true }: { canBulk?: boolean }) {
  const [subTab, setSubTab] = usePersistedState<"segmentacion" | "control" | "sinoperador" | "fondeos">("manager.cli.subtab", "segmentacion");
  const subs = canBulk
    ? ([
        { id: "segmentacion", label: "SEGMENTACIÓN" },
        { id: "control",      label: "CONTROL AUTO" },
        { id: "sinoperador",  label: "SIN OPERADOR" },
        { id: "fondeos",      label: "FONDEOS" },
      ] as const)
    : ([
        { id: "segmentacion", label: "SEGMENTACIÓN" },
        { id: "control",      label: "CONTROL AUTO" },
        { id: "sinoperador",  label: "SIN OPERADOR" },
      ] as const);
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
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
        {subTab === "control" && <TabControlAutomatico />}
        {subTab === "sinoperador" && <TabSinOperador />}
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
            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-accent)] font-mono min-w-[180px] focus:border-[var(--t-accent)] focus:outline-none"
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
            className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono min-w-[300px] focus:border-[var(--t-accent)] focus:outline-none"
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
            className="flex-1 min-w-[200px] bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[11px] px-2 py-1 text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
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
            Actualizado {new Date(discData.generated_at).toLocaleString("es-AR")}
            {discData.stale_h !== null && ` (hace ${discData.stale_h}h)`}
          </div>
        )}
      </div>

      {/* Banner si no hay data */}
      {discData && !discData.ok && (
        <div className="border border-[#ff7f7f]/40 bg-[var(--t-tint-red)] p-3 text-[10px] text-[var(--t-neg)] italic">
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
                    <td className="px-3 py-1 text-[var(--t-pos)]">{inst.ticker}</td>
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

type Tab =
  | "observabilidad"
  | "validaciones"
  | "titulos"
  | "clientes"
  | "contrapartes"
  | "aca-valores"
  | "compliance"
  | "aunesa"
  | "operaciones"
  | "documentos"
  | "usuarios";

// AUNESA es un grupo con tres sub-vistas:
//  - FLUJO:    explorador de movimientos de Aunesa.
//  - AUM:      consulta de Valuaciones.AuM (la base) por cuenta/fecha.
//  - POSICIÓN: pega EN VIVO a Aunesa (posicionValuada) — para comparar
//              lo que Aunesa manda contra lo persistido en AUM.
// ── Grupos consolidados (sub-tabs con Pill, patrón AunesaGroup) ───────────────

const GROUP_HEADER = "flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0";
const GROUP_TITLE = "text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mr-2";

// OBSERVABILIDAD: consolida CONTROLES (calidad de datos) + DIAGNÓSTICO
// (frescura de motores/jobs + recursos + logs) + JOBS (catálogo completo desde
// el crontab + historial). La pill CONTROLES lleva "!" si hay anomalías.
// ── OBSERVABILIDAD → USO: heatmap usuario × módulo (manager.uso_modulos) ─────
// Telemetría de producto: qué usuario pasa tiempo en qué módulo. Tabla con
// celdas coloreadas por intensidad (sin librería de charts), rango 7/30 días.
interface UsoResp {
  dias: number;
  usuarios: string[];
  modulos: string[];
  celdas: Record<string, Record<string, number>>;
  totales_modulo: Record<string, number>;
  totales_usuario: Record<string, number>;
  total: number;
}

function UsoPanel() {
  const [dias, setDias] = useState<7 | 30>(7);
  const [data, setData] = useState<UsoResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setErr(null);
    fetch(`/api/manager/uso?dias=${dias}`, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: UsoResp) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "error"); });
    return () => { alive = false; };
  }, [dias]);

  const maxCelda = useMemo(() => {
    if (!data) return 1;
    let m = 1;
    for (const u of data.usuarios) {
      for (const mod of data.modulos) m = Math.max(m, data.celdas[u]?.[mod] ?? 0);
    }
    return m;
  }, [data]);

  // intensidad por celda: alpha ~ sqrt(hits/max) — el sqrt evita que un power
  // user aplaste el color del resto
  const celda = (hits: number) =>
    hits === 0 ? undefined : { background: `rgba(47,127,224,${0.08 + 0.5 * Math.sqrt(hits / maxCelda)})` };

  return (
    <div className="h-full overflow-auto p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-text-muted)]">
          Uso por módulo {data ? `· ${data.total.toLocaleString("es-AR")} requests` : ""}
        </span>
        <div className="flex rounded overflow-hidden border border-[var(--t-border-2)] ml-auto">
          {([7, 30] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDias(d)}
              className={`text-[10px] font-semibold px-2.5 py-0.5 ${dias === d ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-muted)]"}`}>
              {d} días
            </button>
          ))}
        </div>
      </div>
      {err && <p className="text-[11px] text-[var(--t-neg)]">No pude cargar el uso ({err}).</p>}
      {data && data.usuarios.length === 0 && !err && (
        <p className="text-[11px] text-[var(--t-text-muted)]">
          Sin datos todavía — la telemetría acumula desde el deploy (flush cada ~60s).
        </p>
      )}
      {data && data.usuarios.length > 0 && (
        <table>
          <thead>
            <tr>
              <th className="text-left">USUARIO</th>
              {data.modulos.map((m) => <th key={m} className="text-right">{m.toUpperCase()}</th>)}
              <th className="text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {data.usuarios.map((u) => (
              <tr key={u}>
                <td className="text-[var(--t-accent)]">{u.split("@")[0]}</td>
                {data.modulos.map((m) => {
                  const hits = data.celdas[u]?.[m] ?? 0;
                  return (
                    <td key={m} className="text-right tabular-nums" style={celda(hits)}>
                      {hits ? hits.toLocaleString("es-AR") : "·"}
                    </td>
                  );
                })}
                <td className="text-right font-bold">{(data.totales_usuario[u] ?? 0).toLocaleString("es-AR")}</td>
              </tr>
            ))}
            <tr className="border-t border-[var(--t-border-2)]">
              <td className="text-[10px] uppercase text-[var(--t-text-muted)]">total módulo</td>
              {data.modulos.map((m) => (
                <td key={m} className="text-right font-bold tabular-nums">
                  {(data.totales_modulo[m] ?? 0).toLocaleString("es-AR")}
                </td>
              ))}
              <td className="text-right font-bold">{data.total.toLocaleString("es-AR")}</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="text-[10px] text-[var(--t-text-muted)] mt-2">
        Requests autenticados agregados por hora (no incluye invitados ni servicios).
      </p>
    </div>
  );
}

function ObservabilidadGroup({ goTo, modules }: { goTo: (tab: Tab) => void; modules?: string[] | null }) {
  const [subRaw, setSub] = usePersistedState<"controles" | "diagnostico" | "jobs" | "base" | "ia" | "uso">(
    "manager.obs.sub", "controles");
  // La pill IA solo existe con el módulo `ia` (marca AI, canary del RBAC).
  // Guard sobre el estado persistido: si tildaron IA y después se lo sacaron
  // al rol, no dejar la tab clavada en contenido inaccesible.
  const canIa = modules == null || modules.includes("ia");
  const sub = subRaw === "ia" && !canIa ? "controles" : subRaw;
  const [anomalias, setAnomalias] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/manager/controles?resueltos_dias=0", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { totales?: Record<string, number> } | null) => {
        if (alive && j?.totales) {
          setAnomalias(Object.values(j.totales).reduce((s, n) => s + n, 0));
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [sub]); // re-chequea el badge al cambiar de sub-tab (barato: lee la tabla)
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>OBSERVABILIDAD</span>
        <Pill
          label={`CONTROLES${anomalias ? ` !${anomalias}` : ""}`}
          active={sub === "controles"}
          onClick={() => setSub("controles")}
        />
        <Pill label="DIAGNÓSTICO" active={sub === "diagnostico"} onClick={() => setSub("diagnostico")} />
        <Pill label="JOBS" active={sub === "jobs"} onClick={() => setSub("jobs")} />
        <Pill label="BASE" active={sub === "base"} onClick={() => setSub("base")} />
        <Pill label="USO" active={sub === "uso"} onClick={() => setSub("uso")} />
        {canIa && <Pill label="IA" active={sub === "ia"} onClick={() => setSub("ia")} />}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "controles"   && <ControlesPanel goTo={(t) => goTo(t as Tab)} />}
        {sub === "diagnostico" && <DiagnosticoGroup />}
        {sub === "jobs"        && <JobsGroup />}
        {sub === "base"        && <DbBasePanel />}
        {sub === "ia"          && <IaPanel />}
        {sub === "uso"         && <UsoPanel />}
      </div>
    </div>
  );
}

// BASE: espacio/salud de la base — tamaño total vs límite del plan, por schema,
// y top tablas con bloat (dead tuples) + último dato. Fuente:
// /api/manager/db-observabilidad (cache 2 min en el backend).
type DbTablaObs = {
  schema: string; tabla: string;
  total_bytes: number; tabla_bytes: number; indices_bytes: number;
  filas_vivas: number; filas_muertas: number; dead_pct: number;
  ultimo_dato: string | null; last_autovacuum: string | null;
};
type DbObs = {
  total_bytes: number; limit_bytes: number; usado_pct: number | null;
  schemas: { schema: string; bytes: number; tablas: number }[];
  tablas: DbTablaObs[];
};

function fmtBytesDb(n: number | null | undefined): string {
  if (n == null) return "—";
  let v = n;
  for (const u of ["B", "KB", "MB", "GB", "TB"]) {
    if (Math.abs(v) < 1024) return `${v.toFixed(1)}${u}`;
    v /= 1024;
  }
  return `${v.toFixed(1)}PB`;
}

function DbBasePanel() {
  const [data, setData] = useState<DbObs | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetch("/api/manager/db-observabilidad", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: DbObs) => { if (alive) { setData(j); setErr(null); } })
        .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "error"); });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (err) return <p className="p-3 text-[11px] text-[var(--t-neg)]">Error: {err}</p>;
  if (!data) return <p className="p-3 text-[11px] text-[var(--t-text-dim)]">cargando…</p>;

  const pct = data.usado_pct ?? 0;
  const pctColor = pct >= 85 ? "var(--t-neg)" : pct >= 65 ? "#ff9900" : "var(--t-pos)";
  const maxSchema = Math.max(1, ...data.schemas.map((s) => s.bytes));

  return (
    <div className="h-full min-h-0 overflow-auto p-3 flex flex-col gap-4">
      {/* Gauge total vs límite del plan */}
      <div>
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <span className="text-[11px] uppercase tracking-widest text-[var(--t-accent)]">Espacio de la base</span>
          <span className="text-[11px] font-mono">{fmtBytesDb(data.total_bytes)} / {fmtBytesDb(data.limit_bytes)}</span>
          <span className="ml-auto text-[14px] font-bold font-mono" style={{ color: pctColor }}>{pct}%</span>
        </div>
        <div className="h-2.5 w-full bg-[var(--t-border)] rounded-sm overflow-hidden">
          <div style={{ width: `${Math.min(100, pct)}%`, background: pctColor }} className="h-full" />
        </div>
        <div className="text-[9px] text-[var(--t-text-muted)] mt-1">
          Límite del plan configurable (env <span className="font-mono">DB_DISK_LIMIT_GB</span>, default 8 = Supabase Pro).
        </div>
      </div>

      {/* Por schema */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--t-text-dim)] mb-1">Por schema</div>
        <div className="flex flex-col gap-0.5">
          {data.schemas.map((s) => (
            <div key={s.schema} className="flex items-center gap-2 text-[10px]">
              <span className="w-28 font-mono text-[var(--t-text)] truncate">{s.schema}</span>
              <div className="flex-1 h-2.5 bg-[var(--t-border)] rounded-sm overflow-hidden">
                <div style={{ width: `${(s.bytes / maxSchema) * 100}%` }} className="h-full bg-[var(--t-accent)]" />
              </div>
              <span className="w-16 text-right font-mono text-[var(--t-text-dim)]">{fmtBytesDb(s.bytes)}</span>
              <span className="w-16 text-right text-[9px] text-[var(--t-text-muted)]">{s.tablas} tablas</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top tablas */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--t-text-dim)] mb-1">Top tablas por tamaño</div>
        <table className="w-full text-[10px] tabular-nums">
          <thead className="text-[9px] uppercase text-[var(--t-text-muted)]">
            <tr>
              <th className="text-left px-2 py-1">Tabla</th>
              <th className="text-right px-2 py-1">Total</th>
              <th className="text-right px-2 py-1">Índices</th>
              <th className="text-right px-2 py-1">Filas</th>
              <th className="text-right px-2 py-1">Muertas</th>
              <th className="text-right px-2 py-1">Dead%</th>
              <th className="text-right px-2 py-1">Últ. dato</th>
            </tr>
          </thead>
          <tbody>
            {data.tablas.map((t) => {
              const bloat = t.dead_pct > 20 && t.filas_muertas > 10_000;
              return (
                <tr key={`${t.schema}.${t.tabla}`} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                  <td className="px-2 py-1 font-mono text-[var(--t-text-dim)]">{t.schema}.<span className="text-[var(--t-text)]">{t.tabla}</span></td>
                  <td className="px-2 py-1 text-right font-mono font-semibold">{fmtBytesDb(t.total_bytes)}</td>
                  <td className="px-2 py-1 text-right font-mono text-[var(--t-text-dim)]">{fmtBytesDb(t.indices_bytes)}</td>
                  <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{t.filas_vivas.toLocaleString("es-AR")}</td>
                  <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{t.filas_muertas.toLocaleString("es-AR")}</td>
                  <td className="px-2 py-1 text-right font-semibold" style={{ color: bloat ? "var(--t-neg)" : "var(--t-text-dim)" }}>{t.dead_pct}%</td>
                  <td className="px-2 py-1 text-right text-[9px] text-[var(--t-text-muted)]">{t.ultimo_dato ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// DIAGNÓSTICO: Motores (rediseñado 50/50) + Recursos + Logs.
function DiagnosticoGroup() {
  const [sub, setSub] = usePersistedState<"motores" | "recursos" | "logs">("manager.diag.sub", "motores");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>DIAGNÓSTICO</span>
        <Pill label="ÁRBOL" active={sub === "motores"} onClick={() => setSub("motores")} />
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
  const [sub, setSub] = usePersistedState<"checks" | "opciones" | "xirr" | "tea">("manager.valid.sub", "checks");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>VALIDACIONES</span>
        <Pill label="VALIDACIONES" active={sub === "checks"} onClick={() => setSub("checks")} />
        <Pill label="OPCIONES VTO" active={sub === "opciones"} onClick={() => setSub("opciones")} />
        <Pill label="DEBUG XIRR" active={sub === "xirr"} onClick={() => setSub("xirr")} />
        <Pill label="DEBUG TEA" active={sub === "tea"} onClick={() => setSub("tea")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "checks"   && <TabValidaciones />}
        {sub === "opciones" && <div className="h-full overflow-y-auto p-3"><OpcionesExpiriesPanel /></div>}
        {sub === "xirr"     && <ManagerDebugXirrPanel />}
        {sub === "tea"      && <ManagerDebugTeaPanel />}
      </div>
    </div>
  );
}

// ── ONs (Trading.BondsMaster) — segmentar + alta/edición con flujos ──
interface ONFlujo { fecha: string; amortizacion: number; interes: number; valor_residual: number }
interface ONMaster {
  asset: string;
  emisor?: string | null;
  moneda_flujo?: string | null;
  tasa_cupon?: number | null;
  vencimiento?: string | null;
  sector?: string | null;
  tickers?: { ARS?: string | null; USD?: string | null } | null;
  flujos?: ONFlujo[] | null;
}

const ON_SECTORES = ["energia", "finanzas", "otros"];

function _onNum(s: string): number {
  let t = (s || "").replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", "."); // formato es-AR
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}
const _onInput =
  "bg-[var(--t-surface-2)] border border-[var(--t-border)] px-1.5 py-0.5 text-[11px] w-full";

// Tickers ROFEX: el usuario tipea SOLO el código (ej. 'YM40O'); el
// 'MERV - XMEV - … - 24hs' se arma solo alrededor.
function wrapTicker(code: string): string | undefined {
  const c = (code || "").trim().toUpperCase();
  return c ? `MERV - XMEV - ${c} - 24hs` : undefined;
}
function unwrapTicker(full?: string | null): string {
  if (!full) return "";
  const parts = full.split(" - ");
  return parts.length >= 3 ? parts[2] : full;
}

function OnField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)]">{label}</span>
      {children}
    </label>
  );
}

interface ONPrefill { asset?: string; emisor?: string; moneda_flujo?: string }

function TabOnsAlta({ prefill, onSaved }: { prefill?: ONPrefill | null; onSaved?: () => void }) {
  const empty = { asset: "", emisor: "", moneda_flujo: "USD", tasa_cupon: "", vencimiento: "", sector: "otros", tkARS: "", tkUSD: "" };
  // prefill viene del conciliador (botón "dar de alta"); el padre fuerza remount
  // con key, así el initializer lo toma sin efectos.
  const [form, setForm] = useState({
    ...empty,
    ...(prefill ? { asset: prefill.asset || "", emisor: prefill.emisor || "", moneda_flujo: prefill.moneda_flujo || "USD", tkARS: prefill.asset || "" } : {}),
  });
  const [flujosText, setFlujosText] = useState("");
  const [flujos, setFlujos] = useState<ONFlujo[]>([]);
  const [formato, setFormato] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [existentes, setExistentes] = useState<ONMaster[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/manager/ons").then((r) => r.json())
      .then((d: { ons: ONMaster[] }) => { if (alive) setExistentes(d.ons || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const sumAmort = flujos.reduce((s, f) => s + f.amortizacion, 0);

  // Parsea el texto pegado en el server (entiende el formato oficial BYMA/IAMC).
  const parsear = async (texto: string) => {
    if (!texto.trim()) { setFlujos([]); setFormato(""); return; }
    try {
      const r = await fetch("/api/manager/ons/parse-flujos", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }),
      });
      const d = await r.json();
      setFlujos(d.flujos || []);
      setFormato(d.formato || "");
      // Auto-completa tasa/vto si vinieron en la descarga y el form está vacío.
      setForm((f) => ({
        ...f,
        tasa_cupon: f.tasa_cupon || (d.tasa_cupon != null ? String(d.tasa_cupon) : ""),
        vencimiento: f.vencimiento || (d.vencimiento || ""),
      }));
    } catch { /* deja el preview vacío */ }
  };

  // Subir el archivo de la descarga (CSV/Excel-guardado-como-csv) y previsualizar.
  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      setFlujosText(text);
      parsear(text);
    };
    reader.readAsText(file);
  };

  const cargarExistente = (asset: string) => {
    const o = existentes.find((x) => x.asset === asset);
    if (!o) { setForm({ ...empty }); setFlujosText(""); setFlujos([]); return; }
    setForm({
      asset: o.asset, emisor: o.emisor || "", moneda_flujo: (o.moneda_flujo || "USD").toUpperCase(),
      tasa_cupon: o.tasa_cupon != null ? String(o.tasa_cupon) : "", vencimiento: (o.vencimiento || "").slice(0, 10),
      sector: (o.sector || "otros").toLowerCase(), tkARS: unwrapTicker(o.tickers?.ARS), tkUSD: unwrapTicker(o.tickers?.USD),
    });
    const txt = (o.flujos || []).map((f) => `${f.fecha}\t${f.amortizacion ?? 0}\t${f.interes ?? 0}\t${f.valor_residual ?? 100}`).join("\n");
    setFlujosText(txt);
    setFlujos((o.flujos || []).map((f) => ({ fecha: f.fecha, amortizacion: f.amortizacion ?? 0, interes: f.interes ?? 0, valor_residual: f.valor_residual ?? 100 })));
    setFormato("");
    setMsg(null);
  };

  const guardar = async () => {
    if (!form.asset.trim()) { setMsg({ kind: "err", text: "Falta el asset (ticker corto)" }); return; }
    setSaving(true); setMsg(null);
    const body = {
      asset: form.asset.trim(),
      emisor: form.emisor.trim() || undefined,
      moneda_flujo: form.moneda_flujo,
      tasa_cupon: form.tasa_cupon ? _onNum(form.tasa_cupon) : undefined,
      vencimiento: form.vencimiento || undefined,
      sector: form.sector,
      tickers: { ARS: wrapTicker(form.tkARS), USD: wrapTicker(form.tkUSD) },
      flujos: flujos.length ? flujos : undefined,
    };
    try {
      const r = await fetch("/api/manager/ons", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const txt = await r.text();
      let d: { detail?: string } = {};
      try { d = JSON.parse(txt); } catch { /* respuesta no-JSON (ej. 500 HTML) */ }
      if (!r.ok) throw new Error(d.detail || txt.slice(0, 300) || `HTTP ${r.status}`);
      setMsg({ kind: "ok", text: "Guardada en Curvas (on_*)." });
      fetch("/api/manager/ons").then((x) => x.json()).then((d2: { ons: ONMaster[] }) => setExistentes(d2.ons || [])).catch(() => {});
      onSaved?.();  // avisa al padre → refresca el conciliador (el bono ya no falta)
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) });
    } finally { setSaving(false); }
  };

  return (
    <div className="h-full overflow-auto p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Editar existente</span>
        <select className={_onInput + " w-auto"} value={form.asset} onChange={(e) => cargarExistente(e.target.value)}>
          <option value="">— nueva ON —</option>
          {existentes.map((o) => <option key={o.asset} value={o.asset}>{o.asset} · {o.emisor}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <OnField label="Asset (ticker corto)"><input className={_onInput} value={form.asset} onChange={(e) => setForm({ ...form, asset: e.target.value })} placeholder="YM40O" /></OnField>
        <OnField label="Emisor"><input className={_onInput} value={form.emisor} onChange={(e) => setForm({ ...form, emisor: e.target.value })} placeholder="YPF" /></OnField>
        <OnField label="Moneda flujo"><select className={_onInput} value={form.moneda_flujo} onChange={(e) => setForm({ ...form, moneda_flujo: e.target.value })}><option value="USD">USD (hard dollar)</option><option value="DL">DL (dólar linked)</option><option value="ARS">ARS (peso)</option></select></OnField>
        <OnField label="Sector"><select className={_onInput} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}>{ON_SECTORES.map((s) => <option key={s} value={s}>{s}</option>)}</select></OnField>
        <OnField label="Tasa cupón (ej 0.075)"><input className={_onInput} value={form.tasa_cupon} onChange={(e) => setForm({ ...form, tasa_cupon: e.target.value })} placeholder="0.075" /></OnField>
        <OnField label="Vencimiento"><input type="date" className={_onInput} value={form.vencimiento} onChange={(e) => setForm({ ...form, vencimiento: e.target.value })} /></OnField>
      </div>

      {/* Tickers ROFEX: el usuario pone SOLO el código; el MERV-XMEV-…-24hs va fijo. */}
      <div className="grid grid-cols-2 gap-2">
        <OnField label="Ticker ARS (solo el código)">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">MERV - XMEV -</span>
            <input className={_onInput + " text-center font-semibold"} value={form.tkARS}
              onChange={(e) => setForm({ ...form, tkARS: e.target.value.toUpperCase() })} placeholder="YM40O" />
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">- 24hs</span>
          </div>
        </OnField>
        <OnField label="Ticker USD (solo el código)">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">MERV - XMEV -</span>
            <input className={_onInput + " text-center font-semibold"} value={form.tkUSD}
              onChange={(e) => setForm({ ...form, tkUSD: e.target.value.toUpperCase() })} placeholder="YM40D" />
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">- 24hs</span>
          </div>
        </OnField>
      </div>

      <div>
        <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)]">
          Flujos del bono — subí el archivo de la descarga (BYMA/IAMC)
        </span>
        <div className="flex items-center gap-3 mt-1">
          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold bg-[#094293] text-white cursor-pointer hover:opacity-90">
            📁 EXAMINAR ARCHIVO
            <input type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />
          </label>
          {fileName
            ? <span className="text-[11px] text-[var(--t-text)] truncate max-w-[240px]" title={fileName}>{fileName}</span>
            : <span className="text-[11px] text-[var(--t-text-dim)]">ningún archivo seleccionado</span>}
          <button type="button" onClick={() => setShowPaste((s) => !s)} className={_onInput + " w-auto"}>
            {showPaste ? "ocultar" : "o pegar texto"}
          </button>
          {(flujos.length > 0 || flujosText) && (
            <button type="button"
              onClick={() => { setFlujos([]); setFlujosText(""); setFileName(""); setFormato(""); }}
              className="px-2 py-0.5 text-[11px] text-red-500 border border-[var(--t-border)] hover:bg-red-500/10">
              limpiar flujos
            </button>
          )}
        </div>
        {showPaste && (
          <textarea
            className={_onInput + " font-mono h-24 mt-1"}
            value={flujosText}
            onChange={(e) => setFlujosText(e.target.value)}
            onBlur={() => parsear(flujosText)}
            placeholder={"Pegá la descarga (con encabezados) o: fecha\tamort\tinterés\tresidual"}
          />
        )}
        {flujos.length > 0 && (
          <div className="mt-1.5">
            <div className="text-[10px] text-[var(--t-text-dim)] mb-1">
              {flujos.length} flujos{formato ? ` · ${formato}` : ""} · Σ amort {sumAmort.toFixed(0)}
              {sumAmort < 95 || sumAmort > 105 ? <span className="text-amber-500"> ⚠ ~100</span> : <span className="text-emerald-500"> ✓</span>}
              {" · vto "}{flujos[flujos.length - 1].fecha}
            </div>
            <div className="max-h-40 overflow-auto border border-[var(--t-border)]">
              <table>
                <thead>
                  <tr><th>#</th><th>Fecha</th><th className="text-right">Amort.</th><th className="text-right">Interés</th><th className="text-right">Residual</th><th></th></tr>
                </thead>
                <tbody>
                  {flujos.map((f, i) => (
                    <tr key={i}>
                      <td className="text-[var(--t-text-dim)]">{i + 1}</td>
                      <td className="tabular-nums">{f.fecha}</td>
                      <td className="text-right tabular-nums">{f.amortizacion}</td>
                      <td className="text-right tabular-nums">{f.interes}</td>
                      <td className="text-right tabular-nums">{f.valor_residual}</td>
                      <td className="text-center">
                        <button type="button" title="borrar este flujo"
                          onClick={() => setFlujos((fs) => fs.filter((_, j) => j !== i))}
                          className="text-red-500 hover:bg-red-500/10 px-1">×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={guardar} disabled={saving}
          className="px-3 py-1 text-[11px] font-semibold bg-[#094293] text-white disabled:opacity-50">
          {saving ? "Guardando…" : "GUARDAR ON"}
        </button>
        {msg && <span className={"text-[11px] " + (msg.kind === "ok" ? "text-emerald-500" : "text-red-500")}>{msg.text}</span>}
      </div>
      <p className="text-[10px] text-[var(--t-text-muted)]">
        Al guardar, la ON aparece en la vista. Puede tardar unos minutos en cotizar
        en vivo (precio/TEA).
      </p>
    </div>
  );
}

// ── BONOS (tasa_fija / CER / soberanos) — editor directo a Trading.Curvas ──
// Gemelo de ONs pero para bonos que viven directo en Curvas (sin BondsMaster).
// Tipos de bono de Trading.Curvas — cada uno habilita sus campos y la shape de flujo
// (replica EXACTA de Curvas, no se inventa). bullet = solo flujo_vencimiento (sin array).
const BONO_TIPOS: { tipo: string; label: string; curva: string; bullet?: boolean; cols?: { k: string; label: string }[]; cer?: boolean; cupon?: boolean; tasaRef?: boolean }[] = [
  { tipo: "lecap",    label: "Lecap (bullet)",     curva: "tasa_fija", bullet: true },
  { tipo: "boncap",   label: "Boncap (bullet)",    curva: "tasa_fija", bullet: true },
  { tipo: "bono",     label: "Tasa fija c/ cupón", curva: "tasa_fija", cols: [{ k: "amortizacion", label: "Amort." }, { k: "interes", label: "Interés" }] },
  { tipo: "cer",      label: "CER",                curva: "cer",       cols: [{ k: "amortizacion_pct", label: "Amort. %" }, { k: "cupon_sobre_residual", label: "Cupón s/resid." }, { k: "residual_previo_pct", label: "Resid. previo %" }], cer: true, cupon: true },
  { tipo: "dual",     label: "Dual / TAMAR",       curva: "tamar",     cols: [{ k: "amortizacion_pct", label: "Amort. %" }], tasaRef: true },
  { tipo: "soberano", label: "Soberano (USD)",     curva: "soberanos", cols: [{ k: "amortizacion_pct", label: "Amort. %" }, { k: "cupon_sobre_residual", label: "Cupón s/resid." }] },
  { tipo: "dolar_linked", label: "Dólar Linked",   curva: "dolar_linked", cols: [{ k: "amortizacion_pct", label: "Amort. %" }, { k: "cupon_sobre_residual", label: "Cupón s/resid." }] },
];

interface BonoSinFlujo { unidad: string; ticker: string | null; cartera: string; emisor: string | null; fuente: string; accion: string; motivo: string; en_cartera: boolean }
interface BonoMaster { ticker_corto: string; ticker?: string; curva?: string; tipo?: string; moneda_flujo?: string; fecha_emision?: string; fecha_vencimiento?: string; valor_nominal?: number; cer_emision?: number; cupon_anual?: number; tasa_referencia?: string; flujo_vencimiento?: number; flujos?: Record<string, unknown>[] }
interface BonoPrefill { ticker_corto: string; ticker?: string; curva?: string; editTicker?: string }

interface ConcilResp { total: number; en_cartera: number; ok: boolean; por_fuente?: { curvas: number; on: number; ninguna: number }; titulos: BonoSinFlujo[] }

function TabBonosControl({ onDarDeAlta }: { onDarDeAlta: (b: BonoSinFlujo) => void }) {
  const [data, setData] = useState<ConcilResp | null>(null);
  const [loading, setLoading] = useState(false);
  // Bonos ignorados (ocultados del gap) — para poder revertir un ignore por error.
  const [ignoradas, setIgnoradas] = useState<{ ticker: string; ignorado_por?: string; at?: string }[]>([]);
  // Solapa: el gap (sin flujo) o los ignorados — separados para que la lista de
  // ignorados no crezca hacia abajo empujando el conciliador (pedido del user).
  const [vista, setVista] = useState<"gap" | "ignorados">("gap");
  const cargarIgnoradas = () => fetch("/api/manager/ons/ignoradas").then(r => r.json()).then(d => setIgnoradas(d.ignoradas || [])).catch(() => {});
  const cargar = () => { setLoading(true); fetch("/api/manager/bonos/sin-flujo").then(r => r.json()).then(setData).finally(() => setLoading(false)); cargarIgnoradas(); };
  useEffect(() => { let alive = true; fetch("/api/manager/bonos/sin-flujo").then(r => r.json()).then(d => { if (alive) setData(d); }).catch(() => {}); cargarIgnoradas(); return () => { alive = false; }; }, []);
  const ignorar = async (ticker: string | null) => {
    if (!ticker) return;
    await fetch("/api/manager/ons/ignorar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker }) }).catch(() => {});
    cargar();
  };
  const restaurar = async (ticker: string) => {
    await fetch(`/api/manager/ons/ignorar?ticker=${encodeURIComponent(ticker)}`, { method: "DELETE" }).catch(() => {});
    cargar();
  };
  const pf = data?.por_fuente;
  return (
    <div className="h-full overflow-auto p-3">
      {/* Solapas: Sin flujo (el gap) · Ignorados (en su propia vista) */}
      <div className="flex items-center gap-1 mb-2">
        <button type="button" onClick={() => setVista("gap")}
          className={"px-2 py-0.5 text-[10px] font-semibold " + (vista === "gap" ? "bg-[#094293] text-white" : "border border-[var(--t-border)] text-[var(--t-text-muted)]")}>
          Sin flujo{data ? ` (${data.total})` : ""}
        </button>
        <button type="button" onClick={() => setVista("ignorados")}
          className={"px-2 py-0.5 text-[10px] font-semibold " + (vista === "ignorados" ? "bg-[#094293] text-white" : "border border-[var(--t-border)] text-[var(--t-text-muted)]")}>
          Ignorados ({ignoradas.length})
        </button>
        <button type="button" onClick={cargar} className={_onInput + " w-auto ml-1"}>↻</button>
        {loading && <span className="text-[10px] text-[var(--t-text-muted)]">…</span>}
      </div>

      {vista === "gap" && (<>
      <div className="flex items-center gap-3 mb-2 text-[11px]">
        <span className="text-[var(--t-text-dim)]">
          {data ? <>Faltan/incompletos: <span className="text-amber-500 font-semibold">{data.total}</span> · en cartera: <span className="text-red-500 font-semibold">{data.en_cartera}</span>{pf ? <> · Renta Fija {pf.curvas} · ONs {pf.on} · nuevos {pf.ninguna}</> : null}</> : "cargando…"}
        </span>
      </div>
      <table>
        <thead><tr><th>Cart</th><th>Unidad</th><th>Ticker</th><th>Hoy</th><th>Fuente</th><th>Motivo</th><th></th></tr></thead>
        <tbody>
          {(data?.titulos || []).map((t) => (
            <tr key={t.unidad}>
              <td>{t.cartera}</td>
              <td className="text-[var(--t-accent)]">{t.unidad}</td>
              <td className="font-mono">{t.ticker ?? "—"}</td>
              <td className="text-center">{t.en_cartera ? "🔴" : "·"}</td>
              <td className="text-[10px] uppercase text-[var(--t-text-dim)]">{t.fuente}</td>
              <td className="text-[10px] text-[var(--t-text-dim)]">{t.motivo}</td>
              <td className="whitespace-nowrap">
                <button type="button" onClick={() => onDarDeAlta(t)} className="px-1.5 py-0.5 text-[10px] font-semibold bg-[#094293] text-white mr-1">{t.fuente === "ninguna" ? "dar de alta" : "editar"}</button>
                <button type="button" onClick={() => ignorar(t.ticker)} className="px-1.5 py-0.5 text-[10px] text-[var(--t-text-muted)] border border-[var(--t-border)]">ignorar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && data.ok && <p className="text-[11px] text-emerald-500 mt-2">✓ Todo lo de cartera ARS/DL/HD tiene flujo cargado.</p>}
      </>)}

      {/* Ignorados — su propia solapa. "restaurar" los vuelve a mostrar en el conciliador. */}
      {vista === "ignorados" && (
        ignoradas.length === 0 ? (
          <p className="text-[10px] text-[var(--t-text-muted)]">Ninguno ignorado. Los que saques del conciliador con “ignorar” aparecen acá para poder restaurarlos.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 content-start">
            {ignoradas.map((g) => (
              <span key={g.ticker} className="inline-flex items-center gap-1.5 border border-[var(--t-border-2)] px-2 py-0.5 text-[10px]">
                <span className="font-mono text-[var(--t-text)]">{g.ticker}</span>
                {g.at && <span className="text-[var(--t-text-muted)]">{g.at.slice(0, 10)}</span>}
                <button type="button" onClick={() => restaurar(g.ticker)} title="Volver a mostrar en el conciliador"
                  className="text-[var(--t-accent)] hover:underline">restaurar</button>
              </span>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function TabBonosAlta({ prefill, onSaved }: { prefill?: BonoPrefill | null; onSaved?: () => void }) {
  const tipoFromCurva = (c?: string) => c === "cer" ? "cer" : c === "soberanos" ? "soberano" : c === "tamar" ? "dual" : c === "dolar_linked" ? "dolar_linked" : "lecap";
  const [tipo, setTipo] = useState(prefill ? tipoFromCurva(prefill.curva) : "lecap");
  const cfg = BONO_TIPOS.find((t) => t.tipo === tipo) || BONO_TIPOS[0];
  const empty = { ticker_corto: "", tkCode: "", moneda_flujo: "ARS", fecha_emision: "", fecha_vencimiento: "", valor_nominal: "100", cer_emision: "", cupon_anual: "0", tasa_referencia: "TAMAR", flujo_vencimiento: "" };
  const [form, setForm] = useState({ ...empty, ...(prefill ? { ticker_corto: prefill.ticker_corto || "", tkCode: prefill.ticker ? unwrapTicker(prefill.ticker) : (prefill.ticker_corto || "") } : {}) });
  const [flujos, setFlujos] = useState<Record<string, string>[]>([]);
  const [existentes, setExistentes] = useState<BonoMaster[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // Subir/pegar Excel de flujos (reusa el parser de ONs; el backend devuelve la shape del tipo)
  const [flujosText, setFlujosText] = useState("");
  const [fileName, setFileName] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [parseMsg, setParseMsg] = useState<string | null>(null);
  const puedePegar = !cfg.bullet && (tipo === "soberano" || tipo === "bono");

  useEffect(() => { let alive = true; fetch("/api/manager/bonos").then(r => r.json()).then((d: { bonos: BonoMaster[] }) => { if (alive) setExistentes(d.bonos || []); }).catch(() => {}); return () => { alive = false; }; }, []);

  const cargarExistente = (tc: string) => {
    const b = existentes.find((x) => x.ticker_corto === tc);
    if (!b) { setForm({ ...empty }); setFlujos([]); return; }
    setTipo(b.tipo && BONO_TIPOS.some((x) => x.tipo === b.tipo) ? b.tipo : tipoFromCurva(b.curva));
    setForm({
      ticker_corto: b.ticker_corto, tkCode: b.ticker ? unwrapTicker(b.ticker) : b.ticker_corto,
      moneda_flujo: (b.moneda_flujo || "ARS").toUpperCase(),
      fecha_emision: (b.fecha_emision || "").slice(0, 10), fecha_vencimiento: (b.fecha_vencimiento || "").slice(0, 10),
      valor_nominal: String(b.valor_nominal ?? 100), cer_emision: b.cer_emision != null ? String(b.cer_emision) : "",
      cupon_anual: b.cupon_anual != null ? String(b.cupon_anual) : "0", tasa_referencia: b.tasa_referencia || "TAMAR",
      flujo_vencimiento: b.flujo_vencimiento != null ? String(b.flujo_vencimiento) : "",
    });
    setFlujos((b.flujos || []).map((f) => {
      const row: Record<string, string> = { fecha: String(f.fecha ?? "") };
      ["amortizacion", "interes", "valor_residual", "amortizacion_pct", "cupon_sobre_residual", "residual_previo_pct", "cupon_anual"]
        .forEach((k) => { if (f[k] != null) row[k] = String(f[k]); });
      return row;
    }));
    setMsg(null);
  };
  const setCell = (i: number, k: string, v: string) => setFlujos((fs) => fs.map((r, j) => j === i ? { ...r, [k]: v } : r));

  // Auto-carga al llegar desde el LISTADO con "editar": una vez que están los
  // existentes, cargo ese bono en el form (una sola vez, vía ref). setTimeout(0)
  // para no setear estado sincrónicamente dentro del effect.
  const editLoadedRef = useRef(false);
  useEffect(() => {
    const et = prefill?.editTicker;
    if (!et || editLoadedRef.current || !existentes.some((b) => b.ticker_corto === et)) return;
    editLoadedRef.current = true;
    const id = setTimeout(() => cargarExistente(et), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existentes, prefill]);

  const guardar = async () => {
    if (!form.ticker_corto.trim()) { setMsg({ kind: "err", text: "Falta el ticker corto" }); return; }
    setSaving(true); setMsg(null);
    const body: Record<string, unknown> = {
      ticker_corto: form.ticker_corto.trim(),
      ticker: wrapTicker(form.tkCode || form.ticker_corto),
      curva: cfg.curva, tipo,
      moneda_flujo: form.moneda_flujo || undefined,
      fecha_emision: form.fecha_emision || undefined,
      fecha_vencimiento: form.fecha_vencimiento || undefined,
      valor_nominal: form.valor_nominal ? _onNum(form.valor_nominal) : undefined,
    };
    if (cfg.cer) body.cer_emision = form.cer_emision ? _onNum(form.cer_emision) : undefined;
    if (cfg.cupon) body.cupon_anual = form.cupon_anual !== "" ? _onNum(form.cupon_anual) : undefined;
    if (cfg.tasaRef) body.tasa_referencia = form.tasa_referencia || undefined;
    if (cfg.bullet) {
      body.flujo_vencimiento = form.flujo_vencimiento ? _onNum(form.flujo_vencimiento) : undefined;
    } else {
      const rows = flujos.filter((r) => r.fecha).map((r) => {
        const o: Record<string, unknown> = { fecha: r.fecha };
        (cfg.cols || []).forEach((c) => { if (r[c.k] != null && r[c.k] !== "") o[c.k] = _onNum(r[c.k]); });
        return o;
      });
      body.flujos = rows.length ? rows : undefined;
    }
    try {
      const r = await fetch("/api/manager/bonos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const txt = await r.text(); let d: { detail?: string } = {}; try { d = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!r.ok) throw new Error(d.detail || txt.slice(0, 300) || `HTTP ${r.status}`);
      setMsg({ kind: "ok", text: "Guardado en Curvas." });
      fetch("/api/manager/bonos").then((x) => x.json()).then((d2: { bonos: BonoMaster[] }) => setExistentes(d2.bonos || [])).catch(() => {});
      onSaved?.();
    } catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) }); }
    finally { setSaving(false); }
  };

  const borrar = async () => {
    const tc = form.ticker_corto.trim();
    if (!tc) return;
    if (!window.confirm(`¿Dar de baja ${tc}? Se elimina de Curvas → deja de figurar en Renta Fija.`)) return;
    setSaving(true); setMsg(null);
    try {
      const r = await fetch(`/api/manager/bonos?ticker_corto=${encodeURIComponent(tc)}`, { method: "DELETE" });
      const txt = await r.text(); let d: { detail?: string } = {}; try { d = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!r.ok) throw new Error(d.detail || txt.slice(0, 300) || `HTTP ${r.status}`);
      setMsg({ kind: "ok", text: `${tc} dado de baja.` });
      setForm({ ...empty }); setFlujos([]);
      fetch("/api/manager/bonos").then((x) => x.json()).then((d2: { bonos: BonoMaster[] }) => setExistentes(d2.bonos || [])).catch(() => {});
      onSaved?.();
    } catch (e) { setMsg({ kind: "err", text: e instanceof Error ? e.message : String(e) }); }
    finally { setSaving(false); }
  };

  // Pega las filas del Excel → el backend las devuelve en la shape del tipo → tabla.
  const parsearFlujos = async (texto: string) => {
    if (!texto.trim()) return;
    try {
      const r = await fetch("/api/manager/bonos/parse-flujos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, tipo }),
      });
      const d: { flujos?: Record<string, unknown>[]; vencimiento?: string | null; formato?: string; error?: string } = await r.json();
      const rows = (d.flujos || []).map((f) => {
        const row: Record<string, string> = { fecha: String(f.fecha ?? "") };
        (cfg.cols || []).forEach((c) => { if (f[c.k] != null) row[c.k] = String(f[c.k]); });
        return row;
      });
      setFlujos(rows);
      if (d.vencimiento && !form.fecha_vencimiento) setForm((s) => ({ ...s, fecha_vencimiento: d.vencimiento as string }));
      setParseMsg(d.error ? `error: ${d.error}` : rows.length ? `${rows.length} flujos · ${d.formato || ""}` : "no se detectaron flujos");
    } catch (e) { setParseMsg(e instanceof Error ? e.message : "error al parsear"); }
  };

  // "Examinar archivo": lee el .xlsx/.xls/.csv REAL (SheetJS lazy) → lo pasa a
  // texto tabulado y lo manda al parser (mismo flujo que "pegar", pero desde archivo).
  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      // cellDates + dateNF ISO: evita que SheetJS formatee una fecha como US
      // (M/D/Y) — el parser lee DMY y "6/8" sería junio en vez de agosto.
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const tsv = XLSX.utils.sheet_to_csv(ws, { FS: "\t", dateNF: "yyyy-mm-dd" });
      setFlujosText(tsv);
      await parsearFlujos(tsv);
    } catch (err) { setParseMsg(err instanceof Error ? err.message : "no pude leer el archivo"); }
    e.target.value = "";  // permite volver a elegir el mismo archivo
  };

  return (
    <div className="h-full overflow-auto p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Editar existente</span>
        <select className={_onInput + " w-auto"} value={form.ticker_corto} onChange={(e) => cargarExistente(e.target.value)}>
          <option value="">— nuevo bono —</option>
          {existentes.map((b) => <option key={b.ticker_corto} value={b.ticker_corto}>{b.ticker_corto} · {b.tipo || b.curva}</option>)}
        </select>
        {form.ticker_corto.trim() && (
          <button type="button" onClick={borrar} disabled={saving} className="px-2 py-1 text-[10px] font-semibold bg-red-600 text-white disabled:opacity-50" title="Eliminar este bono de Curvas">
            DAR DE BAJA
          </button>
        )}
      </div>

      <OnField label="Tipo de bono — define los campos y la shape del flujo">
        <select className={_onInput} value={tipo} onChange={(e) => { setTipo(e.target.value); setFlujos([]); setFlujosText(""); setParseMsg(null); }}>
          {BONO_TIPOS.map((t) => <option key={t.tipo} value={t.tipo}>{t.label}</option>)}
        </select>
      </OnField>

      <div className="grid grid-cols-4 gap-2">
        <OnField label="Ticker corto"><input className={_onInput} value={form.ticker_corto} onChange={(e) => setForm({ ...form, ticker_corto: e.target.value.toUpperCase() })} placeholder="TX26" /></OnField>
        <OnField label="Ticker ROFEX (código)">
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">MERV - XMEV -</span>
            <input className={_onInput + " text-center font-semibold"} value={form.tkCode} onChange={(e) => setForm({ ...form, tkCode: e.target.value.toUpperCase() })} placeholder="TX26" />
            <span className="text-[var(--t-text-dim)] whitespace-nowrap">- 24hs</span>
          </div>
        </OnField>
        <OnField label="Moneda flujo"><select className={_onInput} value={form.moneda_flujo} onChange={(e) => setForm({ ...form, moneda_flujo: e.target.value })}><option value="ARS">ARS</option><option value="USD">USD</option></select></OnField>
        <OnField label="Valor nominal"><input className={_onInput} value={form.valor_nominal} onChange={(e) => setForm({ ...form, valor_nominal: e.target.value })} placeholder="100" /></OnField>
        <OnField label="Fecha emisión"><input type="date" className={_onInput} value={form.fecha_emision} onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })} /></OnField>
        <OnField label="Vencimiento"><input type="date" className={_onInput} value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} /></OnField>
        {cfg.cer && <OnField label="CER emisión"><input className={_onInput} value={form.cer_emision} onChange={(e) => setForm({ ...form, cer_emision: e.target.value })} placeholder="659.6789" /></OnField>}
        {cfg.cupon && <OnField label="Cupón anual"><input className={_onInput} value={form.cupon_anual} onChange={(e) => setForm({ ...form, cupon_anual: e.target.value })} placeholder="0" /></OnField>}
        {cfg.tasaRef && <OnField label="Tasa referencia"><input className={_onInput} value={form.tasa_referencia} onChange={(e) => setForm({ ...form, tasa_referencia: e.target.value })} placeholder="TAMAR" /></OnField>}
      </div>

      {cfg.bullet ? (
        <OnField label="Flujo de vencimiento (por 100 VN, pago único al vto — Lecap/Boncap)">
          <input className={_onInput} value={form.flujo_vencimiento} onChange={(e) => setForm({ ...form, flujo_vencimiento: e.target.value })} placeholder="135.278" />
        </OnField>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-dim)]">Flujos{puedePegar ? " — subí el Excel (BYMA/IAMC) o cargá a mano" : ` (carga manual, shape ${tipo})`}</span>
            <button type="button" onClick={() => setFlujos((fs) => [...fs, { fecha: "" }])} className="px-2 py-0.5 text-[10px] font-semibold bg-[#094293] text-white">+ fila</button>
            {puedePegar && (
              <label className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-[#094293] text-white cursor-pointer hover:opacity-90">
                📁 examinar archivo
                <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={handleFile} className="hidden" />
              </label>
            )}
            {puedePegar && fileName && <span className="text-[10px] text-[var(--t-text)] truncate max-w-[200px]" title={fileName}>{fileName}</span>}
            {puedePegar && (
              <button type="button" onClick={() => setShowPaste((v) => !v)} className="px-2 py-0.5 text-[10px] border border-[var(--t-border)]">
                {showPaste ? "ocultar" : "o pegar"}
              </button>
            )}
            {(flujos.length > 0 || flujosText) && (
              <button type="button" onClick={() => { setFlujos([]); setFlujosText(""); setFileName(""); setParseMsg(null); }} className="px-2 py-0.5 text-[10px] text-red-500 border border-[var(--t-border)]">limpiar</button>
            )}
          </div>
          {puedePegar && showPaste && (
            <textarea
              className={_onInput + " h-20 font-mono text-[10px] mb-1"}
              placeholder="Pegá las filas del Excel (BYMA/IAMC 'Flujo de fondos c/100 vn', o simple: fecha ⭾ amort ⭾ interés/cupón ⭾ residual)."
              value={flujosText}
              onChange={(e) => setFlujosText(e.target.value)}
              onBlur={() => parsearFlujos(flujosText)}
            />
          )}
          {puedePegar && parseMsg && <div className="text-[10px] text-[var(--t-text-muted)] mb-1">{parseMsg}</div>}
          <div className="max-h-52 overflow-auto border border-[var(--t-border)]">
            <table>
              <thead><tr><th>Fecha</th>{(cfg.cols || []).map((c) => <th key={c.k} className="text-right">{c.label}</th>)}<th></th></tr></thead>
              <tbody>
                {flujos.map((r, i) => (
                  <tr key={i}>
                    <td><input type="date" className={_onInput} value={r.fecha || ""} onChange={(e) => setCell(i, "fecha", e.target.value)} /></td>
                    {(cfg.cols || []).map((c) => <td key={c.k}><input className={_onInput + " text-right"} value={r[c.k] || ""} onChange={(e) => setCell(i, c.k, e.target.value)} placeholder="0" /></td>)}
                    <td className="text-center"><button type="button" onClick={() => setFlujos((fs) => fs.filter((_, j) => j !== i))} className="text-red-500 px-1">×</button></td>
                  </tr>
                ))}
                {flujos.length === 0 && <tr><td colSpan={(cfg.cols?.length || 0) + 2} className="text-[10px] text-[var(--t-text-dim)] p-2">Sin flujos — agregá filas con &quot;+ fila&quot;.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={guardar} disabled={saving} className="px-3 py-1 text-[11px] font-semibold bg-[#094293] text-white disabled:opacity-50">{saving ? "Guardando…" : "GUARDAR BONO"}</button>
        {msg && <span className={"text-[11px] " + (msg.kind === "ok" ? "text-emerald-500" : "text-red-500")}>{msg.text}</span>}
      </div>
      <p className="text-[10px] text-[var(--t-text-muted)]">Guarda el bono con la estructura del tipo elegido. Puede tardar unos minutos en cotizar en vivo (precio/TEA).</p>
    </div>
  );
}

interface TituloPrefill { codigo: string; ticker?: string | null; destino: "curvas" | "ons"; curva?: string; emisor?: string | null; moneda?: string; edit?: boolean }

// Editor UNIFICADO: elegís el TIPO de título (Renta Fija = soberano/CER/tasa fija · ONs).
// AMBOS viven en la MISMA base SQL `mercado.curvas` (BondsMaster fue retirado); solo
// cambian los campos del form y el endpoint. Te marca si ya está cargado. El conciliador
// entra acá directo con el tipo preseleccionado (Renta Fija si ya está como bono; ONs si
// es ON/nuevo).
function TabAltaTitulo({ prefill, onSaved }: { prefill?: TituloPrefill | null; onSaved?: () => void }) {
  const [destino, setDestino] = useState<"curvas" | "ons">(prefill?.destino ?? "curvas");
  const [bonos, setBonos] = useState<BonoMaster[]>([]);
  const [ons, setOns] = useState<ONMaster[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/manager/bonos").then((r) => r.json()).then((d: { bonos: BonoMaster[] }) => { if (alive) setBonos(d.bonos || []); }).catch(() => {});
    fetch("/api/manager/ons").then((r) => r.json()).then((d: { ons: ONMaster[] }) => { if (alive) setOns(d.ons || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const code = (prefill?.codigo || "").toUpperCase();
  const enCurvas = !!code && bonos.some((b) => (b.ticker_corto || "").toUpperCase() === code);
  const enBm = !!code && ons.some((o) => (o.asset || "").toUpperCase() === code);
  const bonoPrefill: BonoPrefill | null = prefill ? { ticker_corto: prefill.codigo, ticker: prefill.ticker ?? undefined, curva: prefill.curva || "tasa_fija", editTicker: prefill.edit ? prefill.codigo : undefined } : null;
  const onPrefill: ONPrefill | null = prefill ? { asset: prefill.codigo, emisor: prefill.emisor ?? "", moneda_flujo: prefill.moneda === "DL" ? "DL" : (prefill.moneda || "USD") } : null;
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex-wrap">
        <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Tipo de título</span>
        <Pill label="Renta Fija" active={destino === "curvas"} onClick={() => setDestino("curvas")} />
        <Pill label="ONs" active={destino === "ons"} onClick={() => setDestino("ons")} />
        {code && (
          <span className="text-[10px] ml-2 text-[var(--t-text-dim)]">
            {code}:{" "}
            {enCurvas ? <span className="text-emerald-500 font-semibold">✓ ya cargado (Renta Fija) </span> : null}
            {enBm ? <span className="text-emerald-500 font-semibold">✓ ya cargado (ON) </span> : null}
            {!enCurvas && !enBm ? <span className="text-amber-500 font-semibold">nuevo (no está cargado)</span> : null}
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {destino === "curvas"
          ? <TabBonosAlta prefill={bonoPrefill} onSaved={onSaved} />
          : <TabOnsAlta prefill={onPrefill} onSaved={onSaved} />}
      </div>
    </div>
  );
}

// LISTADO: toda la base de bonos (mercado.curvas no-ON) como grilla buscable, con
// sus flujos expandibles y detección de incompletos (sin flujo / sin vto). Es "ver
// la base de datos" desde el front: buscar, revisar qué falta, editar o dar de baja.
function bonoFlujoResumen(b: BonoMaster): { txt: string; falta: boolean } {
  if (b.flujo_vencimiento != null) return { txt: `bullet ${b.flujo_vencimiento}`, falta: false };
  const n = b.flujos?.length || 0;
  if (n > 0) return { txt: `${n} flujos`, falta: false };
  return { txt: "sin flujo", falta: true };
}

function FlujosMini({ flujos }: { flujos: Record<string, unknown>[] }) {
  const cols = Array.from(new Set(flujos.flatMap((f) => Object.keys(f)))).filter((k) => k !== "fecha");
  return (
    <table className="w-full">
      <thead><tr><th>Fecha</th>{cols.map((c) => <th key={c} className="text-right">{c}</th>)}</tr></thead>
      <tbody>
        {flujos.map((f, i) => (
          <tr key={i}>
            <td className="tabular-nums">{String(f.fecha ?? "").slice(0, 10)}</td>
            {cols.map((c) => <td key={c} className="tabular-nums text-right">{f[c] != null ? String(f[c]) : ""}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TabBonosListado({ onEditar }: { onEditar: (tc: string) => void }) {
  const [bonos, setBonos] = useState<BonoMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [curvaF, setCurvaF] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const fetchBonos = useCallback(() => {
    setLoading(true);
    fetch("/api/manager/bonos").then((r) => r.json())
      .then((d: { bonos: BonoMaster[] }) => setBonos(d.bonos || []))
      .catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    let alive = true;
    fetch("/api/manager/bonos").then((r) => r.json())
      .then((d: { bonos: BonoMaster[] }) => { if (alive) setBonos(d.bonos || []); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const borrar = async (tc: string) => {
    if (!window.confirm(`¿Dar de baja ${tc}? Se elimina de Curvas → deja de figurar en Renta Fija.`)) return;
    setBusy((b) => ({ ...b, [tc]: true }));
    try {
      const r = await fetch(`/api/manager/bonos?ticker_corto=${encodeURIComponent(tc)}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setBonos((prev) => prev.filter((x) => x.ticker_corto !== tc));
    } catch { /* noop */ } finally { setBusy((b) => ({ ...b, [tc]: false })); }
  };

  const ql = q.trim().toLowerCase();
  const filtered = bonos
    .filter((b) => (!curvaF || b.curva === curvaF)
      && (!ql || [b.ticker_corto, b.ticker, b.tipo, b.curva].some((v) => (v || "").toLowerCase().includes(ql))))
    .sort((a, b) => (a.fecha_vencimiento || "9999").localeCompare(b.fecha_vencimiento || "9999"));
  const curvasSet = Array.from(new Set(bonos.map((b) => b.curva).filter(Boolean))) as string[];
  const nFalta = filtered.filter((b) => bonoFlujoResumen(b).falta || !b.fecha_vencimiento).length;

  return (
    <div className="h-full overflow-auto p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <input className={_onInput + " w-48"} placeholder="buscar ticker / tipo…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={_onInput + " w-auto"} value={curvaF} onChange={(e) => setCurvaF(e.target.value)}>
          <option value="">todas las curvas</option>
          {curvasSet.sort().map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-[11px] text-[var(--t-text-dim)]">{filtered.length} bonos · {nFalta} incompletos</span>
        <button type="button" onClick={fetchBonos} className={_onInput + " w-auto"}>↻</button>
      </div>
      <table>
        <thead><tr><th>Ticker</th><th>ROFEX</th><th>Curva</th><th>Tipo</th><th>Vto</th><th>Mon</th><th className="text-right">VN</th><th className="text-right">Cupón</th><th>Flujo</th><th></th></tr></thead>
        <tbody>
          {filtered.map((b) => {
            const fl = bonoFlujoResumen(b);
            const sinVto = !b.fecha_vencimiento;
            const open = expanded === b.ticker_corto;
            return (
              <Fragment key={b.ticker_corto}>
                <tr className={fl.falta || sinVto ? "bg-red-500/10" : ""}>
                  <td className="font-semibold">{b.ticker_corto}</td>
                  <td className="text-[10px] text-[var(--t-text-dim)]">{b.ticker ? unwrapTicker(b.ticker) : "--"}</td>
                  <td>{b.curva || "--"}</td>
                  <td>{b.tipo || "--"}</td>
                  <td className={"tabular-nums " + (sinVto ? "text-red-500 font-semibold" : "")}>{sinVto ? "⚠️ sin vto" : (b.fecha_vencimiento || "").slice(0, 10)}</td>
                  <td>{b.moneda_flujo || "--"}</td>
                  <td className="tabular-nums text-right">{b.valor_nominal ?? "--"}</td>
                  <td className="tabular-nums text-right">{b.cupon_anual ?? "--"}</td>
                  <td>
                    <button type="button" onClick={() => setExpanded(open ? null : b.ticker_corto)} className={fl.falta ? "text-red-500 font-semibold" : "text-[var(--t-accent)]"} title="Ver flujos">
                      {fl.falta ? "⚠️ sin flujo" : `${fl.txt} ${open ? "▴" : "▾"}`}
                    </button>
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" onClick={() => onEditar(b.ticker_corto)} className={_onInput + " w-auto text-[10px] mr-1"}>editar</button>
                    <button type="button" disabled={busy[b.ticker_corto]} onClick={() => borrar(b.ticker_corto)} className="px-1.5 py-0.5 text-[10px] font-semibold bg-red-600 text-white disabled:opacity-50">baja</button>
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={10} className="bg-[var(--t-panel)] p-2">
                      {b.flujos?.length
                        ? <FlujosMini flujos={b.flujos} />
                        : <span className="text-[10px] text-[var(--t-text-dim)]">{b.flujo_vencimiento != null ? `Bullet: paga ${b.flujo_vencimiento} por 100 VN al vencimiento.` : "Sin flujos cargados."}</span>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {loading && <p className="text-[11px] text-[var(--t-text-muted)] mt-2">cargando…</p>}
      {!loading && filtered.length === 0 && <p className="text-[11px] text-[var(--t-text-muted)] mt-2">Sin bonos para ese filtro.</p>}
    </div>
  );
}

// Un cuadrante del panel unificado de bonos: header + cuerpo con scroll propio.
function QuadPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
      <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] text-[10px] font-semibold tracking-widest text-[var(--t-text-muted)] uppercase bg-[var(--t-surface)]">
        {title}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

// Cuadrante "errores de tasa": bonos con precio pero sin TEA (los "--"). Lista +
// botón para recalcular (job backfill_tasas) y refrescar. El "por qué" de cada uno
// se ve en VALIDACIONES → DEBUG TEA.
function BonosErroresPanel({ reloadKey }: { reloadKey: number }) {
  interface Fila { ticker_corto: string; ticker: string; curva: string; fecha_vencimiento: string; last_price: number }
  const [data, setData] = useState<{ total: number; ok: boolean; bonos: Fila[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [recalc, setRecalc] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/manager/bonos/sin-tasa", { cache: "no-store" })
      .then(r => r.json()).then(setData).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load, reloadKey]);

  const recalcular = async () => {
    setRecalc("Recalculando…");
    try {
      const start = await fetch("/api/manager/jobs/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "backfill_tasas" }),
      }).then(r => r.json());
      const jobId = start?.job_id;
      if (!jobId) { setRecalc("No se pudo lanzar (¿sin permiso?)."); return; }
      for (let i = 0; i < 60; i++) {
        await new Promise(res => setTimeout(res, 2000));
        const job = await fetch(`/api/manager/jobs/${jobId}`, { cache: "no-store" }).then(r => r.json());
        if (job?.status && job.status !== "running") {
          setRecalc(job.result || `status=${job.status}`); load(); return;
        }
      }
      setRecalc("Timeout (ver JOBS).");
    } catch (e) { setRecalc(`Error: ${String(e)}`); }
  };

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={load} disabled={loading}
          className="px-2 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {loading ? "…" : "↻ Refrescar"}
        </button>
        <button onClick={recalcular}
          className="px-2 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors">
          ▶ Recalcular tasas
        </button>
        {data && <StatusBadge ok={data.ok} label={data.ok ? "Todos con tasa" : `${data.total} sin TEA`} />}
      </div>
      {data && data.bonos.length > 0 && (
        <table className="w-full text-[10px]">
          <thead><tr className="text-[var(--t-text-muted)] text-left">
            <th className="py-0.5">TICKER</th><th>CURVA</th><th>VTO</th><th className="text-right">PRECIO</th>
          </tr></thead>
          <tbody>
            {data.bonos.map(b => (
              <tr key={b.ticker_corto} className="border-t border-[var(--t-border)]">
                <td className="py-0.5 text-[var(--t-text)] font-semibold">{b.ticker_corto}</td>
                <td className="text-[var(--t-text-muted)]">{b.curva}</td>
                <td className="text-[var(--t-text-muted)]">{d10(b.fecha_vencimiento)}</td>
                <td className="text-right text-[var(--t-text)]">{b.last_price?.toLocaleString("es-AR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {recalc && (
        <pre className="text-[9px] text-[var(--t-text-muted)] whitespace-pre-wrap bg-[var(--t-surface)] border border-[var(--t-border)] p-2 mt-2 max-h-32 overflow-y-auto">{recalc}</pre>
      )}
      <div className="text-[9px] text-[var(--t-text-muted)] mt-2 leading-relaxed">
        El detalle del porqué de cada &quot;--&quot; está en VALIDACIONES → DEBUG TEA (por ticker).
      </div>
    </div>
  );
}

// Vista unificada de bonos: 4 cuadrantes (ver/editar · agregar · conciliar · errores).
function TabBonos() {
  const [prefill, setPrefill] = useState<TituloPrefill | null>(null);
  const [prefillKey, setPrefillKey] = useState(0);
  const [dataKey, setDataKey] = useState(0);   // remonta listado/conciliador/errores tras guardar

  const darDeAlta = (b: BonoSinFlujo) => {
    const destino = b.accion === "editar_on" ? "ons" : "curvas";
    setPrefill({
      codigo: b.ticker || b.unidad, ticker: b.ticker, destino,
      curva: b.cartera === "ARS" ? "tasa_fija" : "soberanos",
      emisor: b.emisor, moneda: b.cartera,
    });
    setPrefillKey((k) => k + 1);
  };
  const editarBono = (tc: string) => {
    setPrefill({ codigo: tc, destino: "curvas", edit: true });
    setPrefillKey((k) => k + 1);
  };
  const onSaved = () => { setDataKey((k) => k + 1); };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 gap-2 p-2 min-h-0">
      <QuadPanel title="Ver / editar bonos">
        <TabBonosListado key={`list-${dataKey}`} onEditar={editarBono} />
      </QuadPanel>
      <QuadPanel title="Agregar / editar">
        <TabAltaTitulo key={`alta-${prefillKey}`} prefill={prefill} onSaved={onSaved} />
      </QuadPanel>
      <QuadPanel title="Conciliar — títulos sin flujo">
        <TabBonosControl key={`conc-${dataKey}`} onDarDeAlta={darDeAlta} />
      </QuadPanel>
      <QuadPanel title="Errores de tasa — bonos sin TEA">
        <BonosErroresPanel reloadKey={dataKey} />
      </QuadPanel>
    </div>
  );
}

// ── Sub-tab: Renta Variable (CEDEARs — rubro + es_ia) ─────────────────────────
// Editor en grilla del catálogo de clasificación de CEDEARs. Espejo de la
// segmentación de clientes: el `rubro` NO se escribe libre — se elige del
// catálogo (/rubros) o se crea con POST /rubro. PATCH inmediato por fila.
// Endpoints (SQL-native, gate manager_titulos):
//   GET   /api/manager/renta-variable          → grid de CEDEARs
//   GET   /api/manager/renta-variable/rubros    → catálogo de rubros (dropdown)
//   POST  /api/manager/renta-variable/rubro     → crear rubro
//   PATCH /api/manager/renta-variable           → setear rubro/es_ia de un CEDEAR
interface CedearRow {
  ticker: string;            // ticker BYMA completo (PK)
  ticker_corto: string;
  underlying: string | null;
  activo: boolean | null;
  rubro: string | null;
  es_ia: boolean | null;
  ric: string | null;        // identidad Refinitiv del subyacente (ej. AAPL.O)
  ratio: number | null;      // CEDEARs por acción (ej. AAPL 10:1 → 10), para el CCL implícito
  nombre: string | null;
}
interface RubroRow { rubro: string; es_ia_def: boolean }

function TabRentaVariable() {
  const [rows, setRows] = useState<CedearRow[]>([]);
  const [rubros, setRubros] = useState<RubroRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [q, setQ] = useState("");
  // Alta de rubro nuevo (input inline → POST /rubro)
  const [nuevoRubro, setNuevoRubro] = useState("");
  const [nuevoRubroIa, setNuevoRubroIa] = useState(false);
  const [creandoRubro, setCreandoRubro] = useState(false);
  const [rubroMsg, setRubroMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Borradores de los inputs RIC/RATIO por fila (se guardan al salir del campo / Enter).
  const [ricDrafts, setRicDrafts] = useState<Record<string, string>>({});
  const [ratioDrafts, setRatioDrafts] = useState<Record<string, string>>({});

  const fetchCedears = () => {
    setLoading(true);
    setError(null);
    fetch("/api/manager/renta-variable", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status} — ${txt.slice(0, 200) || r.statusText}`);
        }
        return r.json();
      })
      .then((d: CedearRow[]) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  };

  const fetchRubros = () => {
    fetch("/api/manager/renta-variable/rubros", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: RubroRow[]) => setRubros(Array.isArray(d) ? d : []))
      .catch(() => { /* silencioso */ });
  };

  useEffect(() => { fetchCedears(); fetchRubros(); }, []);

  // Filtro en cliente por ticker / nombre / rubro (lista de ~70-160 filas).
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((c) =>
      (c.ticker_corto ?? "").toLowerCase().includes(t) ||
      (c.nombre ?? "").toLowerCase().includes(t) ||
      (c.underlying ?? "").toLowerCase().includes(t) ||
      (c.rubro ?? "").toLowerCase().includes(t));
  }, [rows, q]);

  // PATCH inmediato (optimista) de un campo de la fila.
  const patchRow = async (c: CedearRow, patch: { rubro?: string | null; es_ia?: boolean; ric?: string | null; ratio?: number | null }) => {
    setRowState((s) => ({ ...s, [c.ticker]: { kind: "saving" } }));
    // Optimista: aplicar local antes de la respuesta.
    setRows((prev) => prev.map((x) => (x.ticker === c.ticker ? { ...x, ...patch } : x)));
    try {
      const r = await fetch("/api/manager/renta-variable", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: c.ticker, ...patch }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* texto plano */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      setRowState((s) => ({ ...s, [c.ticker]: { kind: "saved" } }));
      setTimeout(() => setRowState((s) => ({ ...s, [c.ticker]: { kind: "idle" } })), 1500);
    } catch (e) {
      // Revertir el optimismo recargando del backend (estado real).
      fetchCedears();
      setRowState((s) => ({ ...s, [c.ticker]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  // Borrar un CEDEAR del universo (deja de suscribirse). DELETE master Mongo + SQL.
  const borrarCedear = async (c: CedearRow) => {
    if (!window.confirm(
      `¿Sacar ${c.ticker_corto} del universo de Renta Variable?\n\n` +
      `Deja de suscribirse en el motor y se borra del master. ` +
      `Reversible solo volviéndolo a dar de alta.`)) return;
    setRowState((s) => ({ ...s, [c.ticker]: { kind: "saving" } }));
    try {
      const r = await fetch(`/api/manager/renta-variable?ticker=${encodeURIComponent(c.ticker)}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      setRows((prev) => prev.filter((x) => x.ticker !== c.ticker));
    } catch (e) {
      setRowState((s) => ({ ...s, [c.ticker]: { kind: "error", msg: e instanceof Error ? e.message : String(e) } }));
    }
  };

  const crearRubro = async () => {
    const rub = nuevoRubro.trim();
    if (!rub) return;
    setCreandoRubro(true);
    setRubroMsg(null);
    try {
      const r = await fetch("/api/manager/renta-variable/rubro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubro: rub, es_ia_def: nuevoRubroIa }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => "");
        let detail = txt;
        try { const j = JSON.parse(txt); if (j && typeof j.detail === "string") detail = j.detail; } catch { /* */ }
        throw new Error(`HTTP ${r.status} · ${detail.slice(0, 200) || r.statusText}`);
      }
      setNuevoRubro("");
      setNuevoRubroIa(false);
      setRubroMsg({ ok: true, text: `Rubro "${rub}" creado.` });
      fetchRubros();
    } catch (e) {
      setRubroMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreandoRubro(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">RENTA VARIABLE</span>
        <span className="text-[10px] text-[var(--t-text-muted)]">{filtered.length} de {rows.length} CEDEARs</span>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="buscar ticker, nombre o rubro…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[210px]"
        />

        {/* Alta de rubro nuevo (igual que la segmentación: catálogo controlado). */}
        <span className="text-[9px] tracking-widest text-[var(--t-text-muted)] ml-2">+ CREAR RUBRO</span>
        <input
          value={nuevoRubro}
          onChange={(e) => setNuevoRubro(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") crearRubro(); }}
          placeholder="nombre del rubro…"
          className="bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[150px]"
        />
        <label className="flex items-center gap-1 text-[10px] text-[var(--t-text-muted)] cursor-pointer" title="Default es_ia del rubro nuevo">
          <input type="checkbox" checked={nuevoRubroIa} onChange={(e) => setNuevoRubroIa(e.target.checked)} />
          IA
        </label>
        <button onClick={crearRubro} disabled={creandoRubro || !nuevoRubro.trim()}
          className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {creandoRubro ? "Creando…" : "+ Crear"}
        </button>

        <button onClick={fetchCedears} disabled={loading}
          className="ml-auto px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {loading ? "Cargando…" : "↻ Recargar"}
        </button>
      </div>

      {rubroMsg && (
        <div className={`px-3 py-1.5 text-[10px] border-b border-[var(--t-border)] shrink-0 ${rubroMsg.ok ? "bg-[var(--t-tint-green)] text-green-400" : "bg-[var(--t-tint-red)] text-red-400"}`}>
          {rubroMsg.text}
          <button onClick={() => setRubroMsg(null)} className="ml-2 text-[var(--t-text-dim)] hover:text-white">✕</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {error && <div className="p-3 text-[11px] text-red-400">Error: {error}</div>}
        {!error && loading && rows.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Cargando…</div>}
        {!error && !loading && filtered.length === 0 && <div className="p-3 text-[11px] text-[var(--t-text-muted)]">Sin resultados.</div>}
        {filtered.length > 0 && (
          <table className="text-[11px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-surface)] border-b border-[var(--t-border)]">
              <tr className="text-left text-[var(--t-text-dim)] tracking-widest text-[9px]">
                <th className="px-3 py-2">TICKER</th>
                <th className="px-2 py-2">NOMBRE</th>
                <th className="px-2 py-2">UNDERLYING</th>
                <th className="px-2 py-2">RUBRO</th>
                <th className="px-2 py-2 text-center">ES IA</th>
                <th className="px-2 py-2" title="Identidad Refinitiv del subyacente (ej. AAPL.O) — la usan Research y el feed de precios en vivo">RIC</th>
                <th className="px-2 py-2" title="Ratio de conversión: cuántos CEDEARs equivalen a 1 acción (ej. 10). Insumo del CCL implícito.">RATIO</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const state: RowState = rowState[c.ticker] || { kind: "idle" };
                return (
                  <tr key={c.ticker} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)]">
                    <td className="px-3 py-1.5 text-[var(--t-accent)] whitespace-nowrap">{c.ticker_corto}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text)] whitespace-nowrap max-w-[240px] truncate" title={c.nombre ?? ""}>{c.nombre ?? "—"}</td>
                    <td className="px-2 py-1.5 text-[var(--t-text-dim)] whitespace-nowrap">{c.underlying ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <select
                        value={c.rubro ?? ""}
                        onChange={(e) => patchRow(c, { rubro: e.target.value || null })}
                        title={c.rubro ?? "sin rubro"}
                        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none min-w-[150px]"
                      >
                        <option value="">— sin rubro —</option>
                        {/* Si la fila tiene un rubro que ya no está en el catálogo, igual lo mostramos. */}
                        {c.rubro && !rubros.some((r) => r.rubro === c.rubro) && (
                          <option value={c.rubro}>{c.rubro}</option>
                        )}
                        {rubros.map((r) => (
                          <option key={r.rubro} value={r.rubro}>{r.rubro}{r.es_ia_def ? " (IA)" : ""}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => patchRow(c, { es_ia: !c.es_ia })}
                        className={`px-2 py-0.5 text-[10px] font-semibold border transition-colors ${
                          c.es_ia
                            ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                            : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)]"
                        }`}
                      >
                        {c.es_ia ? "SÍ" : "NO"}
                      </button>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={ricDrafts[c.ticker] ?? c.ric ?? ""}
                        onChange={(e) => setRicDrafts((d) => ({ ...d, [c.ticker]: e.target.value }))}
                        onBlur={() => {
                          const draft = ricDrafts[c.ticker];
                          if (draft === undefined) return;
                          setRicDrafts((d) => { const rest = { ...d }; delete rest[c.ticker]; return rest; });
                          const val = draft.trim() || null;
                          if (val !== (c.ric ?? null)) patchRow(c, { ric: val });
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        placeholder="AAPL.O"
                        spellCheck={false}
                        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none w-[90px]"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={ratioDrafts[c.ticker] ?? (c.ratio === null ? "" : String(c.ratio))}
                        onChange={(e) => setRatioDrafts((d) => ({ ...d, [c.ticker]: e.target.value }))}
                        onBlur={() => {
                          const draft = ratioDrafts[c.ticker];
                          if (draft === undefined) return;
                          setRatioDrafts((d) => { const rest = { ...d }; delete rest[c.ticker]; return rest; });
                          const txt = draft.trim().replace(",", ".");
                          const val = txt === "" ? null : Number(txt);
                          if (val !== null && (!isFinite(val) || val <= 0)) {
                            setRowState((s) => ({ ...s, [c.ticker]: { kind: "error", msg: "ratio inválido (número > 0)" } }));
                            return;
                          }
                          if (val !== (c.ratio ?? null)) patchRow(c, { ratio: val });
                        }}
                        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                        placeholder="10"
                        inputMode="decimal"
                        spellCheck={false}
                        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] text-right focus:border-[var(--t-accent)] focus:outline-none w-[60px]"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-[10px] whitespace-nowrap">
                      {state.kind === "saving" && <span className="text-[var(--t-accent)]">Guardando…</span>}
                      {state.kind === "saved" && <span className="text-green-400">✓ guardado</span>}
                      {state.kind === "error" && <span className="text-red-400 cursor-help" title={state.msg}>✗ {state.msg.length > 40 ? state.msg.slice(0, 40) + "…" : state.msg}</span>}
                      <button
                        onClick={() => borrarCedear(c)}
                        title="Sacar del universo (deja de suscribirse)"
                        className="ml-2 px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-red-400 hover:text-red-400 transition-colors"
                      >
                        🗑
                      </button>
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

// TÍTULOS: Instrumentos (solo lectura) + Assets + ONs + Bonos + Renta Variable
// (edición maestro). Gate fino: INSTRUMENTOS → manager_instrumentos;
// ASSETS/ONs/BONOS/RENTA VARIABLE → manager_titulos.
// Así asistente_comercial (manager_instrumentos) ve solo Instrumentos.
// BREAKEVENS: curaduría de pares Lecap↔CER. El motor los empareja solo (vto más
// cercano) y a veces se equivoca (par con BE absurdo). Acá se EXCLUYE el par malo
// → desaparece de la vista de Renta Fija al instante (el reader lo filtra; el motor
// no se toca). Reincluir lo vuelve a mostrar.
interface BePar {
  lecap: string;
  cer: string;
  mes_inflacion?: string;
  dias?: number;
  breakeven_mensual?: number;
  excluido: boolean;
}

function fmtBe(n: number | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "--";
  return `${(n * 100).toFixed(2)}%`;
}

function TabBreakevens() {
  const [pares, setPares] = useState<BePar[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [nExcl, setNExcl] = useState(0);

  const fetchPares = useCallback(() => {
    setLoading(true);
    fetch("/api/manager/breakevens/pares")
      .then((r) => r.json())
      .then((d: { pares?: BePar[]; n_excluidos?: number }) => {
        setPares(d.pares || []);
        setNExcl(d.n_excluidos || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  // Carga al montar — fetch inline (setState solo en .then) para no disparar
  // setState sincrónico dentro del effect.
  useEffect(() => {
    let alive = true;
    fetch("/api/manager/breakevens/pares")
      .then((r) => r.json())
      .then((d: { pares?: BePar[]; n_excluidos?: number }) => {
        if (!alive) return;
        setPares(d.pares || []);
        setNExcl(d.n_excluidos || 0);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const toggle = async (p: BePar) => {
    const key = `${p.lecap}|${p.cer}`;
    setBusy((b) => ({ ...b, [key]: true }));
    // Optimista: reflejo el cambio antes de la respuesta.
    setPares((prev) => prev.map((x) => (x.lecap === p.lecap && x.cer === p.cer ? { ...x, excluido: !x.excluido } : x)));
    try {
      const r = await fetch("/api/manager/breakevens/exclusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lecap: p.lecap, cer: p.cer, excluir: !p.excluido }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setNExcl((n) => (p.excluido ? Math.max(0, n - 1) : n + 1));
    } catch {
      // revierto si falló
      setPares((prev) => prev.map((x) => (x.lecap === p.lecap && x.cer === p.cer ? { ...x, excluido: p.excluido } : x)));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  return (
    <div className="h-full overflow-auto p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-[var(--t-text-dim)]">
          {pares.length} pares que arma el motor · {nExcl} excluidos · excluir un par lo oculta de Renta Fija al instante
        </span>
        <button type="button" onClick={fetchPares} className={_onInput + " w-auto"}>↻</button>
      </div>
      <table>
        <thead>
          <tr><th>Lecap/Boncap</th><th>CER</th><th>IPC mes</th><th>Días</th><th>BE mensual</th><th></th></tr>
        </thead>
        <tbody>
          {pares.map((p) => {
            const key = `${p.lecap}|${p.cer}`;
            const beRoto = p.breakeven_mensual !== undefined && (p.breakeven_mensual < 0 || p.breakeven_mensual > 0.15);
            return (
              <tr key={key} className={p.excluido ? "opacity-40" : ""}>
                <td className="font-semibold">{p.lecap}</td>
                <td>{p.cer}</td>
                <td className="tabular-nums">{p.mes_inflacion || "--"}</td>
                <td className="tabular-nums text-right">{p.dias ?? "--"}</td>
                <td className={"tabular-nums text-right " + (beRoto ? "text-red-500 font-semibold" : "")}>
                  {fmtBe(p.breakeven_mensual)}
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    disabled={busy[key]}
                    onClick={() => toggle(p)}
                    className={_onInput + " w-auto text-[10px]"}
                    title={p.excluido ? "Volver a mostrar este par" : "Ocultar este par de Renta Fija"}
                  >
                    {busy[key] ? "…" : p.excluido ? "incluir" : "excluir"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {loading && <p className="text-[11px] text-[var(--t-text-muted)] mt-2">cargando…</p>}
      {!loading && pares.length === 0 && (
        <p className="text-[11px] text-[var(--t-text-muted)] mt-2">
          Sin pares — ¿el motor de breakevens está corriendo?
        </p>
      )}
    </div>
  );
}

function TitulosGroup({ modules }: { modules?: string[] | null }) {
  // "ons" se eliminó como sub-tab (2026-07-09): alta/edición + sector de ONs
  // viven en BONOS (editor unificado TabAltaTitulo). El persisted state viejo
  // con "ons" cae al default vía subVisible.
  const [sub, setSub] = usePersistedState<"instrumentos" | "assets" | "bonos" | "breakevens" | "renta_variable">("manager.titulos.sub", "instrumentos");
  const has = (m: string) => modules == null || modules.includes(m);
  const canInstr = has("manager") || has("manager_instrumentos");
  const canMaestro = has("manager") || has("manager_titulos");
  const subVisible = (sub === "instrumentos" && canInstr) || ((sub === "assets" || sub === "bonos" || sub === "breakevens" || sub === "renta_variable") && canMaestro);
  const eff = subVisible ? sub : (canInstr ? "instrumentos" : "assets");
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>TÍTULOS</span>
        {canInstr && <Pill label="INSTRUMENTOS" active={eff === "instrumentos"} onClick={() => setSub("instrumentos")} />}
        {canMaestro && <Pill label="ASSETS" active={eff === "assets"} onClick={() => setSub("assets")} />}
        {canMaestro && <Pill label="BONOS" active={eff === "bonos"} onClick={() => setSub("bonos")} />}
        {canMaestro && <Pill label="BREAKEVENS" active={eff === "breakevens"} onClick={() => setSub("breakevens")} />}
        {canMaestro && <Pill label="RENTA VARIABLE" active={eff === "renta_variable"} onClick={() => setSub("renta_variable")} />}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {eff === "instrumentos"   && canInstr && <div className="h-full overflow-y-auto p-3"><TabInstrumentos /></div>}
        {eff === "assets"         && canMaestro && <TabAssets />}
        {eff === "bonos"          && canMaestro && <TabBonos />}
        {eff === "breakevens"     && canMaestro && <TabBreakevens />}
        {eff === "renta_variable" && canMaestro && <TabRentaVariable />}
      </div>
    </div>
  );
}

// USUARIOS: Usuarios + Roles y Permisos + Grupos.
function UsuariosGroup() {
  const [sub, setSub] = usePersistedState<"usuarios" | "roles" | "grupos">("manager.usuarios.sub", "usuarios");
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

function AunesaGroup({ modules }: { modules?: string[] | null }) {
  const has = (m: string) => modules == null || modules.includes(m);
  // `manager` (admin) ve todas las sub-vistas; `manager_aunesa` (asistente_comercial) SOLO Importar.
  const full = has("manager");
  const [sub, setSub] = usePersistedState<"flujo" | "aum" | "posicion" | "boletos" | "importar">("manager.aunesa.sub", "flujo");
  const subEff = full ? sub : "importar";
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mr-2">AUNESA</span>
        {full && <Pill label="FLUJO" active={subEff === "flujo"} onClick={() => setSub("flujo")} />}
        {full && <Pill label="AUM" active={subEff === "aum"} onClick={() => setSub("aum")} />}
        {full && <Pill label="POSICIÓN" active={subEff === "posicion"} onClick={() => setSub("posicion")} />}
        {full && <Pill label="BOLETOS" active={subEff === "boletos"} onClick={() => setSub("boletos")} />}
        <Pill label="IMPORTAR AUM" active={subEff === "importar"} onClick={() => setSub("importar")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {full && subEff === "flujo"    && <AunesaExplorarPanel />}
        {full && subEff === "aum"      && <AunesaAumPanel />}
        {full && subEff === "posicion" && <AunesaPosicionPanel />}
        {full && subEff === "boletos"  && <AunesaBoletosPanel />}
        {subEff === "importar" && <ImportTenenciaPanel />}
      </div>
    </div>
  );
}

// OPERACIONES: backfill de CashFlow.Operaciones por CSV (fuente de verdad de
// operaciones desde la API informes). Parsea el CSV en el cliente y lo sube en
// lotes a /api/manager/operaciones/backfill (upsert por boleto, índice único).
type OpsStats = { n: number; n_cuentas: number; min_concertacion: string | null; max_concertacion: string | null };

const OPS_BATCH = 2000;

function OpsStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">{label}</div>
      <div className="text-[13px] text-[var(--t-text)]">{value}</div>
    </div>
  );
}

function OperacionesBackfillPanel() {
  const [stats, setStats] = useState<OpsStats | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ recibidas: number; upsertadas: number; modificadas: number; sin_boleto: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadStats = useCallback(() => {
    fetch("/api/manager/operaciones/stats").then((r) => r.json()).then(setStats).catch(() => {});
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  const onFile = async (file: File) => {
    setMsg(null); setResult(null); setRows([]); setHeaders([]); setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      // CSV: decodificar como UTF-8 explícito (si no, los acentos llegan rotos:
      // "Concertación" → "ConcertaciÃ³n" y el mapeo de columnas falla). XLSX
      // se lee binario.
      const isCsv = /\.csv$/i.test(file.name);
      const wb = isCsv
        ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string" })
        : XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
      if (!json.length) { setMsg({ ok: false, text: "El archivo está vacío." }); return; }
      setRows(json);
      setHeaders(Object.keys(json[0]).filter((h) => h.trim() !== ""));
    } catch (e) {
      setMsg({ ok: false, text: `No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const subir = async () => {
    if (busy || !rows.length) return;
    setBusy(true); setMsg(null); setResult(null);

    // Dedup por boleto en TODO el archivo (última fila gana). Así ningún boleto
    // aparece en dos lotes → se pueden mandar EN PARALELO sin chocar contra el
    // índice único (y de paso achica el total).
    const normH = (h: string) =>
      h.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const bHeader = headers.find((h) => normH(h) === "boleto");
    let unique: Record<string, unknown>[] = rows;
    if (bHeader) {
      const map = new Map<string, Record<string, unknown>>();
      for (const r of rows) {
        const b = String(r[bHeader] ?? "").trim();
        if (b) map.set(b, r);
      }
      unique = [...map.values()];
    }

    const batches: Record<string, unknown>[][] = [];
    for (let i = 0; i < unique.length; i += OPS_BATCH) batches.push(unique.slice(i, i + OPS_BATCH));
    const total = batches.length;
    const acc = { recibidas: 0, upsertadas: 0, modificadas: 0, sin_boleto: 0 };
    let done = 0;

    const send = async (batch: Record<string, unknown>[], crear: boolean) => {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch("/api/manager/operaciones/backfill", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rows: batch, crear_indice: crear }),
          });
          if (!res.ok) {
            let detail = `HTTP ${res.status}`;
            try { const j = await res.json(); if (j?.detail) detail = String(j.detail); } catch { /* */ }
            throw new Error(detail);
          }
          const j = await res.json();
          acc.recibidas += j.recibidas ?? 0;
          acc.upsertadas += j.upsertadas ?? 0;
          acc.modificadas += j.modificadas ?? 0;
          acc.sin_boleto += j.sin_boleto ?? 0;
          done++;
          setProgress({ done, total });
          return;
        } catch (e) {
          lastErr = e;
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));  // backoff y reintenta
        }
      }
      throw lastErr;  // falló las 3 veces
    };

    try {
      if (!total) { setMsg({ ok: false, text: "Nada para subir." }); return; }
      // Primer lote solo (crea el índice) y después el resto en paralelo (pool de 6).
      await send(batches[0], true);
      let next = 1;
      const worker = async () => {
        for (let i = next++; i < total; i = next++) await send(batches[i], false);
      };
      await Promise.all(Array.from({ length: Math.min(4, Math.max(total - 1, 1)) }, worker));
      setResult(acc);
      setMsg({ ok: true, text: `Listo: ${acc.upsertadas} nuevas, ${acc.modificadas} actualizadas, ${acc.sin_boleto} sin boleto.` });
      loadStats();
    } catch (e) {
      setMsg({ ok: false, text: `Error al subir: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 text-[12px] text-[var(--t-text)]">
      <div className="max-w-[780px] space-y-4">
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--t-accent)] tracking-wide">BACKFILL OPERACIONES</h2>
          <p className="text-[var(--t-text-muted)] mt-1 leading-relaxed">
            Subí un CSV con operaciones (fuente: informe de operaciones). Se carga con
            índice único por boleto — un boleto, un registro; re-subir el mismo archivo actualiza, no duplica.
            Columnas reconocidas: boleto, cuenta, concertación, denominación, tipo de operación,
            instrumento, condiciones, cantidad, bruto, aranceles.
          </p>
        </div>

        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3">
          <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest mb-2">ESTADO ACTUAL</div>
          {stats ? (
            <div className="flex gap-8">
              <OpsStat label="BOLETOS" value={stats.n.toLocaleString("es-AR")} />
              <OpsStat label="CUENTAS" value={String(stats.n_cuentas)} />
              <OpsStat label="DESDE" value={stats.min_concertacion ?? "—"} />
              <OpsStat label="HASTA" value={stats.max_concertacion ?? "—"} />
            </div>
          ) : <span className="text-[var(--t-text-muted)]">cargando…</span>}
        </div>

        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-3">
          <label className="inline-block px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] cursor-pointer hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]">
            ELEGIR ARCHIVO (.csv / .xlsx)
            <input
              type="file" accept=".csv,.xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
              className="hidden"
            />
          </label>
          {fileName && rows.length > 0 && (
            <div className="text-[var(--t-text-muted)]">
              <span className="text-[var(--t-text)]">{fileName}</span> · {rows.length.toLocaleString("es-AR")} filas · columnas: {headers.join(", ")}
            </div>
          )}
          {rows.length > 0 ? (
            <div>
              <button
                onClick={subir}
                className="px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] cursor-pointer hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]"
              >
                {busy ? "Subiendo…" : "SUBIR OPERACIONES"}
              </button>
            </div>
          ) : (
            <div className="text-[var(--t-text-muted)]">Elegí un archivo para habilitar la subida.</div>
          )}
          {progress && <div className="text-[var(--t-text-muted)]">lote {progress.done}/{progress.total}…</div>}
          {result && (
            <div className="text-[var(--t-text)]">
              ✓ {result.upsertadas.toLocaleString("es-AR")} nuevas · {result.modificadas.toLocaleString("es-AR")} actualizadas · {result.sin_boleto} sin boleto · {result.recibidas.toLocaleString("es-AR")} procesadas
            </div>
          )}
          {msg && <div className={msg.ok ? "text-green-400" : "text-red-400"}>{msg.text}</div>}
        </div>
      </div>
    </div>
  );
}

// ── IMPORTAR TENENCIA: pisa Valuaciones.AuM con el Excel del contable ─────────
// Parsea el Excel en el cliente, PREVISUALIZA contra el backend (commit=false) y
// recién con confirmación explícita APLICA (commit=true). Pisa por (fecha,cuenta),
// idempotente. Pensado para corregir los fines de mes que el job dejó mal.
type ImportResp = {
  ok: boolean; error?: string; modo?: string;
  n_filas?: number; n_validas?: number; n_errores?: number;
  errores?: { fila: number; detalle: string }[];
  fechas?: string[]; cuentas?: string[]; n_cuentas?: number;
  total_valuacion?: number;
  columnas_detectadas?: string[];                    // headers que leyó del Excel
  matchean?: number; sin_match?: number;             // modo precios (preview)
  aplicado?: boolean; filas_actualizadas?: number;   // modo precios (commit)
  borrados?: number; insertados?: number;            // modo aum (commit)
};

// Paso 2: recalcular valuación (precio×cantidad, /100 renta fija). Divisor por CARTERA.
type RecalcResp = {
  ok: boolean; error?: string; aplicado?: boolean; filas_actualizadas?: number;
  n_recalculadas?: number; total_antes?: number; total_despues?: number;
  carteras?: { cartera: string; divisor: number; n: number;
               total_antes: number; total_despues: number; delta: number }[];
  sin_clasificar?: { cartera: string; n: number; total_antes: number }[];
};

function ImportTenenciaPanel() {
  const [modo, setModo] = useState<"precios" | "aum">("precios");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState("");
  const [prev, setPrev] = useState<ImportResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [recalc, setRecalc] = useState<RecalcResp | null>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);

  const cambiarModo = (m: "precios" | "aum") => {
    setModo(m); setRows([]); setFileName(""); setPrev(null); setMsg(null); setRecalc(null);
  };

  const descargarPlantilla = async () => {
    const XLSX = await import("xlsx");
    const aoa = modo === "precios"
      ? [["unidad", "precio", "fecha"], ["[5921] AL30", 91320, "2026-04-30"]]
      : [["Cuenta", "Unidad", "Cantidad", "Fecha", "Precio", "Valuación"],
         ["[805] MOLLO NICOLAS", "[5921] AL30", 100, "2026-04-30", 91320, 91320]];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, modo);
    XLSX.writeFile(wb, `plantilla_${modo}.xlsx`);
  };

  const onFile = async (file: File) => {
    setMsg(null); setPrev(null); setRecalc(null); setRows([]); setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const isCsv = /\.csv$/i.test(file.name);
      const wb = isCsv
        ? XLSX.read(new TextDecoder("utf-8").decode(buf), { type: "string" })
        : XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
      if (!json.length) { setMsg({ ok: false, text: "El archivo está vacío." }); return; }
      // El backend mapea las columnas (acepta Unidad/Precio/Fecha/Cuenta/... con o sin
      // mayúscula) → mandamos las filas crudas y validamos contra la previsualización.
      setRows(json);
    } catch (e) {
      setMsg({ ok: false, text: `No se pudo leer el archivo: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const enviar = async (commit: boolean) => {
    if (busy || !rows.length) return;
    setBusy(true); setMsg(null); setRecalc(null);
    const url = modo === "precios"
      ? "/api/manager/import-precios-sql" : "/api/manager/import-aum-sql";
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, commit }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.detail) detail = String(j.detail); } catch { /* */ }
        throw new Error(detail);
      }
      const j: ImportResp = await res.json();
      setPrev(j);
      if (j.aplicado) {
        const txt = modo === "precios"
          ? `✓ ${j.filas_actualizadas ?? 0} precios actualizados. (La valuación se recalcula en el paso 2.)`
          : `✓ ${j.insertados ?? 0} filas insertadas, ${j.borrados ?? 0} reemplazadas.`;
        setMsg({ ok: true, text: txt });
      } else if (!commit) {
        setMsg({ ok: true, text: "Previsualización lista. Revisá y confirmá para aplicar." });
      }
    } catch (e) {
      setMsg({ ok: false, text: `Error: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  // Paso 2 — recalcular valuación de las fechas recién importadas (divisor por cartera).
  const recalcularValuacion = async (commit: boolean) => {
    const fechas = prev?.fechas ?? [];
    if (recalcBusy || !fechas.length) return;
    setRecalcBusy(true);
    try {
      const res = await fetch("/api/manager/recalcular-valuacion-sql", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechas, commit }),
      });
      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j?.detail) detail = String(j.detail); } catch { /* */ }
        throw new Error(detail);
      }
      const j: RecalcResp = await res.json();
      setRecalc(j);
      if (j.aplicado) setMsg({ ok: true, text: `✓ ${j.filas_actualizadas ?? 0} valuaciones recalculadas.` });
    } catch (e) {
      setMsg({ ok: false, text: `Error recalculando: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setRecalcBusy(false);
    }
  };

  const money = (n: number | undefined) =>
    "$" + (n ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });

  return (
    <div className="h-full overflow-y-auto p-4 text-[12px] text-[var(--t-text)]">
      <div className="max-w-[820px] space-y-4">
        {/* Selector de modo */}
        <div className="flex items-center gap-2">
          <Pill label="PRECIOS" active={modo === "precios"} onClick={() => cambiarModo("precios")} />
          <Pill label="IMPORTAR AUM" active={modo === "aum"} onClick={() => cambiarModo("aum")} />
        </div>

        <div>
          {modo === "precios" ? (
            <>
              <h2 className="text-[13px] font-semibold text-[var(--t-accent)] tracking-wide">PRECIOS → TENENCIA</h2>
              <p className="text-[var(--t-text-muted)] mt-1 leading-relaxed">
                Excel con <code className="text-[var(--t-text)]">unidad · precio · fecha</code>. Actualiza el{" "}
                <code className="text-[var(--t-text)]">precio</code> por (fecha, unidad). La valuación NO se
                recalcula acá (paso 2: precio×cantidad, /100 para bonos).
              </p>
            </>
          ) : (
            <>
              <h2 className="text-[13px] font-semibold text-[var(--t-accent)] tracking-wide">IMPORTAR AUM → TENENCIA</h2>
              <p className="text-[var(--t-text-muted)] mt-1 leading-relaxed">
                Excel con <code className="text-[var(--t-text)]">Cuenta · Unidad · Cantidad · Fecha · Precio · Valuación</code>.
                Pisa las tenencias de cada fecha (idempotente: re-subir reemplaza). El resto de columnas las resuelve la vista.
              </p>
            </>
          )}
          <button onClick={descargarPlantilla}
            className="mt-2 px-2 py-1 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]">
            ↓ DESCARGAR PLANTILLA
          </button>
        </div>

        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-3">
          <label className="inline-block px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] cursor-pointer hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)]">
            ELEGIR ARCHIVO (.xlsx / .csv)
            <input type="file" accept=".csv,.xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
              className="hidden" />
          </label>
          {fileName && rows.length > 0 && (
            <div className="text-[var(--t-text-muted)]">
              <span className="text-[var(--t-text)]">{fileName}</span> · {rows.length.toLocaleString("es-AR")} filas
            </div>
          )}
          {rows.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => enviar(false)} disabled={busy}
                className="px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-50">
                {busy ? "…" : "1) PREVISUALIZAR"}
              </button>
              {prev && (prev.n_validas ?? 0) > 0 && !prev.aplicado && (
                <button onClick={() => enviar(true)} disabled={busy}
                  className="px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] bg-[var(--t-accent)]/10 text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50">
                  {busy ? "Aplicando…" : `2) CONFIRMAR E IMPORTAR (${prev.n_validas})`}
                </button>
              )}
            </div>
          )}
          {msg && <div className={msg.ok ? "text-green-400" : "text-red-400"}>{msg.text}</div>}
        </div>

        {prev && (
          <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-2">
            <div className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">PREVISUALIZACIÓN</div>
            <div className="flex flex-wrap gap-6">
              <OpsStat label="FILAS OK" value={(prev.n_validas ?? 0).toLocaleString("es-AR")} />
              <OpsStat label="ERRORES" value={(prev.n_errores ?? 0).toLocaleString("es-AR")} />
              {modo === "precios" ? (
                <>
                  <OpsStat label="MATCHEAN" value={(prev.matchean ?? 0).toLocaleString("es-AR")} />
                  <OpsStat label="SIN MATCH" value={(prev.sin_match ?? 0).toLocaleString("es-AR")} />
                </>
              ) : (
                <>
                  <OpsStat label="CUENTAS" value={String(prev.n_cuentas ?? 0)} />
                  <OpsStat label="VALUACIÓN TOTAL" value={"$" + (prev.total_valuacion ?? 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })} />
                </>
              )}
            </div>
            <div className="text-[var(--t-text-muted)]">
              <span className="text-[var(--t-text-dim)]">Fechas:</span> {(prev.fechas ?? []).join(", ") || "—"}
            </div>
            {prev.columnas_detectadas && prev.columnas_detectadas.length > 0 && (
              <div className="text-[var(--t-text-muted)] text-[10px]">
                <span className="text-[var(--t-text-dim)]">Columnas detectadas:</span>{" "}
                {prev.columnas_detectadas.map((c) => `"${c}"`).join(" · ")}
              </div>
            )}
            {prev.errores && prev.errores.length > 0 && (
              <div className="text-red-400 text-[11px]">
                <div className="font-semibold">Filas con error (no se importan):</div>
                {prev.errores.slice(0, 20).map((e) => (
                  <div key={e.fila}>fila {e.fila}: {e.detalle}</div>
                ))}
                {prev.errores.length > 20 ? <div>… +{prev.errores.length - 20} más</div> : null}
              </div>
            )}
          </div>
        )}

        {/* ── PASO 2: recalcular valuación (sólo tras importar PRECIOS) ── */}
        {modo === "precios" && prev?.aplicado && (prev.fechas?.length ?? 0) > 0 && (
          <div className="border border-[var(--t-accent)]/40 bg-[var(--t-panel)] p-3 space-y-3">
            <div>
              <h3 className="text-[12px] font-semibold text-[var(--t-accent)] tracking-wide">
                PASO 2 → RECALCULAR VALUACIÓN
              </h3>
              <p className="text-[var(--t-text-muted)] mt-1 leading-relaxed">
                <code className="text-[var(--t-text)]">valuación = cantidad × precio</code> (÷100 para renta fija:
                carteras HD · DL · ARS). FCI · RENTA VARIABLE · MONEDAS · DERIVADOS van directo. Las carteras
                sin regla (ej. FINANCIAMIENTO) <span className="text-[var(--t-text)]">NO se tocan</span>.
                Fechas: {(prev.fechas ?? []).join(", ")}.
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => recalcularValuacion(false)} disabled={recalcBusy}
                className="px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] disabled:opacity-50">
                {recalcBusy ? "…" : "PREVISUALIZAR ANTES/DESPUÉS"}
              </button>
              {recalc && (recalc.n_recalculadas ?? 0) > 0 && !recalc.aplicado && (
                <button onClick={() => recalcularValuacion(true)} disabled={recalcBusy}
                  className="px-3 py-1.5 text-[11px] font-semibold border border-[var(--t-accent)] bg-[var(--t-accent)]/10 text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-bg)] disabled:opacity-50">
                  {recalcBusy ? "Aplicando…" : `APLICAR (${recalc.n_recalculadas})`}
                </button>
              )}
            </div>

            {recalc && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-6">
                  <OpsStat label="VALUACIÓN ANTES" value={money(recalc.total_antes)} />
                  <OpsStat label="VALUACIÓN DESPUÉS" value={money(recalc.total_despues)} />
                  <OpsStat label="Δ" value={money((recalc.total_despues ?? 0) - (recalc.total_antes ?? 0))} />
                </div>
                {recalc.carteras && recalc.carteras.length > 0 && (
                  <table className="w-full text-[11px]">
                    <thead className="text-[var(--t-text-muted)] text-left">
                      <tr>
                        <th className="py-1">CARTERA</th><th>÷</th><th className="text-right">FILAS</th>
                        <th className="text-right">ANTES</th><th className="text-right">DESPUÉS</th><th className="text-right">Δ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recalc.carteras.map((c) => (
                        <tr key={c.cartera} className="border-t border-[var(--t-border)]">
                          <td className="py-1 text-[var(--t-text)]">{c.cartera}</td>
                          <td className="text-[var(--t-text-dim)]">{c.divisor}</td>
                          <td className="text-right">{c.n.toLocaleString("es-AR")}</td>
                          <td className="text-right text-[var(--t-text-dim)]">{money(c.total_antes)}</td>
                          <td className="text-right text-[var(--t-text)]">{money(c.total_despues)}</td>
                          <td className={"text-right " + (c.delta >= 0 ? "text-green-400" : "text-red-400")}>{money(c.delta)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {recalc.sin_clasificar && recalc.sin_clasificar.length > 0 && (
                  <div className="text-[11px] text-amber-400">
                    <div className="font-semibold">Carteras SIN regla (no se tocan — definí el divisor):</div>
                    {recalc.sin_clasificar.map((s) => (
                      <div key={s.cartera}>{s.cartera}: {s.n.toLocaleString("es-AR")} filas · {money(s.total_antes)}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
  observabilidad: ["manager"],
  validaciones: ["manager"],
  titulos:      ["manager", "manager_titulos", "manager_instrumentos"],
  clientes:     ["manager", "manager_clientes"],
  contrapartes: ["manager", "manager_contrapartes"],
  "aca-valores": ["manager", "manager_clientes"],
  compliance:   ["manager", "manager_compliance"],
  aunesa:       ["manager", "manager_aunesa"],
  operaciones:  ["manager"],
  documentos:   ["manager"],
  usuarios:     ["manager"],
};

// ── Tab: COMPLIANCE — operador nuestro vs Aunesa (live, no persiste) ──────────
interface ComplianceFila {
  id_cuenta: string;
  denominacion: string | null;
  nuestro_email: string | null;
  nuestro_nombre: string | null;
  aunesa_email: string | null;
  aunesa_nombre: string | null;
  categoria: "ok" | "distinto" | "falta_en_nuestra_base" | "falta_en_aunesa";
  difiere: boolean;
}

const _CMP_LABEL: Record<string, string> = {
  ok: "OK",
  distinto: "DISTINTO",
  falta_en_nuestra_base: "FALTA (n/base)",
  falta_en_aunesa: "FALTA (Aunesa)",
};
const _CMP_COLOR: Record<string, string> = {
  ok: "var(--t-pos)",
  distinto: "var(--t-neg)",
  falta_en_nuestra_base: "#ff9900",
  falta_en_aunesa: "#ff9900",
};

function ComplianceGroup() {
  const [data, setData] = useState<{ filas: ComplianceFila[]; total: number; difieren: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Por default mostrar solo las diferencias (lo que el auditor quiere ver).
  const [soloDif, setSoloDif] = usePersistedState<boolean>("manager.compliance.soloDif", true);

  const cargar = useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch("/api/manager/compliance/operadores", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: { filas: ComplianceFila[]; total: number; difieren: number }) => setData(d))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const filas = (data?.filas ?? []).filter((f) => !soloDif || f.difiere);

  // Descarga la conciliación visible a Excel. CSV con BOM UTF-8 + separador ';'
  // (Excel es-AR lo abre en columnas directo) + comillas (denominaciones con coma).
  const descargarExcel = () => {
    if (!filas.length) return;
    const esc = (v: string | null | undefined) => `"${(v ?? "").toString().replace(/"/g, '""')}"`;
    const header = ["CUENTA", "DENOMINACIÓN", "OPERADOR (NUESTRO)", "MAIL (NUESTRO)",
                    "OPERADOR (AUNESA)", "MAIL (AUNESA)", "ESTADO"];
    const lineas = [header.map(esc).join(";")];
    for (const f of filas) {
      lineas.push([f.id_cuenta, f.denominacion, f.nuestro_nombre, f.nuestro_email,
                   f.aunesa_nombre, f.aunesa_email, _CMP_LABEL[f.categoria] ?? f.categoria]
                  .map(esc).join(";"));
    }
    const blob = new Blob(["﻿" + lineas.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conciliacion_operadores_${soloDif ? "difs_" : ""}${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-2">
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest">
          COMPLIANCE — OPERADOR NUESTRO vs AUNESA
        </span>
        {data && (
          <span className="text-[10px] text-[var(--t-text-muted)]">
            <span className="text-[var(--t-neg)] font-semibold">{data.difieren}</span> difieren / {data.total} cuentas
          </span>
        )}
        <label className="flex items-center gap-1 text-[10px] text-[var(--t-text-dim)] ml-2 cursor-pointer">
          <input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} />
          solo diferencias
        </label>
        <button onClick={descargarExcel} disabled={loading || filas.length === 0}
          className="ml-auto px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          ⬇ Excel
        </button>
        <button onClick={cargar} disabled={loading}
          className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40">
          {loading ? "Consultando Aunesa…" : "↻ Re-consultar"}
        </button>
      </div>
      {err && <div className="text-[10px] text-[var(--t-neg)] shrink-0">Error consultando Aunesa: {err}</div>}
      <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)]">
        <table className="w-full">
          <thead>
            <tr>
              <th>CUENTA</th>
              <th>DENOMINACIÓN</th>
              <th>OPERADOR (NUESTRO)</th>
              <th>OPERADOR (AUNESA)</th>
              <th>ESTADO</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id_cuenta} className={f.difiere ? "bg-[var(--t-neg)]/10" : ""}>
                <td className="font-mono text-[var(--t-text-dim)]">{f.id_cuenta}</td>
                <td className="text-[var(--t-text)]">{f.denominacion ?? "—"}</td>
                <td className="font-mono">{f.nuestro_nombre || f.nuestro_email || "—"}</td>
                <td className="font-mono">{f.aunesa_nombre || f.aunesa_email || "—"}</td>
                <td>
                  <span className="text-[10px] font-semibold" style={{ color: _CMP_COLOR[f.categoria] }}>
                    {_CMP_LABEL[f.categoria] ?? f.categoria}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !loading && filas.length === 0 && (
          <div className="p-3 text-[10px] text-[var(--t-text-muted)]">
            {soloDif ? "Sin diferencias — todos los operadores coinciden con Aunesa. 🎉" : "Sin datos."}
          </div>
        )}
      </div>
    </div>
  );
}

export function ManagerView({ modules = null }: { modules?: string[] | null }) {
  const allTabs: { id: Tab; label: string }[] = [
    { id: "observabilidad", label: "OBSERVABILIDAD" },
    { id: "validaciones", label: "VALIDACIONES" },
    { id: "titulos",      label: "TÍTULOS"      },
    { id: "clientes",     label: "CLIENTES"     },
    { id: "contrapartes", label: "CONTRAPARTES" },
    { id: "aca-valores",  label: "ACA VALORES"  },
    { id: "compliance",   label: "COMPLIANCE"   },
    { id: "aunesa",       label: "AUNESA"       },
    { id: "operaciones",  label: "OPERACIONES"  },
    { id: "documentos",   label: "DOCUMENTOS"   },
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
  const [tabRaw, setTab] = usePersistedState<Tab>("manager.tab", tabs[0]?.id ?? "clientes");
  // Migración de tabs viejas persistidas: diagnostico/controles/jobs se
  // consolidaron en observabilidad — sin este guard quedaba contenido vacío.
  const tab: Tab = tabs.some((t) => t.id === tabRaw)
    ? tabRaw
    : (tabs[0]?.id ?? "clientes");

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
        {tab === "observabilidad" && <ObservabilidadGroup goTo={setTab} modules={modules} />}
        {tab === "validaciones" && <ValidacionesGroup />}
        {tab === "titulos"      && <TitulosGroup modules={modules} />}
        {tab === "clientes"     && <TabClientes canBulk={canBulk} />}
        {tab === "contrapartes" && <TabContrapartes />}
        {tab === "aca-valores"  && <TabAcaValores />}
        {tab === "compliance"   && <ComplianceGroup />}
        {tab === "aunesa"       && <AunesaGroup modules={modules} />}
        {tab === "operaciones"  && <OperacionesBackfillPanel />}
        {tab === "documentos"   && <TabDocumentos />}
        {tab === "usuarios"     && <UsuariosGroup />}
      </div>
    </div>
  );
}
