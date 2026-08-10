"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePersistedState } from "@/lib/use-persisted-state";
import { SaludPanel } from "@/components/manager-salud-panel";
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
import { TabMesa } from "./manager-mesa-panel";
import { TabDocumentos } from "./manager-documentos-view";
import { LogsPanel } from "./logs-panel";
import { ManagerDebugXirrPanel } from "./manager-debug-xirr";
import { ManagerDebugTeaPanel } from "./manager-debug-tea";
import { RolesPanel } from "./roles-panel";
import { UsuariosPanel } from "./usuarios-panel";
import { GROUP_HEADER, GROUP_TITLE, Pill } from "./manager-shared";
import { OpcionesExpiriesPanel, TabValidaciones } from "./manager-validaciones-panel";
import { TabClientes } from "./manager-clientes-panel";
import { TitulosGroup } from "./manager-titulos-panel";
import { ImportTenenciaPanel, OperacionesBackfillPanel } from "./manager-operaciones-panel";

// ── Types ─────────────────────────────────────────────────────────────────────

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

type Tab =
  | "observabilidad"
  | "validaciones"
  | "titulos"
  | "clientes"
  | "contrapartes"
  | "aca-valores"
  | "aunesa"
  | "operaciones"
  | "mesa"
  | "documentos"
  | "usuarios";

// AUNESA es un grupo con tres sub-vistas:
//  - FLUJO:    explorador de movimientos de Aunesa.
//  - AUM:      consulta de Valuaciones.AuM (la base) por cuenta/fecha.
//  - POSICIÓN: pega EN VIVO a Aunesa (posicionValuada) — para comparar
//              lo que Aunesa manda contra lo persistido en AUM.
// ── Grupos consolidados (sub-tabs con Pill, patrón AunesaGroup) ───────────────


// ── OBSERVABILIDAD → LATENCIA: ranking endpoint × latencia ────────────────────
// Lee /api/manager/latencia (agregado endpoint × hora que flushea el
// middleware del backend). Responde "¿qué vista está lenta hoy?" sin correr
// diags a mano: ranking por tiempo total consumido + tendencia horaria.
interface LatenciaResp {
  ventana_horas: number;
  endpoints: { endpoint: string; n: number; avg_ms: number; max_ms: number;
               lentas: number; errores: number; pct_lentas: number }[];
  serie: { hora: string; n: number; avg_ms: number; max_ms: number }[];
  total_requests: number;
}

