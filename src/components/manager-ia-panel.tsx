"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * OBSERVABILIDAD → IA — trazas del gateway de IA (core/ai.py, QuantAI Fase 0).
 *
 * Layout (pedido del user 2026-07-11): izquierda 70/30, derecha 50/50.
 *   ┌─ PRESUPUESTO DIARIO (70%) ──────┬─ ÚLTIMAS LLAMADAS (click) ─┐
 *   ├─ POR TAREA / POR DÍA (30%) ─────┼─ DETALLE de la elegida ────┤
 *
 * Lee GET /api/ia/observabilidad + /presupuesto + /saldo. El detalle por
 * llamada (pedido/respuesta/error) sale de ia.trazas (detalle/respuesta).
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
  fecha: string;
  llamadas: number;
  errores: number;
  tokens_in: number;
  tokens_out: number;
  latencia_ms_avg: number | null;
}

interface PorTareaRow {
  tarea: string;
  llamadas: number;
  errores: number;
  tokens: number;
  latencia_ms_avg: number | null;
  ultima: string;
}

interface ObsResp {
  hoy: {
    llamadas: number;
    errores: number;
    tokens_in: number;
    tokens_out: number;
    tokens_total: number;
    presupuesto_dia: number;
    presupuesto_pct: number | null;
  };
  por_dia: PorDiaRow[];
  por_tarea: PorTareaRow[];
  ultimas: TrazaRow[];
  ventana_dias: number;
}

interface PresupuestosResp {
  global_dia: number;
  usuario_dia: number;
  excepciones: { usuario: string; valor: number }[];
  editado: { por: string | null; cuando: string } | null;
}

interface SaldoResp {
  disponible: boolean | null;
  saldos: { moneda: string | null; total: string | null; otorgado: string | null; cargado: string | null }[];
}

const nf = new Intl.NumberFormat("es-AR");

function fmtTs(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-AR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}

const TH = "px-2 py-1 text-left text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest whitespace-nowrap";
const THR = `${TH} text-right`;
const TD = "px-2 py-0.5 whitespace-nowrap";
const TDR = `${TD} text-right tabular-nums`;
const CUAD = "border border-[var(--t-border)] bg-[var(--t-panel)] min-h-0 flex flex-col overflow-hidden";
const CUAD_TITULO = "px-3 py-1.5 border-b border-[var(--t-border)] text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest shrink-0 flex items-center gap-2";
const LBL = "text-[9px] text-[var(--t-text-muted)] tracking-widest";
const INPUT = "w-28 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-right tabular-nums text-[11px] font-mono outline-none focus:border-[var(--t-accent)]";
const BTN = "px-2 py-1 text-[9px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40 transition-colors";

