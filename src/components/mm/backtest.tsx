"use client";

import { useState } from "react";
import {
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BacktestResponse } from "./types";

// Backtest tab: dispara un sweep multi-día contra el backend y muestra
// resultados agregados. NO hace simulación local — el backend corre N×M.
export function MMBacktest({ instrumentoFull }: { instrumentoFull: string }) {
  const [diasAtras, setDiasAtras] = useState(10);
  const [quoteSize, setQuoteSize] = useState(20_000);
  const [skewIntensity, setSkewIntensity] = useState(1.0);
  const [autoSkew, setAutoSkew] = useState(true);
  const [invCap, setInvCap] = useState(200_000);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BacktestResponse | null>(null);

  async function handleRun() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mm/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrumento: instrumentoFull,
          dias_atras: diasAtras,
          quote_size: quoteSize,
          skew_intensity: skewIntensity,
          auto_skew: autoSkew,
          inv_cap: invCap,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as BacktestResponse;
      setData(json);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  const best = data?.por_spread.length
    ? data.por_spread.reduce((b, r) => (r.sharpe > b.sharpe ? r : b))
    : null;

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3 bg-black text-[#d0d0d0]">
      {/* Form */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 px-3 py-3 bg-[#0a0a0a] border border-[#1a1a1a]">
        <div className="flex flex-col gap-1">
          <span className="text-[9px] tracking-widest text-[#666]">DÍAS ATRÁS</span>
          <select
            value={diasAtras}
            onChange={(e) => setDiasAtras(Number(e.target.value))}
            className="bg-black border border-[#2a2a2a] text-[11px] px-2 py-1 text-[#ff9900] font-mono"
          >
            <option value={5}>últimos 5</option>
            <option value={10}>últimos 10</option>
            <option value={20}>últimos 20</option>
            <option value={30}>últimos 30</option>
          </select>
        </div>
        <NumInput
          label="TAMAÑO (VN)"
          value={quoteSize}
          onChange={setQuoteSize}
          step={1_000}
          min={1_000}
          display={`${(quoteSize / 1000).toFixed(0)}k`}
        />
        <NumInput
          label="SKEW INT."
          value={skewIntensity}
          onChange={setSkewIntensity}
          step={0.1}
          min={0}
          max={3}
          display={`${skewIntensity.toFixed(1)}x`}
        />
        <div className="flex flex-col gap-1">
          <span className="text-[9px] tracking-widest text-[#666]">AUTO-SKEW</span>
          <button
            onClick={() => setAutoSkew(!autoSkew)}
            className={`text-[11px] font-mono px-2 py-1 border ${
              autoSkew
                ? "bg-[#1f8a3e]/30 border-[#1f8a3e] text-[#7fff7f]"
                : "border-[#2a2a2a] text-[#666]"
            }`}
          >
            {autoSkew ? "ON" : "OFF"}
          </button>
        </div>
        <NumInput
          label="INV CAP (VN)"
          value={invCap}
          onChange={setInvCap}
          step={10_000}
          min={10_000}
          display={`${(invCap / 1000).toFixed(0)}k`}
        />
        <div className="flex items-end">
          <button
            onClick={handleRun}
            disabled={loading}
            className="w-full px-3 py-1 text-[11px] font-semibold bg-[#ff9900] text-black hover:brightness-110 disabled:opacity-40"
          >
            {loading ? "CORRIENDO…" : "CORRER BACKTEST"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-[#2a0a0a] border border-[#ff7f7f] text-[#ff7f7f] text-[11px] px-3 py-2">
          Error: {error}
        </div>
      )}

      {!data && !loading && !error && (
        <div className="bg-[#0a0a0a] border border-[#1a1a1a] px-3 py-6 text-[#666] text-[11px] text-center">
          Apretá CORRER BACKTEST para barrer 7 spreads sobre los últimos {diasAtras}{" "}
          días con actividad. Cada combinación corre 1 sim — total = N días × 7 spreads.
        </div>
      )}

      {data && (
        <>
          {/* Header context */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-3 py-2 bg-[#0a0a0a] border border-[#1a1a1a] text-[10px]">
            <Stat label="INSTRUMENTO" value={data.instrumento_full.split(" - ")[2] ?? data.instrumento_full} />
            <Stat label="RANGO" value={`${data.desde} → ${data.hasta}`} />
            <Stat label="DÍAS C/ ACTIVIDAD" value={String(data.fechas.length)} />
            <Stat label="SPREADS" value={String(data.params.spreads.length)} />
            <Stat label="SIMULACIONES" value={String(data.por_dia.length)} />
          </div>

          {data.fechas.length === 0 ? (
            <div className="bg-[#0a0a0a] border border-[#1a1a1a] px-3 py-6 text-[#666] text-[11px] text-center">
              Sin días con actividad en el rango. Probá un rango más largo o un instrumento más líquido.
            </div>
          ) : (
            <>
              {/* Chart */}
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] p-2 h-[260px]">
                <div className="text-[9px] tracking-widest text-[#666] mb-1 px-1">
                  PnL MEDIO + SHARPE POR SPREAD
                </div>
                <div className="h-[calc(100%-1.25rem)]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.por_spread}>
                      <XAxis
                        dataKey="spread"
                        tick={{ fill: "#666", fontSize: 9 }}
                        tickFormatter={(v: number) => `${(v * 100).toFixed(0)}c`}
                      />
                      <YAxis
                        yAxisId="pnl"
                        tick={{ fill: "#666", fontSize: 9 }}
                        width={50}
                        tickFormatter={(v: number) =>
                          `$${(v / 1000).toFixed(0)}k`
                        }
                      />
                      <YAxis
                        yAxisId="sharpe"
                        orientation="right"
                        tick={{ fill: "#666", fontSize: 9 }}
                        width={30}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#0a0a0a",
                          border: "1px solid #2a2a2a",
                          fontSize: 10,
                        }}
                        formatter={(value, name) => {
                          const v = Number(value);
                          if (name === "pnl_mean") return [`$${v.toFixed(0)}`, "PnL medio"];
                          if (name === "sharpe") return [v.toFixed(2), "Sharpe"];
                          return [String(value), String(name)];
                        }}
                        labelFormatter={(v) => `Spread ${(Number(v) * 100).toFixed(0)}c`}
                      />
                      <Line
                        yAxisId="pnl"
                        dataKey="pnl_mean"
                        stroke="#ff9900"
                        strokeWidth={2}
                        dot={{ fill: "#ff9900" }}
                        isAnimationActive={false}
                      />
                      <Line
                        yAxisId="sharpe"
                        dataKey="sharpe"
                        stroke="#3fbf6f"
                        strokeWidth={1.5}
                        strokeDasharray="3 3"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabla por spread */}
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] overflow-x-auto">
                <table className="w-full text-[11px] font-mono tabular-nums">
                  <thead className="text-[#666] text-[9px] tracking-widest">
                    <tr>
                      <th className="text-left px-2 py-1">SPREAD</th>
                      <th className="text-right px-2 py-1">PnL MEDIO</th>
                      <th className="text-right px-2 py-1">PnL STD</th>
                      <th className="text-right px-2 py-1">PnL MIN</th>
                      <th className="text-right px-2 py-1">PnL MAX</th>
                      <th className="text-right px-2 py-1">WIN %</th>
                      <th className="text-right px-2 py-1">SHARPE</th>
                      <th className="text-right px-2 py-1">MAX DD</th>
                      <th className="text-right px-2 py-1">FILLS/DÍA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.por_spread.map((r) => {
                      const isBest = best && r.spread === best.spread;
                      return (
                        <tr
                          key={r.spread}
                          className={isBest ? "bg-[#1f8a3e]/25" : "border-b border-[#1a1a1a]"}
                        >
                          <td className="px-2 py-1">
                            {(r.spread * 100).toFixed(0)}c
                            {isBest && <span className="ml-1 text-[#7fff7f]">★</span>}
                          </td>
                          <td
                            className={`text-right px-2 py-1 ${
                              r.pnl_mean >= 0 ? "text-[#7fff7f]" : "text-[#ff7f7f]"
                            }`}
                          >
                            ${r.pnl_mean.toFixed(0)}
                          </td>
                          <td className="text-right px-2 py-1 text-[#888]">
                            ${r.pnl_std.toFixed(0)}
                          </td>
                          <td className="text-right px-2 py-1 text-[#ff7f7f]">
                            ${r.pnl_min.toFixed(0)}
                          </td>
                          <td className="text-right px-2 py-1 text-[#7fff7f]">
                            ${r.pnl_max.toFixed(0)}
                          </td>
                          <td
                            className={`text-right px-2 py-1 ${
                              r.win_rate >= 0.5 ? "text-[#7fff7f]" : "text-[#ff7f7f]"
                            }`}
                          >
                            {(r.win_rate * 100).toFixed(0)}%
                          </td>
                          <td className="text-right px-2 py-1 text-[#ff9900]">
                            {r.sharpe.toFixed(2)}
                          </td>
                          <td className="text-right px-2 py-1 text-[#888]">
                            ${r.max_dd_avg.toFixed(0)}
                          </td>
                          <td className="text-right px-2 py-1 text-[#888]">
                            {r.fills_avg.toFixed(0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {best && (
                <div className="bg-[#1f8a3e]/15 border border-[#1f8a3e] px-3 py-2 text-[11px] text-[#7fff7f]">
                  <strong>SWEET SPOT</strong> — spread{" "}
                  <span className="font-mono">{(best.spread * 100).toFixed(0)}c</span>: PnL medio{" "}
                  <span className="font-mono">${best.pnl_mean.toFixed(0)}</span> · sharpe{" "}
                  <span className="font-mono">{best.sharpe.toFixed(2)}</span> · win rate{" "}
                  <span className="font-mono">{(best.win_rate * 100).toFixed(0)}%</span>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[8px] tracking-widest text-[#666]">{label}</span>
      <span className="font-mono text-[#d0d0d0]">{value}</span>
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  step,
  min,
  max,
  display,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  min?: number;
  max?: number;
  display: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <span className="text-[9px] tracking-widest text-[#666]">{label}</span>
        <span className="text-[10px] font-mono text-[#ff9900]">{display}</span>
      </div>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="bg-black border border-[#2a2a2a] text-[11px] px-2 py-1 text-[#d0d0d0] font-mono"
      />
    </div>
  );
}
