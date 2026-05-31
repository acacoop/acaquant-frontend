"use client";

import { useState } from "react";

/**
 * Vista ESTRATEGIA — Módulo 1 de la Mesa de Estrategia (Renta Variable).
 *
 * Metés un trade (ticker + monto + dirección) y devuelve la caracterización
 * de riesgo + el hedge-finder. Consume GET /api/scanner/trade-analysis.
 * Spec: docs/wip_mesa_estrategia_rv.md (repo TradingAV).
 */

interface TradeAnalysis {
  trade: { ticker: string; monto: number; direccion: string };
  caracterizacion: {
    last: number | null;
    vol_anual: { d30: number | null; d60: number | null };
    beta: { spy: number | null; qqq: number | null };
    zscore: { d30: number | null; d60: number | null };
    var_1d_95: number | null;
    var_1d_95_pct: number | null;
    peor_mes_1sigma: number | null;
    exposicion_mercado_equiv: { spy: number | null; qqq: number | null };
  };
  hedge_beta: {
    benchmark: string;
    beta: number;
    accion: string;
    notional: number;
  }[];
  hedge_finder: {
    ticker: string;
    correlacion: number;
    hedge_ratio: number | null;
    notional_hedge: number | null;
    accion: string;
    reduccion_vol_pct: number;
  }[];
  nota: string;
}

const fmtUsd = (n: number | null | undefined): string =>
  n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US");

const fmtFracPct = (n: number | null | undefined): string =>
  n == null ? "—" : (n * 100).toFixed(1) + "%";

function Metric({ label, value, hint }: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] px-2 py-1.5">
      <div className="text-[8px] text-[var(--t-text-muted)] uppercase tracking-wide">{label}</div>
      <div className="text-[13px] font-mono text-[var(--t-text)]">{value}</div>
      {hint && <div className="text-[8px] text-[var(--t-text-muted)]">{hint}</div>}
    </div>
  );
}

