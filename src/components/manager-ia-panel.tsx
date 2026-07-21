"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * OBSERVABILIDAD → IA — trazas del gateway (core/ai.py + core/llm.py, QuantAI).
 *
 * Rediseño 2026-07-21 (pedido del user: "queda fea, demasiado espacio libre,
 * pocas llamadas y sin historial"). Layout:
 *
 *   ┌─ KPIs en una tira compacta + barra de presupuesto ─────────────┐
 *   ├─ IZQ (2/5): TAREA · DÍA · PROVEEDOR (tabs)  │ DER (3/5):        │
 *   │            PRESUPUESTO (acordeón)           │ LLAMADAS a altura │
 *   │                                             │ completa + filtros│
 *   └─────────────────────────────────────────────┴───────────────────┘
 *   El DETALLE es un drawer que entra al elegir una llamada — antes era
 *   medio panel vacío ocupando lugar todo el tiempo.
 *
 * Historial: el server pagina y filtra (tarea/usuario/errores/texto).
 */

interface TrazaRow {
  id: number;
  ts: string;
  tarea: string;
  modelo: string;
  usuario: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latencia_ms: number | null;
  ok: boolean;
  error: string | null;
  feedback: number | null;
  detalle: string | null;
  respuesta: string | null;
  razonamiento: string | null;
}

interface PorDiaRow {
  fecha: string; llamadas: number; errores: number;
  tokens_in: number; tokens_out: number; latencia_ms_avg: number | null;
}
interface PorTareaRow {
  tarea: string; llamadas: number; errores: number;
  tokens: number; latencia_ms_avg: number | null; ultima: string;
}
interface PorProveedorRow {
  proveedor: string; modelos: string[]; llamadas: number; errores: number;
  tokens: number; latencia_ms_avg: number | null; no_entrena: boolean | null;
  /** Gasto estimado desde los tokens (tabla de precios en core/llm.py):
   * OpenAI no expone saldo por API, así que es la única forma de seguirlo. */
  costo_usd: number; costo_usd_hoy: number; costo_estimable: boolean;
}

interface ObsResp {
  hoy: {
    llamadas: number; errores: number; tokens_in: number; tokens_out: number;
    tokens_total: number; presupuesto_dia: number; presupuesto_pct: number | null;
  };
  por_dia: PorDiaRow[];
  por_tarea: PorTareaRow[];
  por_proveedor: PorProveedorRow[];
  ultimas: TrazaRow[];
  total_llamadas: number;
  offset: number;
  limit: number;
  tareas: string[];
  ventana_dias: number;
}

interface PresupuestosResp {
  global_dia: number;
  usuario_dia: number;
  excepciones: { usuario: string; valor: number }[];
  editado: { por: string | null; cuando: string } | null;
}

interface ProveedorEstado {
  proveedor: string;
  configurado: boolean;
  no_entrena: boolean;
  modelos: Record<string, string>;
  saldo: {
    disponible: boolean | null;
    saldos: { moneda: string | null; total: string | null; otorgado: string | null; cargado: string | null }[];
  } | null;
}
interface SaldoResp { proveedores: ProveedorEstado[] }

const nf = new Intl.NumberFormat("es-AR");
const PAGINA = 60;

function fmtTs(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-AR", {
        day: "2-digit", month: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
}
/** Gasto en dólares: los importes chicos necesitan más decimales para no
 * verse todos como "USD 0.00" (una pregunta cuesta fracciones de centavo). */
function fmtUsd(v: number): string {
  if (v === 0) return "USD 0";
  if (v < 0.01) return `USD ${v.toFixed(4)}`;
  if (v < 1) return `USD ${v.toFixed(3)}`;
  return `USD ${v.toFixed(2)}`;
}

/** 1.234.567 → 1,2M — para que los KPI no se coman la fila. */
function compact(n: number): string {
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return nf.format(n);
}

const TH = "px-2 py-1 text-left text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest whitespace-nowrap";
const THR = `${TH} text-right`;
const TD = "px-2 py-0.5 whitespace-nowrap";
const TDR = `${TD} text-right tabular-nums`;
const CUAD = "border border-[var(--t-border)] bg-[var(--t-panel)] min-h-0 flex flex-col overflow-hidden";
const CUAD_TITULO = "px-3 py-1.5 border-b border-[var(--t-border)] text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest shrink-0 flex items-center gap-2";
const LBL = "text-[9px] text-[var(--t-text-muted)] tracking-widest";
const INPUT = "w-24 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-right tabular-nums text-[11px] font-mono outline-none focus:border-[var(--t-accent)]";
const BTN = "px-2 py-1 text-[9px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40 transition-colors";
const CHIP = "px-2 py-0.5 text-[9px] font-semibold tracking-widest border transition-colors";

/** Tarjeta de KPI de la tira superior. */
function Kpi({ label, valor, sub, tono }: {
  label: string; valor: string; sub?: React.ReactNode; tono?: "pos" | "neg";
}) {
  const color = tono === "neg" ? "text-[var(--t-neg)]" : tono === "pos" ? "text-[var(--t-pos)]" : "text-[var(--t-text)]";
  return (
    <div className="px-3 py-1.5 border-r border-[var(--t-border)] last:border-r-0 min-w-0">
      <div className={LBL}>{label}</div>
      <div className={`text-[15px] font-mono tabular-nums leading-tight ${color}`}>{valor}</div>
      {sub && <div className="text-[9px] text-[var(--t-text-dim)] font-mono truncate">{sub}</div>}
    </div>
  );
}

export function IaPanel() {
  const [data, setData] = useState<ObsResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tabTabla, setTabTabla] = useState<"tarea" | "dia" | "proveedor">("tarea");
  const [sel, setSel] = useState<TrazaRow | null>(null);
  const [verPresupuesto, setVerPresupuesto] = useState(false);
  // filtros del historial (server-side)
  const [fTarea, setFTarea] = useState("");
  const [fUsuario, setFUsuario] = useState("");
  const [fError, setFError] = useState(false);
  const [fQ, setFQ] = useState("");
  const [qAplicada, setQAplicada] = useState("");
  const [offset, setOffset] = useState(0);
  // presupuestos
  const [presGlobal, setPresGlobal] = useState("");
  const [presUsuario, setPresUsuario] = useState("");
  const [presEditado, setPresEditado] = useState<PresupuestosResp["editado"]>(null);
  const [presMsg, setPresMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [proveedores, setProveedores] = useState<ProveedorEstado[]>([]);
  const [excepciones, setExcepciones] = useState<PresupuestosResp["excepciones"]>([]);
  const [excEmail, setExcEmail] = useState("");
  const [excValor, setExcValor] = useState("");

  const qs = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGINA), offset: String(offset) });
    if (fTarea) p.set("tarea", fTarea);
    if (fUsuario.trim()) p.set("usuario", fUsuario.trim());
    if (fError) p.set("solo_error", "true");
    if (qAplicada.trim()) p.set("q", qAplicada.trim());
    return p.toString();
  }, [offset, fTarea, fUsuario, fError, qAplicada]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ia/observabilidad?${qs}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as ObsResp);
      setErr(null);
      const rp = await fetch("/api/ia/presupuesto", { cache: "no-store" });
      if (rp.ok) {
        const p = (await rp.json()) as PresupuestosResp;
        setPresGlobal(String(p.global_dia));
        setPresUsuario(String(p.usuario_dia));
        setPresEditado(p.editado);
        setExcepciones(p.excepciones ?? []);
      }
      const rs = await fetch("/api/ia/saldo", { cache: "no-store" });
      if (rs.ok) setProveedores(((await rs.json()) as SaldoResp).proveedores ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, [qs]);

  const guardarPresupuestos = useCallback(async () => {
    setGuardando(true);
    setPresMsg(null);
    try {
      const res = await fetch("/api/ia/presupuesto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          global_dia: Number(presGlobal) || null,
          usuario_dia: Number(presUsuario) || null,
        }),
      });
      const j = await res.json();
      if (res.status === 403) setPresMsg("solo admin");
      else if (!res.ok) setPresMsg(typeof j?.detail === "string" ? j.detail : `HTTP ${res.status}`);
      else {
        setPresMsg("guardado ✓");
        setPresEditado((j as PresupuestosResp).editado);
        void cargar();
      }
    } catch (e) {
      setPresMsg(e instanceof Error ? e.message : "error");
    } finally {
      setGuardando(false);
    }
  }, [presGlobal, presUsuario, cargar]);

  const guardarExcepcion = useCallback(async (email: string, valor: number | null) => {
    setPresMsg(null);
    try {
      const res = await fetch("/api/ia/presupuesto/usuario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, valor }),
      });
      const j = await res.json();
      if (res.status === 403) setPresMsg("solo admin");
      else if (!res.ok) setPresMsg(typeof j?.detail === "string" ? j.detail : `HTTP ${res.status}`);
      else {
        setExcepciones((j as PresupuestosResp).excepciones ?? []);
        setExcEmail(""); setExcValor(""); setPresMsg("guardado ✓");
      }
    } catch (e) {
      setPresMsg(e instanceof Error ? e.message : "error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const hoy = data?.hoy;
  const pct = hoy?.presupuesto_pct ?? 0;
  const total = data?.total_llamadas ?? 0;
  const desde = total === 0 ? 0 : offset + 1;
  const hasta = Math.min(offset + (data?.ultimas.length ?? 0), total);
  const hayFiltro = !!(fTarea || fUsuario.trim() || fError || qAplicada.trim());

  const aplicarFiltro = (fn: () => void) => { setOffset(0); fn(); };

  return (
    <div className="h-full min-h-0 p-2 flex flex-col gap-2 relative">
      {/* ── TIRA DE KPIs ───────────────────────────────────────────── */}
      <div className={`${CUAD} shrink-0`}>
        <div className="flex items-stretch flex-wrap">
          <Kpi
            label="TOKENS HOY"
            valor={hoy ? compact(hoy.tokens_total) : "—"}
            sub={hoy ? `IN ${compact(hoy.tokens_in)} · OUT ${compact(hoy.tokens_out)}` : undefined}
          />
          <Kpi
            label="DEL PRESUPUESTO"
            valor={hoy?.presupuesto_pct != null ? `${hoy.presupuesto_pct}%` : "—"}
            sub={hoy ? `de ${compact(hoy.presupuesto_dia)} tokens/día` : undefined}
            tono={pct >= 80 ? "neg" : undefined}
          />
          <Kpi
            label="LLAMADAS HOY"
            valor={hoy ? nf.format(hoy.llamadas) : "—"}
            sub={hoy && hoy.errores > 0 ? <span className="text-[var(--t-neg)]">{hoy.errores} con error</span> : "sin errores"}
            tono={hoy && hoy.errores > 0 ? "neg" : undefined}
          />
          {proveedores.map((p) => {
            const s = p.saldo?.saldos?.[0];
            const uso = data?.por_proveedor.find((x) => x.proveedor === p.proveedor);
            // DeepSeek expone saldo real; OpenAI NO tiene endpoint de saldo
            // (ni con admin key) → se muestra el gasto estimado desde los
            // tokens, que además sirve para los dos.
            const gastoHoy = uso?.costo_estimable ? uso.costo_usd_hoy : null;
            return (
              <Kpi
                key={p.proveedor}
                label={p.proveedor.toUpperCase()}
                valor={s ? `${s.moneda} ${s.total ?? "—"}` : gastoHoy != null ? fmtUsd(gastoHoy) : (p.configurado ? "activo" : "sin key")}
                tono={!p.configurado ? "neg" : p.saldo?.disponible === false ? "neg" : "pos"}
                sub={
                  <span title={Object.values(p.modelos).join(" · ")}>
                    {s
                      ? `saldo · gastado hoy ${gastoHoy != null ? fmtUsd(gastoHoy) : "—"}`
                      : "gastado hoy (estimado)"}
                    {" · "}
                    {p.no_entrena ? "no entrena ✓" : "puede entrenar ⚠"}
                  </span>
                }
              />
            );
          })}
          <div className="ml-auto flex items-center gap-2 px-3">
            {err && <span className="text-[9px] font-mono text-[var(--t-neg)]">{err}</span>}
            <button onClick={() => setVerPresupuesto((v) => !v)} className={BTN}>
              {verPresupuesto ? "✕ LÍMITES" : "⚙ LÍMITES"}
            </button>
            <button onClick={() => void cargar()} disabled={loading} className={BTN}>
              {loading ? "…" : "↻"}
            </button>
          </div>
        </div>
        {/* barra de consumo del presupuesto */}
        <div className="h-1 bg-[var(--t-bg)] shrink-0">
          <div
            className={`h-full transition-all ${pct >= 80 ? "bg-[var(--t-neg)]" : "bg-[var(--t-accent)]"}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {/* ── LÍMITES (acordeón: solo cuando lo pedís) ────────────────── */}
      {verPresupuesto && (
        <div className={`${CUAD} shrink-0`}>
          <div className={CUAD_TITULO}>
            LÍMITES DE CONSUMO
            {presEditado && (
              <span className="ml-auto normal-case font-normal text-[var(--t-text-dim)]">
                último cambio: {presEditado.por ?? "—"} · {fmtTs(presEditado.cuando)}
              </span>
            )}
          </div>
          <div className="p-3 flex items-end gap-3 flex-wrap font-mono">
            <label className="space-y-0.5">
              <div className={LBL}>GLOBAL/DÍA</div>
              <input value={presGlobal} onChange={(e) => setPresGlobal(e.target.value.replace(/[^0-9]/g, ""))} className={INPUT} />
            </label>
            <label className="space-y-0.5">
              <div className={LBL}>POR USUARIO/DÍA</div>
              <input value={presUsuario} onChange={(e) => setPresUsuario(e.target.value.replace(/[^0-9]/g, ""))} className={INPUT} />
            </label>
            <button onClick={() => void guardarPresupuestos()} disabled={guardando || !presGlobal || !presUsuario} className={BTN}>
              {guardando ? "…" : "GUARDAR"}
            </button>
            {presMsg && (
              <span className={`text-[9px] ${presMsg.startsWith("guardado") ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}>
                {presMsg}
              </span>
            )}
            <div className="w-px self-stretch bg-[var(--t-border)] mx-1" />
            <div className="space-y-1 flex-1 min-w-[320px]">
              <div className={LBL}>EXCEPCIONES POR USUARIO</div>
              <div className="flex items-center gap-2 flex-wrap">
                {excepciones.map((e) => (
                  <span key={e.usuario} className="flex items-center gap-1.5 text-[10px] border border-[var(--t-border)] px-2 py-0.5">
                    {e.usuario} <span className="tabular-nums text-[var(--t-text-dim)]">{compact(e.valor)}</span>
                    <button onClick={() => void guardarExcepcion(e.usuario, null)} className="text-[var(--t-text-dim)] hover:text-[var(--t-neg)]" title="Borrar">✕</button>
                  </span>
                ))}
                <input value={excEmail} onChange={(e) => setExcEmail(e.target.value)} placeholder="email@…"
                  className="w-40 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-[10px] font-mono outline-none focus:border-[var(--t-accent)]" />
                <input value={excValor} onChange={(e) => setExcValor(e.target.value.replace(/[^0-9]/g, ""))} placeholder="tokens/día"
                  className="w-24 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-right tabular-nums text-[10px] font-mono outline-none focus:border-[var(--t-accent)]" />
                <button onClick={() => void guardarExcepcion(excEmail.trim().toLowerCase(), Number(excValor))}
                  disabled={!excEmail.includes("@") || !excValor} className={BTN}>AGREGAR</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CUERPO: agregados (2/5) + historial (3/5) ───────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-5 gap-2">
        <div className={`${CUAD} col-span-2`}>
          <div className={CUAD_TITULO}>
            {(["tarea", "dia", "proveedor"] as const).map((t) => (
              <button key={t} onClick={() => setTabTabla(t)}
                className={"px-2 py-0.5 text-[9px] font-semibold tracking-widest " +
                  (tabTabla === t ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]" : "text-[var(--t-text-muted)] hover:text-[var(--t-text)]")}>
                {t === "tarea" ? "POR TAREA" : t === "dia" ? "POR DÍA" : "POR PROVEEDOR"}
              </button>
            ))}
            <span className="ml-auto normal-case font-normal text-[var(--t-text-dim)]">
              últimos {data?.ventana_dias ?? 14} días
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {tabTabla === "tarea" && (
              <table className="w-full text-[11px] font-mono">
                <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
                  <tr className="border-b border-[var(--t-border)]">
                    <th className={TH}>TAREA</th><th className={THR}>LLAM.</th>
                    <th className={THR}>ERR</th><th className={THR}>TOKENS</th>
                    <th className={THR}>LAT.</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.por_tarea ?? []).map((r) => (
                    <tr key={r.tarea}
                      onClick={() => aplicarFiltro(() => setFTarea(r.tarea === fTarea ? "" : r.tarea))}
                      title="Filtrar el historial por esta tarea"
                      className={"border-b border-[var(--t-border-2)] cursor-pointer hover:bg-[var(--t-bg)] " +
                        (fTarea === r.tarea ? "bg-[var(--t-bg)]" : "")}>
                      <td className={TD}>{r.tarea}</td>
                      <td className={TDR}>{nf.format(r.llamadas)}</td>
                      <td className={`${TDR} ${r.errores > 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"}`}>{r.errores}</td>
                      <td className={TDR}>{compact(r.tokens)}</td>
                      <td className={`${TDR} text-[var(--t-text-dim)]`}>{r.latencia_ms_avg != null ? `${nf.format(r.latencia_ms_avg)}ms` : "—"}</td>
                    </tr>
                  ))}
                  {data && data.por_tarea.length === 0 && (
                    <tr><td className={TD} colSpan={5}>Sin llamadas en la ventana.</td></tr>
                  )}
                </tbody>
              </table>
            )}
            {tabTabla === "dia" && (
              <table className="w-full text-[11px] font-mono">
                <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
                  <tr className="border-b border-[var(--t-border)]">
                    <th className={TH}>FECHA</th><th className={THR}>LLAM.</th>
                    <th className={THR}>ERR</th><th className={THR}>IN</th>
                    <th className={THR}>OUT</th><th className={THR}>LAT.</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.por_dia ?? []).map((r) => (
                    <tr key={r.fecha} className="border-b border-[var(--t-border-2)]">
                      <td className={TD}>{r.fecha}</td>
                      <td className={TDR}>{nf.format(r.llamadas)}</td>
                      <td className={`${TDR} ${r.errores > 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"}`}>{r.errores}</td>
                      <td className={TDR}>{compact(r.tokens_in)}</td>
                      <td className={TDR}>{compact(r.tokens_out)}</td>
                      <td className={`${TDR} text-[var(--t-text-dim)]`}>{r.latencia_ms_avg != null ? `${nf.format(r.latencia_ms_avg)}ms` : "—"}</td>
                    </tr>
                  ))}
                  {data && data.por_dia.length === 0 && (
                    <tr><td className={TD} colSpan={6}>Sin llamadas en la ventana.</td></tr>
                  )}
                </tbody>
              </table>
            )}
            {tabTabla === "proveedor" && (
              <div className="p-2 space-y-2">
                {(data?.por_proveedor ?? []).map((r) => (
                  <div key={r.proveedor} className="border border-[var(--t-border)] p-2 font-mono">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] text-[var(--t-accent)] uppercase tracking-widest">{r.proveedor}</span>
                      {r.no_entrena != null && (
                        <span className={`text-[9px] ${r.no_entrena ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}>
                          {r.no_entrena ? "no entrena con nuestros datos" : "puede entrenar con lo enviado"}
                        </span>
                      )}
                      <span className="ml-auto text-[11px] tabular-nums">{compact(r.tokens)} tokens</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-[13px] tabular-nums text-[var(--t-text)]">
                        {r.costo_estimable ? fmtUsd(r.costo_usd) : "—"}
                      </span>
                      <span className="text-[9px] text-[var(--t-text-dim)]">
                        gasto estimado en la ventana
                        {r.costo_estimable && ` · hoy ${fmtUsd(r.costo_usd_hoy)}`}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--t-text-dim)] tabular-nums">
                      {nf.format(r.llamadas)} llamadas
                      {r.errores > 0 && <span className="text-[var(--t-neg)]"> · {r.errores} err</span>}
                      {r.latencia_ms_avg != null && <span> · {nf.format(r.latencia_ms_avg)} ms prom.</span>}
                    </div>
                    <div className="mt-0.5 text-[9px] text-[var(--t-text-dim)] truncate" title={r.modelos.join(" · ")}>
                      {r.modelos.join(" · ")}
                    </div>
                  </div>
                ))}
                {data && data.por_proveedor.length === 0 && (
                  <div className="text-[11px] font-mono text-[var(--t-text-dim)]">Sin llamadas en la ventana.</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── HISTORIAL DE LLAMADAS (altura completa) ──────────────── */}
        <div className={`${CUAD} col-span-3`}>
          <div className={CUAD_TITULO}>
            HISTORIAL DE LLAMADAS
            <div className="ml-auto flex items-center gap-1.5 normal-case font-normal">
              <select value={fTarea} onChange={(e) => aplicarFiltro(() => setFTarea(e.target.value))}
                className="bg-[var(--t-bg)] border border-[var(--t-border)] px-1.5 py-0.5 text-[10px] font-mono outline-none [color-scheme:dark]">
                <option value="">todas las tareas</option>
                {(data?.tareas ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={fUsuario} onChange={(e) => setFUsuario(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && aplicarFiltro(() => void 0)}
                placeholder="usuario…"
                className="w-24 bg-[var(--t-bg)] border border-[var(--t-border)] px-1.5 py-0.5 text-[10px] font-mono outline-none focus:border-[var(--t-accent)]" />
              <input value={fQ} onChange={(e) => setFQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && aplicarFiltro(() => setQAplicada(fQ))}
                placeholder="buscar en texto… ⏎"
                className="w-32 bg-[var(--t-bg)] border border-[var(--t-border)] px-1.5 py-0.5 text-[10px] font-mono outline-none focus:border-[var(--t-accent)]" />
              <button onClick={() => aplicarFiltro(() => setFError((v) => !v))}
                className={CHIP + (fError
                  ? " border-[var(--t-neg)] text-[var(--t-neg)] bg-[var(--t-neg)]/10"
                  : " border-[var(--t-border)] text-[var(--t-text-muted)] hover:text-[var(--t-text)]")}>
                SOLO ERRORES
              </button>
              {hayFiltro && (
                <button onClick={() => aplicarFiltro(() => { setFTarea(""); setFUsuario(""); setFError(false); setFQ(""); setQAplicada(""); })}
                  className={`${CHIP} border-[var(--t-border)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]`}>
                  ✕ LIMPIAR
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
                <tr className="border-b border-[var(--t-border)]">
                  <th className={TH}>TS</th><th className={TH}>TAREA</th>
                  <th className={TH}>USUARIO</th><th className={TH}>MODELO</th>
                  <th className={THR}>IN</th><th className={THR}>OUT</th>
                  <th className={THR}>MS</th><th className={TH}>EST.</th>
                </tr>
              </thead>
              <tbody>
                {(data?.ultimas ?? []).map((r) => (
                  <tr key={r.id} onClick={() => setSel(r)}
                    className={"border-b border-[var(--t-border-2)] cursor-pointer hover:bg-[var(--t-bg)] " +
                      (sel?.id === r.id ? "bg-[var(--t-bg)]" : "")}>
                    <td className={`${TD} text-[var(--t-text-dim)]`}>{fmtTs(r.ts)}</td>
                    <td className={TD}>{r.tarea}</td>
                    <td className={TD}>{r.usuario ? r.usuario.split("@")[0] : "—"}</td>
                    <td className={`${TD} text-[var(--t-text-dim)]`}>{r.modelo}</td>
                    <td className={TDR}>{r.tokens_in != null ? nf.format(r.tokens_in) : "—"}</td>
                    <td className={TDR}>{r.tokens_out != null ? nf.format(r.tokens_out) : "—"}</td>
                    <td className={`${TDR} text-[var(--t-text-dim)]`}>{r.latencia_ms != null ? nf.format(r.latencia_ms) : "—"}</td>
                    <td className={TD}>
                      {r.ok
                        ? <span className="text-[var(--t-pos)]">OK{r.feedback === 1 ? " 👍" : r.feedback === -1 ? " 👎" : ""}</span>
                        : <span className="text-[var(--t-neg)]">✗ ERROR</span>}
                    </td>
                  </tr>
                ))}
                {data && data.ultimas.length === 0 && (
                  <tr><td className={TD} colSpan={8}>
                    {hayFiltro ? "Ninguna llamada coincide con el filtro." : "Sin llamadas registradas todavía."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* paginación */}
          <div className="shrink-0 border-t border-[var(--t-border)] px-3 py-1 flex items-center gap-2 text-[10px] font-mono text-[var(--t-text-dim)]">
            <span>{nf.format(desde)}–{nf.format(hasta)} de {nf.format(total)}</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => setOffset(Math.max(0, offset - PAGINA))} disabled={offset === 0 || loading} className={BTN}>◀ ANTERIORES</button>
              <button onClick={() => setOffset(offset + PAGINA)} disabled={hasta >= total || loading} className={BTN}>SIGUIENTES ▶</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── DETALLE: drawer (no ocupa lugar si no hay nada elegido) ─── */}
      {sel && (
        <div className="absolute inset-y-2 right-2 w-[46%] max-w-[720px] z-20 flex flex-col border border-[var(--t-accent)] bg-[var(--t-panel)] shadow-2xl">
          <div className={CUAD_TITULO}>
            DETALLE
            <span className="normal-case font-normal text-[var(--t-text-dim)]">
              #{sel.id} · {fmtTs(sel.ts)} · {sel.tarea} · {sel.modelo}
            </span>
            <button onClick={() => setSel(null)} className="ml-auto text-[var(--t-text-dim)] hover:text-[var(--t-accent)] text-[14px] leading-none">✕</button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 text-[11px] font-mono">
            <div className="text-[10px] text-[var(--t-text-dim)] tabular-nums">
              {sel.usuario ?? "sistema"} · IN {sel.tokens_in != null ? nf.format(sel.tokens_in) : "—"} ·{" "}
              OUT {sel.tokens_out != null ? nf.format(sel.tokens_out) : "—"} ·{" "}
              {sel.latencia_ms != null ? `${nf.format(sel.latencia_ms)} ms` : "—"}
              {sel.feedback != null && <span> · feedback {sel.feedback === 1 ? "👍" : "👎"}</span>}
            </div>
            {sel.error && (
              <div>
                <div className="text-[9px] text-[var(--t-neg)] tracking-widest mb-1">ERROR</div>
                <div className="text-[var(--t-neg)] whitespace-pre-wrap break-words">{sel.error}</div>
              </div>
            )}
            <div>
              <div className={`${LBL} mb-1`}>PEDIDO (lo que salió al proveedor)</div>
              <div className="whitespace-pre-wrap break-words text-[var(--t-text)]">
                {sel.detalle ?? <span className="text-[var(--t-text-dim)]">—</span>}
              </div>
            </div>
            <div>
              <div className={`${LBL} mb-1`}>RESPUESTA</div>
              <div className="whitespace-pre-wrap break-words text-[var(--t-text)]">
                {sel.respuesta ?? <span className="text-[var(--t-text-dim)]">—</span>}
              </div>
            </div>
            {sel.razonamiento && (
              <div>
                <div className={`${LBL} mb-1`}>RAZONAMIENTO (interno del modelo)</div>
                <div className="whitespace-pre-wrap break-words text-[var(--t-text-dim)]">{sel.razonamiento}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
