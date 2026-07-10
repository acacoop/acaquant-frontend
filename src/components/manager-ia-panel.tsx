"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * OBSERVABILIDAD → IA — trazas del gateway de IA (core/ai.py, QuantAI Fase 0).
 *
 * Lee GET /api/ia/observabilidad (gate: módulo `ia`): resumen de HOY con % del
 * presupuesto diario de tokens, agregado por tarea, serie por día y últimas
 * llamadas. Es el "job_runs" de la IA: acá se ve qué tarea gasta, cuánto tarda
 * y qué falló — la base del loop de mejora (docs/QUANTAI.md).
 */

interface TrazaRow {
  ts: string;
  tarea: string;
  modelo: string;
  usuario: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  latencia_ms: number | null;
  ok: boolean;
  error: string | null;
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
const SECTION = "text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest px-3 pt-3 pb-1";

export function IaPanel() {
  const [data, setData] = useState<ObsResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ia/observabilidad", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as ObsResp);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Mismo patrón que ControlesPanel: carga inicial al montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const hoy = data?.hoy;

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden">
      {/* Header: resumen de HOY + presupuesto */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 flex-wrap">
        <span className="text-[9px] font-semibold text-[var(--t-text-muted)] tracking-widest">IA · HOY</span>
        {hoy && (
          <span className="text-[10px] font-mono text-[var(--t-text-dim)]">
            {nf.format(hoy.llamadas)} llamadas
            {hoy.errores > 0 && (
              <span className="text-[var(--t-neg)]"> · {nf.format(hoy.errores)} con error</span>
            )}
            {" · "}
            {nf.format(hoy.tokens_total)} tokens ({nf.format(hoy.tokens_in)} in / {nf.format(hoy.tokens_out)} out)
            {hoy.presupuesto_pct != null && (
              <>
                {" · presupuesto "}
                <span className={hoy.presupuesto_pct >= 80 ? "text-[var(--t-neg)] font-bold" : ""}>
                  {hoy.presupuesto_pct}%
                </span>{" "}
                de {nf.format(hoy.presupuesto_dia)}
              </>
            )}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {err && <span className="text-[10px] font-mono text-[var(--t-neg)]">{err}</span>}
          <button
            onClick={() => void cargar()}
            disabled={loading}
            className="px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] disabled:opacity-40 transition-colors"
          >
            {loading ? "CARGANDO…" : "↻ REFRESCAR"}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Por tarea */}
        <div className={SECTION}>POR TAREA (últimos {data?.ventana_dias ?? 14} días)</div>
        <div className="px-3 overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
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
        </div>

        {/* Por día */}
        <div className={SECTION}>POR DÍA</div>
        <div className="px-3 overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
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
        </div>

        {/* Últimas llamadas */}
        <div className={SECTION}>ÚLTIMAS LLAMADAS</div>
        <div className="px-3 pb-3 overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="border-b border-[var(--t-border)]">
                <th className={TH}>TS</th>
                <th className={TH}>TAREA</th>
                <th className={TH}>MODELO</th>
                <th className={TH}>USUARIO</th>
                <th className={THR}>IN</th>
                <th className={THR}>OUT</th>
                <th className={THR}>MS</th>
                <th className={TH}>ESTADO</th>
              </tr>
            </thead>
            <tbody>
              {(data?.ultimas ?? []).map((r, i) => (
                <tr key={`${r.ts}-${i}`} className="border-b border-[var(--t-border-2)]">
                  <td className={TD}>{fmtTs(r.ts)}</td>
                  <td className={TD}>{r.tarea}</td>
                  <td className={TD}>{r.modelo}</td>
                  <td className={TD}>{r.usuario ?? "—"}</td>
                  <td className={TDR}>{r.tokens_in != null ? nf.format(r.tokens_in) : "—"}</td>
                  <td className={TDR}>{r.tokens_out != null ? nf.format(r.tokens_out) : "—"}</td>
                  <td className={TDR}>{r.latencia_ms != null ? nf.format(r.latencia_ms) : "—"}</td>
                  <td className={TD}>
                    {r.ok ? (
                      <span className="text-[var(--t-pos)]">OK</span>
                    ) : (
                      <span className="text-[var(--t-neg)]" title={r.error ?? undefined}>
                        ✗ {r.error ? r.error.slice(0, 60) : "error"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {data && data.ultimas.length === 0 && (
                <tr><td className={TD} colSpan={8}>Sin llamadas registradas todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