export function EstrategiaView() {
  const [ticker, setTicker] = useState("");
  const [monto, setMonto] = useState("1000000");
  const [direccion, setDireccion] = useState<"long" | "short">("long");
  const [data, setData] = useState<TradeAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analizar = () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError(null);
    const m = Number(monto) || 0;
    const qs = `ticker=${encodeURIComponent(ticker.trim())}&monto=${m}&direccion=${direccion}`;
    fetch(`/api/scanner/trade-analysis?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => setData(j as TradeAnalysis))
      .catch((e) => {
        setData(null);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  };

  const c = data?.caracterizacion;

  return (
    <div className="h-full min-h-0 overflow-y-auto p-3 flex flex-col gap-3 text-[10px]">
      {/* Form */}
      <div className="flex items-end gap-2 flex-wrap">
        <div>
          <div className="text-[8px] text-[var(--t-text-muted)] uppercase mb-0.5">Ticker</div>
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") analizar(); }}
            placeholder="IBIT"
            className="w-28 bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-1 text-[11px] text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
          />
        </div>
        <div>
          <div className="text-[8px] text-[var(--t-text-muted)] uppercase mb-0.5">Monto USD</div>
          <input
            value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") analizar(); }}
            className="w-32 bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-1 text-[11px] text-[var(--t-text)] font-mono focus:border-[var(--t-accent)] focus:outline-none"
          />
        </div>
        <div className="flex gap-1">
          {(["long", "short"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDireccion(d)}
              className={`px-2 py-1 text-[10px] font-semibold border transition-colors ${
                direccion === d
                  ? d === "long"
                    ? "bg-[#00cc66] text-black border-[#00cc66]"
                    : "bg-[#ff3333] text-black border-[#ff3333]"
                  : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)]"
              }`}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </div>
        <button
          onClick={analizar}
          disabled={loading || !ticker.trim()}
          className="px-3 py-1 text-[10px] font-semibold border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors disabled:opacity-40"
        >
          {loading ? "Analizando…" : "▶ Analizar"}
        </button>
      </div>

      {error && <div className="text-[var(--t-neg)] italic">{error}</div>}
      {!data && !error && (
        <p className="text-[var(--t-text-muted)] py-4">Meté un ticker y el monto del trade.</p>
      )}

      {data && c && (
        <>
          {/* Caracterización */}
          <div>
            <div className="text-[9px] text-[var(--t-accent)] tracking-widest mb-1">
              CARACTERIZACIÓN — {data.trade.ticker} · {data.trade.direccion.toUpperCase()} · {fmtUsd(data.trade.monto)}
            </div>
            <div className="grid grid-cols-4 md:grid-cols-7 gap-1">
              <Metric label="Último" value={c.last != null ? c.last.toFixed(2) : "—"} />
              <Metric label="Vol 60d" value={fmtFracPct(c.vol_anual.d60)} />
              <Metric label="Beta SPY" value={c.beta.spy != null ? c.beta.spy.toFixed(2) : "—"} />
              <Metric label="Beta QQQ" value={c.beta.qqq != null ? c.beta.qqq.toFixed(2) : "—"} />
              <Metric
                label="VaR 1d 95%"
                value={fmtUsd(c.var_1d_95)}
                hint={c.var_1d_95_pct != null ? `${c.var_1d_95_pct}%` : undefined}
              />
              <Metric label="Peor mes 1σ" value={fmtUsd(c.peor_mes_1sigma)} />
              <Metric
                label="Expo. mercado eq."
                value={fmtUsd(c.exposicion_mercado_equiv.qqq)}
                hint="vs QQQ"
              />
            </div>
          </div>

          {/* Hedge por beta */}
          {data.hedge_beta.length > 0 && (
            <div>
              <div className="text-[9px] text-[var(--t-accent)] tracking-widest mb-1">
                HEDGE POR BETA — neutralizar el mercado
              </div>
              <div className="flex gap-2 flex-wrap font-mono">
                {data.hedge_beta.map((h) => (
                  <div key={h.benchmark} className="border border-[var(--t-border)] bg-[var(--t-panel)] px-2 py-1.5">
                    <span className="text-[var(--t-text)] font-semibold">
                      {h.accion.toUpperCase()} {fmtUsd(h.notional)} {h.benchmark}
                    </span>
                    <span className="text-[var(--t-text-muted)]"> · β {h.beta}</span>
                  </div>
                ))}
              </div>
              <div className="text-[8px] text-[var(--t-text-muted)] mt-0.5">
                Saca el riesgo de mercado; queda la apuesta idiosincrática (el residual).
              </div>
            </div>
          )}

          {/* Hedge-finder */}
          {data.hedge_finder.length > 0 && (
            <div>
              <div className="text-[9px] text-[var(--t-accent)] tracking-widest mb-1">
                HEDGE-FINDER — universo rankeado por correlación
              </div>
              <table className="w-full font-mono">
                <thead className="text-[var(--t-text-muted)] text-[8px]">
                  <tr>
                    <th className="text-left px-1">TICKER</th>
                    <th className="text-right px-1">CORRELACIÓN</th>
                    <th className="text-center px-1">ACCIÓN</th>
                    <th className="text-right px-1">HEDGE RATIO</th>
                    <th className="text-right px-1">NOTIONAL</th>
                    <th className="text-right px-1">REDUC. VOL</th>
                  </tr>
                </thead>
                <tbody>
                  {data.hedge_finder.slice(0, 15).map((h) => (
                    <tr key={h.ticker} className="border-b border-[var(--t-border)]">
                      <td className="text-[var(--t-accent)] px-1">{h.ticker}</td>
                      <td className={`text-right px-1 ${h.correlacion < 0 ? "text-[var(--t-pos)]" : "text-[var(--t-text)]"}`}>
                        {h.correlacion.toFixed(2)}
                      </td>
                      <td className="text-center px-1">
                        <span className={h.accion === "short" ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]"}>
                          {h.accion.toUpperCase()}
                        </span>
                      </td>
                      <td className="text-right px-1 text-[var(--t-text)]">{h.hedge_ratio ?? "—"}</td>
                      <td className="text-right px-1 text-[var(--t-text)]">{fmtUsd(h.notional_hedge)}</td>
                      <td className="text-right px-1 text-[var(--t-text)]">{h.reduccion_vol_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-[8px] text-[var(--t-text-muted)] mt-1">
                Correlación negativa (verde) = cubrís longueando ese activo. Positiva = cubrís
                shorteando. Hedge ratio = ratio de mínima varianza.
              </div>
            </div>
          )}

          <div className="text-[8px] text-[var(--t-text-muted)] italic">{data.nota}</div>
        </>
      )}
    </div>
  );
}