function LatenciaPanel() {
  const [horas, setHoras] = useState<24 | 168 | 720>(24);
  const [data, setData] = useState<LatenciaResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setErr(null);
    fetch(`/api/manager/latencia?horas=${horas}`, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: LatenciaResp) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "error"); });
    return () => { alive = false; };
  }, [horas]);

  const maxAvgSerie = useMemo(
    () => Math.max(1, ...(data?.serie ?? []).map((p) => p.avg_ms)),
    [data],
  );

  // Semáforo del avg: <500ms ok · 500-1000 atención · >1s problema.
  const colorAvg = (ms: number) =>
    ms >= 1000 ? "var(--t-neg)" : ms >= 500 ? "#ff9900" : "var(--t-text)";

  const VENTANAS = [[24, "24 h"], [168, "7 d"], [720, "30 d"]] as const;

  return (
    <div className="h-full overflow-auto p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-text-muted)]">
          Latencia por endpoint {data ? `· ${data.total_requests.toLocaleString("es-AR")} requests` : ""}
        </span>
        <div className="flex rounded overflow-hidden border border-[var(--t-border-2)] ml-auto">
          {VENTANAS.map(([h, label]) => (
            <button key={h} type="button" onClick={() => setHoras(h)}
              className={`text-[10px] font-semibold px-2.5 py-0.5 ${horas === h ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-muted)]"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="text-[11px] text-[var(--t-neg)]">No pude cargar la latencia ({err}).</p>}
      {data && data.serie.length > 1 && (
        <div className="flex items-end gap-[2px] h-10 mb-3" title="Latencia promedio por hora (toda la API)">
          {data.serie.map((p) => (
            <div key={p.hora} className="flex-1 min-w-[2px]"
              title={`${new Date(p.hora).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit" })}h · avg ${p.avg_ms}ms · max ${p.max_ms}ms · ${p.n.toLocaleString("es-AR")} req`}
              style={{
                height: `${Math.max(6, Math.round((p.avg_ms / maxAvgSerie) * 100))}%`,
                background: colorAvg(p.avg_ms) === "var(--t-text)" ? "var(--t-accent)" : colorAvg(p.avg_ms),
                opacity: 0.85,
              }}
            />
          ))}
        </div>
      )}
      {data && data.endpoints.length === 0 && !err && (
        <p className="text-[11px] text-[var(--t-text-muted)]">
          Sin datos todavía — la telemetría acumula desde el deploy (flush cada ~60s).
        </p>
      )}
      {data && data.endpoints.length > 0 && (
        <table>
          <thead>
            <tr>
              <th className="text-left">ENDPOINT</th>
              <th className="text-right">REQ</th>
              <th className="text-right">AVG MS</th>
              <th className="text-right">MAX MS</th>
              <th className="text-right">&gt;1s</th>
              <th className="text-right">ERRORES</th>
            </tr>
          </thead>
          <tbody>
            {data.endpoints.map((e) => (
              <tr key={e.endpoint}>
                <td className="font-mono text-[var(--t-accent)]">{e.endpoint}</td>
                <td className="text-right tabular-nums">{e.n.toLocaleString("es-AR")}</td>
                <td className="text-right tabular-nums font-semibold" style={{ color: colorAvg(e.avg_ms) }}>
                  {e.avg_ms.toLocaleString("es-AR")}
                </td>
                <td className="text-right tabular-nums text-[var(--t-text-dim)]">{e.max_ms.toLocaleString("es-AR")}</td>
                <td className="text-right tabular-nums" style={{ color: e.pct_lentas >= 10 ? "var(--t-neg)" : e.lentas ? "#ff9900" : "var(--t-text-dim)" }}>
                  {e.lentas ? `${e.lentas.toLocaleString("es-AR")} (${e.pct_lentas}%)` : "·"}
                </td>
                <td className="text-right tabular-nums" style={{ color: e.errores ? "var(--t-neg)" : "var(--t-text-dim)" }}>
                  {e.errores ? e.errores.toLocaleString("es-AR") : "·"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[10px] text-[var(--t-text-muted)] mt-2">
        Ordenado por tiempo total consumido (req × avg) — lo que más &quot;factura&quot; latencia
        arriba. &gt;1s = requests sobre el umbral de lentitud del backend.
      </p>
    </div>
  );
}

// OBSERVABILIDAD: consolida CONTROLES (calidad de datos) + DIAGNÓSTICO
// (frescura de motores/jobs + logs) + JOBS (catálogo completo desde
// el crontab + historial). La pill CONTROLES lleva "!" si hay anomalías.
function ObservabilidadGroup({ goTo, modules }: { goTo: (tab: Tab) => void; modules?: string[] | null }) {
  const [subRaw, setSub] = usePersistedState<"salud" | "controles" | "diagnostico" | "jobs" | "base" | "ia" | "latencia" | "uso">(
    // SALUD es el default: es la pantalla que responde "¿está todo bien?". Las demás
    // pasan a ser el DETALLE al que se llega cuando algo está roto.
    // Clave NUEVA (.v2) a propósito: el default solo aplica a quien nunca eligió una
    // tab, y todos los que ya usaban Manager tenían "controles"/"jobs" guardado en el
    // navegador — con la clave vieja no habrían visto SALUD nunca. Al estrenar clave,
    // todos entran una vez por SALUD y de ahí en más se respeta lo que elijan.
    "manager.obs.sub.v2", "salud");
  // La pill IA solo existe con el módulo `ia` (marca AI, canary del RBAC).
  // Guard sobre el estado persistido: si tildaron IA y después se lo sacaron
  // al rol, no dejar la tab clavada en contenido inaccesible.
  const canIa = modules == null || modules.includes("ia");
  // "uso" quedó en el union solo para migrar el estado persistido viejo (la
  // telemetría de USO fue decomisada del backend) — cae a "controles".
  // Migración del estado guardado: quien tenía CONTROLES o JOBS elegidos cae a
  // SALUD, que es donde vive ese contenido ahora.
  const sub = (subRaw === "ia" && !canIa) || subRaw === "uso"
    || subRaw === "controles" || subRaw === "jobs" ? "salud" : subRaw;
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
        <Pill label="SALUD" active={sub === "salud"} onClick={() => setSub("salud")} />
        {/* CONTROLES y JOBS ya no tienen pill propia: su contenido vive DENTRO del
            chequeo en SALUD (las anomalías de un control, las corridas con su log y
            errores de un job). Tener las dos cosas en dos lugares era justamente el
            problema — se miraba el tablero y no el detalle, o al revés. */}
        <Pill label="DIAGNÓSTICO" active={sub === "diagnostico"} onClick={() => setSub("diagnostico")} />
        <Pill label="BASE" active={sub === "base"} onClick={() => setSub("base")} />
        <Pill label="LATENCIA" active={sub === "latencia"} onClick={() => setSub("latencia")} />
        {canIa && <Pill label="IA" active={sub === "ia"} onClick={() => setSub("ia")} />}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "salud"       && <SaludPanel />}
        {sub === "diagnostico" && <DiagnosticoGroup />}
        {sub === "base"        && <DbBasePanel />}
        {sub === "latencia"    && <LatenciaPanel />}
        {sub === "ia"          && <IaPanel />}
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

// DIAGNÓSTICO: Motores (rediseñado 50/50) + Logs.
// RECURSOS (CPU/RAM/swap/disk del Droplet) se ELIMINÓ: era un tablero de métricas
// crudas que no respondía si el sistema estaba sano — esa pregunta la contesta
// OBSERVABILIDAD → SALUD. Se fue también el sampler de fondo del backend.
function DiagnosticoGroup() {
  const [subRaw, setSub] = usePersistedState<"motores" | "logs">("manager.diag.sub", "motores");
  // Guard sobre el estado persistido: quien tenía RECURSOS elegido cae a ÁRBOL.
  const sub = subRaw === "motores" || subRaw === "logs" ? subRaw : "motores";
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className={GROUP_HEADER}>
        <span className={GROUP_TITLE}>DIAGNÓSTICO</span>
        <Pill label="ÁRBOL" active={sub === "motores"} onClick={() => setSub("motores")} />
        <Pill label="LOGS" active={sub === "logs"} onClick={() => setSub("logs")} />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {sub === "motores"  && <TabDiagnostico />}
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
  aunesa:       ["manager", "manager_aunesa"],
  operaciones:  ["manager"],
  mesa:         ["manager"],
  documentos:   ["manager"],
  usuarios:     ["manager"],
};

export function ManagerView({ modules = null }: { modules?: string[] | null }) {
  const allTabs: { id: Tab; label: string }[] = [
    { id: "observabilidad", label: "OBSERVABILIDAD" },
    { id: "validaciones", label: "VALIDACIONES" },
    { id: "titulos",      label: "TÍTULOS"      },
    { id: "clientes",     label: "CLIENTES"     },
    { id: "contrapartes", label: "CONTRAPARTES" },
    { id: "aca-valores",  label: "ACA VALORES"  },
    { id: "aunesa",       label: "AUNESA"       },
    { id: "operaciones",  label: "OPERACIONES"  },
    { id: "mesa",         label: "MESA"         },
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
        {tab === "aunesa"       && <AunesaGroup modules={modules} />}
        {tab === "operaciones"  && <OperacionesBackfillPanel />}
        {tab === "mesa"         && <TabMesa />}
        {tab === "documentos"   && <TabDocumentos />}
        {tab === "usuarios"     && <UsuariosGroup />}
      </div>
    </div>
  );
}
