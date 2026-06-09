"use client";

import { useState } from "react";

interface Flujo { fecha: string; monto: number; concepto?: string }
interface DebugResp {
  ok: boolean;
  message?: string;
  instrumento?: {
    ticker: string; ticker_corto: string; curva: string;
    fecha_vencimiento: string | null; valor_nominal: number; n_flujos: number;
  };
  trade?: { price: number; TEA_persistido: number | null };
  settlement?: { fecha_settlement: string; dias_a_vto_settle: number };
  tc_info?: Record<string, unknown> | null;
  cashflow_xirr?: Flujo[];
  calculado?: { TEA?: number; TEM?: number; duration?: number; paridad?: number };
  error_calc?: string | null;
}

const inp = "bg-[var(--t-surface-2)] border border-[var(--t-border)] px-2 py-1 text-[12px] text-[var(--t-text)]";
const fmt = (n?: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 4 }).format(n);

export function ManagerDebugTeaPanel() {
  const [ticker, setTicker] = useState("");
  const [data, setData] = useState<DebugResp | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/manager/checks/debug-curva-tea?ticker=${encodeURIComponent(t)}`);
      setData(await r.json());
    } catch (e) {
      setData({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  const i = data?.instrumento;
  const c = data?.calculado;

  return (
    <div className="h-full overflow-auto p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[var(--t-text-dim)]">Ticker corto:</span>
        <input className={inp} value={ticker} onChange={(e) => setTicker(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") run(); }} placeholder="ej: YMCWO / AL30 / TX26" />
        <button type="button" onClick={run} disabled={loading}
          className="px-3 py-1 text-[12px] font-semibold bg-[#094293] text-white disabled:opacity-50">
          {loading ? "…" : "DEBUG"}
        </button>
      </div>

      {data && !data.ok && (
        <p className="text-[12px] text-red-500">{data.message || "No se pudo calcular."}</p>
      )}

      {data?.ok && i && (
        <>
          <div className="text-[12px] flex flex-wrap gap-x-4 gap-y-1">
            <span><b>{i.ticker_corto}</b> · {i.curva}</span>
            <span className="text-[var(--t-text-dim)]">vto {i.fecha_vencimiento} · {i.n_flujos} flujos · VN {i.valor_nominal}</span>
            <span>Last <b>{fmt(data.trade?.price)}</b></span>
            <span>TEA persistida: <b className={data.trade?.TEA_persistido == null ? "text-amber-500" : "text-emerald-500"}>
              {data.trade?.TEA_persistido == null ? "— (sin TEA)" : (data.trade.TEA_persistido * 100).toFixed(2) + "%"}</b></span>
            {data.settlement && <span className="text-[var(--t-text-dim)]">settle {data.settlement.fecha_settlement} · {data.settlement.dias_a_vto_settle}d al vto</span>}
          </div>

          {data.error_calc && (
            <div className="text-[12px] text-amber-500 border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 rounded">
              ⚠ <b>Por qué no hay TEA:</b> {data.error_calc}
            </div>
          )}

          {data.tc_info && (
            <div className="text-[11px] text-[var(--t-text-dim)]">
              precio usado: {JSON.stringify(data.tc_info)}
            </div>
          )}

          {/* Cashflow del XIRR — acá se ve la escala precio vs flujos */}
          {!!data.cashflow_xirr?.length && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)] mb-1">Cashflow del XIRR (precio negativo + flujos)</div>
              <div className="max-h-72 overflow-auto border border-[var(--t-border)]">
                <table>
                  <thead><tr><th>Fecha</th><th className="text-right">Monto</th><th>Concepto</th></tr></thead>
                  <tbody>
                    {data.cashflow_xirr.map((f, k) => (
                      <tr key={k}>
                        <td className="tabular-nums">{f.fecha}</td>
                        <td className={"text-right tabular-nums " + (f.monto < 0 ? "text-red-500 font-semibold" : "")}>{fmt(f.monto)}</td>
                        <td className="text-[var(--t-text-dim)]">{f.concepto}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {c && (c.TEA != null || c.paridad != null) && (
            <div className="text-[12px] flex flex-wrap gap-x-4">
              {c.TEA != null && <span>TEA recalc: <b className="text-emerald-500">{(c.TEA * 100).toFixed(2)}%</b></span>}
              {c.duration != null && <span>Dur: <b>{c.duration.toFixed(2)}</b></span>}
              {c.paridad != null && <span>Paridad: <b>{fmt(c.paridad)}</b></span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