export function IaPanel() {
  const [data, setData] = useState<ObsResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tabTabla, setTabTabla] = useState<"tarea" | "dia">("tarea");
  const [sel, setSel] = useState<TrazaRow | null>(null);
  // Presupuestos (ia.config, editable solo admin)
  const [presGlobal, setPresGlobal] = useState("");
  const [presUsuario, setPresUsuario] = useState("");
  const [presEditado, setPresEditado] = useState<PresupuestosResp["editado"]>(null);
  const [presMsg, setPresMsg] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [saldo, setSaldo] = useState<SaldoResp | null>(null);
  const [excepciones, setExcepciones] = useState<PresupuestosResp["excepciones"]>([]);
  const [excEmail, setExcEmail] = useState("");
  const [excValor, setExcValor] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ia/observabilidad", { cache: "no-store" });
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
      if (rs.ok) setSaldo((await rs.json()) as SaldoResp);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, []);

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
      if (res.status === 403) {
        setPresMsg("solo admin");
      } else if (!res.ok) {
        setPresMsg(typeof j?.detail === "string" ? j.detail : `HTTP ${res.status}`);
      } else {
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
      if (res.status === 403) {
        setPresMsg("solo admin");
      } else if (!res.ok) {
        setPresMsg(typeof j?.detail === "string" ? j.detail : `HTTP ${res.status}`);
      } else {
        setExcepciones((j as PresupuestosResp).excepciones ?? []);
        setExcEmail("");
        setExcValor("");
        setPresMsg("guardado ✓");
      }
    } catch (e) {
      setPresMsg(e instanceof Error ? e.message : "error");
    }
  }, []);

  useEffect(() => {
    // Mismo patrón que ControlesPanel: carga inicial al montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const hoy = data?.hoy;

  return (
    <div className="h-full min-h-0 p-2 grid grid-cols-2 gap-2">
      {/* ── Columna IZQUIERDA: presupuesto (70%) + tablas (30%) ── */}
      <div className="min-h-0 grid grid-rows-[7fr_3fr] gap-2">
        <div className={CUAD}>
          <div className={CUAD_TITULO}>
            PRESUPUESTO DIARIO
            <div className="ml-auto flex items-center gap-2">
              {err && <span className="text-[9px] font-mono text-[var(--t-neg)] normal-case">{err}</span>}
              <button onClick={() => void cargar()} disabled={loading} className={BTN}>
                {loading ? "…" : "↻ REFRESCAR"}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono">
            {/* Límites en una sola línea */}
            <div className="flex items-end gap-3 flex-wrap">
              <label className="space-y-0.5">
                <div className={LBL}>GLOBAL</div>
                <input value={presGlobal} onChange={(e) => setPresGlobal(e.target.value.replace(/[^0-9]/g, ""))} className={INPUT} />
              </label>
              <label className="space-y-0.5">
                <div className={LBL}>POR USUARIO</div>
                <input value={presUsuario} onChange={(e) => setPresUsuario(e.target.value.replace(/[^0-9]/g, ""))} className={INPUT} />
              </label>
              <button
                onClick={() => void guardarPresupuestos()}
                disabled={guardando || !presGlobal || !presUsuario}
                className={BTN}
              >
                {guardando ? "…" : "GUARDAR"}
              </button>
              {presMsg && (
                <span className={`text-[9px] ${presMsg.startsWith("guardado") ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}>
                  {presMsg}
                </span>
              )}
              {presEditado && (
                <span className="text-[9px] text-[var(--t-text-dim)] ml-auto">
                  {presEditado.por ?? "—"} · {fmtTs(presEditado.cuando)}
                </span>
              )}
            </div>

            {/* Excepciones */}
            <div className="space-y-1">
              <div className={LBL}>EXCEPCIONES POR USUARIO</div>
              <div className="flex items-center gap-3 flex-wrap">
                {excepciones.map((e) => (
                  <span key={e.usuario} className="flex items-center gap-1.5 text-[10px] border border-[var(--t-border)] px-2 py-0.5">
                    {e.usuario} <span className="tabular-nums text-[var(--t-text-dim)]">{nf.format(e.valor)}</span>
                    <button
                      onClick={() => void guardarExcepcion(e.usuario, null)}
                      className="text-[var(--t-text-dim)] hover:text-[var(--t-neg)]"
                      title="Borrar"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  value={excEmail}
                  onChange={(e) => setExcEmail(e.target.value)}
                  placeholder="email@…"
                  className="w-44 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-[10px] font-mono outline-none focus:border-[var(--t-accent)]"
                />
                <input
                  value={excValor}
                  onChange={(e) => setExcValor(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="tokens/día"
                  className="w-24 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-right tabular-nums text-[10px] font-mono outline-none focus:border-[var(--t-accent)]"
                />
                <button
                  onClick={() => void guardarExcepcion(excEmail.trim().toLowerCase(), Number(excValor))}
                  disabled={!excEmail.includes("@") || !excValor}
                  className={BTN}
                >
                  AGREGAR
                </button>
              </div>
            </div>

            {/* Usado hoy + saldo, lado a lado */}
            <div className="grid grid-cols-2 gap-3 border-t border-[var(--t-border)] pt-3">
              <div className="space-y-0.5">
                <div className={LBL}>USADO HOY</div>
                {hoy ? (
                  <>
                    <div className="text-[13px] tabular-nums">
                      {nf.format(hoy.tokens_total)}
                      {hoy.presupuesto_pct != null && (
                        <span className={`ml-2 text-[10px] ${hoy.presupuesto_pct >= 80 ? "text-[var(--t-neg)] font-bold" : "text-[var(--t-text-dim)]"}`}>
                          {hoy.presupuesto_pct}%
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--t-text-dim)] tabular-nums">
                      IN {nf.format(hoy.tokens_in)} · OUT {nf.format(hoy.tokens_out)} · {nf.format(hoy.llamadas)} llamadas
                      {hoy.errores > 0 && <span className="text-[var(--t-neg)]"> · {nf.format(hoy.errores)} err</span>}
                    </div>
                  </>
                ) : (
                  <div className="text-[10px] text-[var(--t-text-dim)]">—</div>
                )}
              </div>
              <div className="space-y-0.5">
                <div className={LBL}>SALDO DEEPSEEK</div>
                {saldo && saldo.saldos.length > 0 ? (
                  <>
                    {saldo.saldos.map((s, i) => (
                      <div key={i} className="text-[13px] tabular-nums">
                        {s.moneda} {s.total ?? "—"}
                        <span className="ml-2 text-[10px] text-[var(--t-text-dim)]">
                          cargado {s.cargado ?? "—"} · otorgado {s.otorgado ?? "—"}
                        </span>
                      </div>
                    ))}
                    {saldo.disponible != null && (
                      <div className={`text-[10px] ${saldo.disponible ? "text-[var(--t-pos)]" : "text-[var(--t-neg)] font-bold"}`}>
                        {saldo.disponible ? "● alcanza para operar" : "● SALDO INSUFICIENTE"}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-[10px] text-[var(--t-text-dim)]">sin dato</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tablas por tarea / por día */}
        <div className={CUAD}>
          <div className={CUAD_TITULO}>
            {(["tarea", "dia"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTabTabla(t)}
                className={
                  "px-2 py-0.5 text-[9px] font-semibold tracking-widest rounded-sm " +
                  (tabTabla === t
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                    : "text-[var(--t-text-muted)] hover:text-[var(--t-text)]")
                }
              >
                {t === "tarea" ? "POR TAREA" : "POR DÍA"}
              </button>
            ))}
            <span className="ml-auto normal-case font-normal text-[var(--t-text-dim)]">últimos {data?.ventana_dias ?? 14} días</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {tabTabla === "tarea" ? (
              <table className="w-full text-[11px] font-mono">
                <thead className="sticky top-0 bg-[var(--t-panel)]">
                  <tr className="border-b border-[var(--t-border)]">
                    <th className={TH}>TAREA</th>
                    <th className={THR}>LLAMADAS</th>
                    <th className={THR}>ERRORES</th>
                    <th className={THR}>TOKENS</th>
                    <th className={THR}>LAT. PROM.</th>
                    <th className={TH}>ÚLTIMA</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.por_tarea ?? []).map((r) => (
                    <tr key={r.tarea} className="border-b border-[var(--t-border-2)]">
                      <td className={TD}>{r.tarea}</td>
                      <td className={TDR}>{nf.format(r.llamadas)}</td>
                      <td className={`${TDR} ${r.errores > 0 ? "text-[var(--t-neg)]" : ""}`}>{nf.format(r.errores)}</td>
                      <td className={TDR}>{nf.format(r.tokens)}</td>
                      <td className={TDR}>{r.latencia_ms_avg != null ? `${nf.format(r.latencia_ms_avg)} ms` : "—"}</td>
                      <td className={TD}>{fmtTs(r.ultima)}</td>
                    </tr>
                  ))}
                  {data && data.por_tarea.length === 0 && (
                    <tr><td className={TD} colSpan={6}>Sin llamadas en la ventana.</td></tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-[11px] font-mono">
                <thead className="sticky top-0 bg-[var(--t-panel)]">
                  <tr className="border-b border-[var(--t-border)]">
                    <th className={TH}>FECHA</th>
                    <th className={THR}>LLAMADAS</th>
                    <th className={THR}>ERRORES</th>
                    <th className={THR}>TOKENS IN</th>
                    <th className={THR}>TOKENS OUT</th>
                    <th className={THR}>LAT. PROM.</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.por_dia ?? []).map((r) => (
                    <tr key={r.fecha} className="border-b border-[var(--t-border-2)]">
                      <td className={TD}>{r.fecha}</td>
                      <td className={TDR}>{nf.format(r.llamadas)}</td>
                      <td className={`${TDR} ${r.errores > 0 ? "text-[var(--t-neg)]" : ""}`}>{nf.format(r.errores)}</td>
                      <td className={TDR}>{nf.format(r.tokens_in)}</td>
                      <td className={TDR}>{nf.format(r.tokens_out)}</td>
                      <td className={TDR}>{r.latencia_ms_avg != null ? `${nf.format(r.latencia_ms_avg)} ms` : "—"}</td>
                    </tr>
                  ))}
                  {data && data.por_dia.length === 0 && (
                    <tr><td className={TD} colSpan={6}>Sin llamadas en la ventana.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Columna DERECHA: últimas llamadas + detalle ── */}
      <div className="min-h-0 grid grid-rows-2 gap-2">
        <div className={CUAD}>
          <div className={CUAD_TITULO}>ÚLTIMAS LLAMADAS</div>
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[11px] font-mono">
              <thead className="sticky top-0 bg-[var(--t-panel)]">
                <tr className="border-b border-[var(--t-border)]">
                  <th className={TH}>TS</th>
                  <th className={TH}>TAREA</th>
                  <th className={TH}>USUARIO</th>
                  <th className={THR}>IN</th>
                  <th className={THR}>OUT</th>
                  <th className={THR}>MS</th>
                  <th className={TH}>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {(data?.ultimas ?? []).map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSel(r)}
                    className={
                      "border-b border-[var(--t-border-2)] cursor-pointer hover:bg-[var(--t-bg)] " +
                      (sel?.id === r.id ? "bg-[var(--t-bg)]" : "")
                    }
                  >
                    <td className={TD}>{fmtTs(r.ts)}</td>
                    <td className={TD}>{r.tarea}</td>
                    <td className={TD}>{r.usuario ? r.usuario.split("@")[0] : "—"}</td>
                    <td className={TDR}>{r.tokens_in != null ? nf.format(r.tokens_in) : "—"}</td>
                    <td className={TDR}>{r.tokens_out != null ? nf.format(r.tokens_out) : "—"}</td>
                    <td className={TDR}>{r.latencia_ms != null ? nf.format(r.latencia_ms) : "—"}</td>
                    <td className={TD}>
                      {r.ok ? (
                        <span className="text-[var(--t-pos)]">OK{r.feedback === 1 ? " 👍" : r.feedback === -1 ? " 👎" : ""}</span>
                      ) : (
                        <span className="text-[var(--t-neg)]">✗</span>
                      )}
                    </td>
                  </tr>
                ))}
                {data && data.ultimas.length === 0 && (
                  <tr><td className={TD} colSpan={7}>Sin llamadas registradas todavía.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={CUAD}>
          <div className={CUAD_TITULO}>
            DETALLE DE LA LLAMADA
            {sel && (
              <span className="normal-case font-normal text-[var(--t-text-dim)] ml-2">
                #{sel.id} · {fmtTs(sel.ts)} · {sel.tarea} · {sel.modelo}
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 text-[11px] font-mono">
            {!sel ? (
              <div className="text-[var(--t-text-dim)]">Elegí una llamada de la tabla de arriba.</div>
            ) : (
              <>
                <div className="text-[10px] text-[var(--t-text-dim)] tabular-nums">
                  {sel.usuario ?? "sistema"} · IN {sel.tokens_in != null ? nf.format(sel.tokens_in) : "—"} ·
                  {" "}OUT {sel.tokens_out != null ? nf.format(sel.tokens_out) : "—"} ·
                  {" "}{sel.latencia_ms != null ? `${nf.format(sel.latencia_ms)} ms` : "—"}
                  {sel.feedback != null && <span> · feedback {sel.feedback === 1 ? "👍" : "👎"}</span>}
                </div>
                {sel.error && (
                  <div>
                    <div className="text-[9px] text-[var(--t-neg)] tracking-widest mb-1">ERROR</div>
                    <div className="text-[var(--t-neg)] whitespace-pre-wrap">{sel.error}</div>
                  </div>
                )}
                <div>
                  <div className={`${LBL} mb-1`}>PEDIDO</div>
                  <div className="whitespace-pre-wrap text-[var(--t-text)]">
                    {sel.detalle ?? <span className="text-[var(--t-text-dim)]">—</span>}
                  </div>
                </div>
                <div>
                  <div className={`${LBL} mb-1`}>RESPUESTA</div>
                  <div className="whitespace-pre-wrap text-[var(--t-text)]">
                    {sel.respuesta ?? <span className="text-[var(--t-text-dim)]">—</span>}
                  </div>
                </div>
                {sel.razonamiento && (
                  <div>
                    <div className={`${LBL} mb-1`}>RAZONAMIENTO (interno del modelo)</div>
                    <div className="whitespace-pre-wrap text-[var(--t-text-dim)]">{sel.razonamiento}</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
