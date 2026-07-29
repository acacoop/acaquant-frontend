"use client";

import { useCallback, useEffect, useState } from "react";

// ESTRATEGIA QUANT — tab ESTRATEGIA de /trading (doc backend: docs/ESTRATEGIA_QUANT.md).
// UNA señal por ticker (score -100..+100, 4 factores deterministas) + trazabilidad:
// el motor (engines/estrategia.py) emite al ledger y el resolver mide cada señal
// a 15/30/60'. Acá NO se calcula nada — se muestra lo que el backend registró.
//   Zona LIVE          → GET /api/estrategia/live (poll 10s) — última evaluación por ticker.
//   Zona TRACK-RECORD  → GET /api/estrategia/track-record + /senales (poll 60s).

interface Factores {
  recorrido_indice: number | null;
  alineacion: number | null;
  nafta_papel: number | null;
  confluencia: number | null;
}
interface EvalLive {
  ticker: string;
  ts: string | null;
  score: number;
  direccion: "LONG" | "SHORT" | "NEUTRO";
  cobertura: number;
  factores: Factores;
  indice_ref: string;
  precio: number | null;
  pesos_version: string;
  inputs?: Record<string, unknown>;
}
interface HorizonteStats {
  n: number;
  hit_rate: number | null;
  expectativa_pct: number | null;
  mfe_prom: number | null;
  mae_prom: number | null;
  equity: { ts: string | null; acum_pct: number }[];
}
interface EdgeFactor {
  n_favor: number;
  n_contra: number;
  exp_favor: number | null;
  exp_contra: number | null;
}
interface TrackRecord {
  dias: number;
  n_total: number;
  n_parciales: number;
  muestra_suficiente: boolean;
  n_minimo: number;
  horizontes: Record<string, HorizonteStats>;
  edge_factores: Record<string, EdgeFactor>;
  horizonte_edge: number | null;
}
interface SenalRow {
  id: number;
  ts: string | null;
  ticker: string;
  indice_ref: string;
  direccion: "LONG" | "SHORT";
  score: number;
  precio: number | null;
  pesos_version: string;
  factores: Factores;
  horizonte_min: number;
  ret_pct: number | null;
  mfe_pct: number | null;
  mae_pct: number | null;
  toco_objetivo: boolean | null;
  gano: boolean | null;
  parcial: boolean;
}

const FACTOR_LABELS: [keyof Factores, string, string][] = [
  ["recorrido_indice", "RECORRIDO ÍNDICE", "nafta del índice de referencia (pivots + rango del día)"],
  ["alineacion", "ALINEACIÓN", "índice confirma o diverge del papel (× correlación)"],
  ["nafta_papel", "NAFTA PAPEL", "rango de hoy vs su costumbre de 20 ruedas"],
  ["confluencia", "CONFLUENCIA", "pisos/techos multi-timeframe del subyacente USD"],
];

const fmtHora = (ts: string | null) =>
  ts ? new Date(ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "—";
const fmtNum = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? "—" : v.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

function scoreClase(score: number): { txt: string; cls: string } {
  if (score >= 40) return { txt: "LONG", cls: "text-emerald-400 border-emerald-500/60 bg-emerald-500/10" };
  if (score <= -40) return { txt: "SHORT", cls: "text-red-400 border-red-500/60 bg-red-500/10" };
  return { txt: "NEUTRO", cls: "text-[var(--t-text-dim)] border-[var(--t-border-2)] bg-transparent" };
}

export function EstrategiaView() {
  const [live, setLive] = useState<EvalLive[]>([]);
  const [track, setTrack] = useState<TrackRecord | null>(null);
  const [senales, setSenales] = useState<SenalRow[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const cargarLive = useCallback(async () => {
    try {
      const r = await fetch("/api/estrategia/live");
      if (!r.ok) throw new Error(`live ${r.status}`);
      setLive(await r.json());
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    }
  }, []);

  const cargarTrack = useCallback(async () => {
    try {
      const [rt, rs] = await Promise.all([
        fetch("/api/estrategia/track-record?dias=90"),
        fetch("/api/estrategia/senales?dias=30&limite=100"),
      ]);
      if (rt.ok) setTrack(await rt.json());
      if (rs.ok) setSenales(await rs.json());
    } catch {
      /* el poll siguiente reintenta */
    }
  }, []);

  useEffect(() => {
    cargarLive();
    cargarTrack();
    const a = setInterval(cargarLive, 10_000);
    const b = setInterval(cargarTrack, 60_000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [cargarLive, cargarTrack]);

  const detalle = live.find((e) => e.ticker === sel) ?? live[0] ?? null;

  return (
    <div className="h-full overflow-y-auto font-mono text-[var(--t-text)] p-3 space-y-4">
      {/* ── Zona LIVE ─────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[12px] font-bold tracking-widest text-[var(--t-accent)]">SEÑAL LIVE</h2>
          <span className="text-[10px] text-[var(--t-text-dim)]">
            score = Σ pesos·factores · umbral ±40 · motor cada 60s
            {err && <span className="text-red-400 ml-2">({err})</span>}
          </span>
        </div>
        {live.length === 0 ? (
          <div className="text-[11px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] p-4">
            Sin evaluaciones — el motor corre L-V durante la rueda (13:20–20:05 UTC).
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
            {/* tabla del universo */}
            <div className="border border-[var(--t-border-2)] overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[10px] text-[var(--t-text-dim)] border-b border-[var(--t-border-2)]">
                    <th className="px-2 py-1">TICKER</th>
                    <th className="px-2 py-1">SEÑAL</th>
                    <th className="px-2 py-1 text-right">SCORE</th>
                    <th className="px-2 py-1 text-right">PRECIO</th>
                    <th className="px-2 py-1">ÍNDICE</th>
                    <th className="px-2 py-1 text-right">COBERT.</th>
                    <th className="px-2 py-1 text-right">HORA</th>
                  </tr>
                </thead>
                <tbody>
                  {live.map((e) => {
                    const c = scoreClase(e.score);
                    return (
                      <tr
                        key={e.ticker}
                        onClick={() => setSel(e.ticker)}
                        className={`cursor-pointer border-b border-[var(--t-border)] hover:bg-[var(--t-panel)] ${
                          detalle?.ticker === e.ticker ? "bg-[var(--t-panel)]" : ""
                        }`}
                      >
                        <td className="px-2 py-1 font-bold">{e.ticker}</td>
                        <td className="px-2 py-1">
                          <span className={`px-1.5 py-0.5 border text-[10px] font-bold ${c.cls}`}>{c.txt}</span>
                        </td>
                        <td className={`px-2 py-1 text-right font-bold ${
                          e.score > 0 ? "text-emerald-400" : e.score < 0 ? "text-red-400" : ""
                        }`}>
                          {e.score > 0 ? "+" : ""}{fmtNum(e.score, 0)}
                        </td>
                        <td className="px-2 py-1 text-right">{fmtNum(e.precio)}</td>
                        <td className="px-2 py-1 text-[var(--t-text-dim)]">{e.indice_ref}</td>
                        <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">
                          {Math.round((e.cobertura ?? 0) * 100)}%
                        </td>
                        <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{fmtHora(e.ts)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* detalle de factores del seleccionado */}
            {detalle && (
              <div className="border border-[var(--t-border-2)] p-3 space-y-3 h-fit">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-bold">{detalle.ticker}</span>
                  <span className="text-[10px] text-[var(--t-text-dim)]">
                    vs {detalle.indice_ref} · {detalle.pesos_version}
                  </span>
                </div>
                {FACTOR_LABELS.map(([k, label, hint]) => {
                  const v = detalle.factores?.[k];
                  return (
                    <div key={k} title={hint}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-[var(--t-text-dim)]">{label}</span>
                        <span className={v == null ? "text-[var(--t-text-dim)]" : v >= 0 ? "text-emerald-400" : "text-red-400"}>
                          {v == null ? "s/d" : (v > 0 ? "+" : "") + v.toFixed(2)}
                        </span>
                      </div>
                      {/* barra centrada en 0: −1 a la izquierda, +1 a la derecha */}
                      <div className="relative h-2 bg-[var(--t-panel)] border border-[var(--t-border)]">
                        <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--t-border-2)]" />
                        {v != null && (
                          <div
                            className={`absolute inset-y-0 ${v >= 0 ? "bg-emerald-500/70" : "bg-red-500/70"}`}
                            style={
                              v >= 0
                                ? { left: "50%", width: `${Math.min(Math.abs(v), 1) * 50}%` }
                                : { right: "50%", width: `${Math.min(Math.abs(v), 1) * 50}%` }
                            }
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="text-[10px] text-[var(--t-text-dim)] pt-1 border-t border-[var(--t-border)]">
                  La señal la emite el motor (ledger inmutable) — el resolver la mide a 15/30/60′.
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Zona TRACK-RECORD ─────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[12px] font-bold tracking-widest text-[var(--t-accent)]">TRACK-RECORD</h2>
          {track && (
            <span className="text-[10px] text-[var(--t-text-dim)]">
              90d · {track.n_total} resueltas · {track.n_parciales} parciales
            </span>
          )}
        </div>
        {track && !track.muestra_suficiente && (
          <div className="text-[11px] text-amber-400 border border-amber-500/40 bg-amber-500/10 px-3 py-2 mb-2">
            ⚠ MUESTRA CHICA — {track.n_total}/{track.n_minimo} señales resueltas. Los stats de abajo
            todavía son ruido: el modelo está juntando evidencia, no operarlo a ciegas.
          </div>
        )}
        {track && Object.keys(track.horizontes).length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* KPIs por horizonte */}
            <div className="border border-[var(--t-border-2)] overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[10px] text-[var(--t-text-dim)] border-b border-[var(--t-border-2)]">
                    <th className="px-2 py-1">HORIZONTE</th>
                    <th className="px-2 py-1 text-right">N</th>
                    <th className="px-2 py-1 text-right">HIT %</th>
                    <th className="px-2 py-1 text-right">EXPECT. %</th>
                    <th className="px-2 py-1 text-right">MFE</th>
                    <th className="px-2 py-1 text-right">MAE</th>
                    <th className="px-2 py-1 text-right">EQUITY</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(track.horizontes).map(([h, s]) => {
                    const ultimo = s.equity.length ? s.equity[s.equity.length - 1].acum_pct : null;
                    return (
                      <tr key={h} className="border-b border-[var(--t-border)]">
                        <td className="px-2 py-1 font-bold">{h}′</td>
                        <td className="px-2 py-1 text-right">{s.n}</td>
                        <td className={`px-2 py-1 text-right font-bold ${
                          (s.hit_rate ?? 0) >= 50 ? "text-emerald-400" : "text-red-400"
                        }`}>{fmtNum(s.hit_rate, 1)}</td>
                        <td className={`px-2 py-1 text-right ${
                          (s.expectativa_pct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}>{fmtNum(s.expectativa_pct, 3)}</td>
                        <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{fmtNum(s.mfe_prom, 2)}</td>
                        <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{fmtNum(s.mae_prom, 2)}</td>
                        <td className={`px-2 py-1 text-right ${
                          (ultimo ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}>{ultimo == null ? "—" : `${ultimo > 0 ? "+" : ""}${fmtNum(ultimo, 2)}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* curva de equity del horizonte de referencia */}
              {track.horizonte_edge != null && (
                <EquityMini serie={track.horizontes[String(track.horizonte_edge)]?.equity ?? []} h={track.horizonte_edge} />
              )}
            </div>
            {/* edge por factor */}
            <div className="border border-[var(--t-border-2)] overflow-x-auto h-fit">
              <div className="px-2 py-1 text-[10px] text-[var(--t-text-dim)] border-b border-[var(--t-border-2)]">
                EDGE POR FACTOR (a {track.horizonte_edge}′) — expectativa cuando el factor empujaba a
                favor vs en contra de la señal. Si FAVOR no le gana a CONTRA, el factor no predice.
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-[10px] text-[var(--t-text-dim)] border-b border-[var(--t-border-2)]">
                    <th className="px-2 py-1">FACTOR</th>
                    <th className="px-2 py-1 text-right">EXP FAVOR</th>
                    <th className="px-2 py-1 text-right">EXP CONTRA</th>
                    <th className="px-2 py-1 text-right">N</th>
                  </tr>
                </thead>
                <tbody>
                  {FACTOR_LABELS.map(([k, label]) => {
                    const e = track.edge_factores?.[k];
                    if (!e) return null;
                    const predice = e.exp_favor != null && e.exp_contra != null && e.exp_favor > e.exp_contra;
                    return (
                      <tr key={k} className="border-b border-[var(--t-border)]">
                        <td className="px-2 py-1">
                          {label}
                          {e.exp_favor != null && e.exp_contra != null && (
                            <span className={`ml-2 text-[9px] ${predice ? "text-emerald-400" : "text-amber-400"}`}>
                              {predice ? "✓" : "✗"}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-right">{fmtNum(e.exp_favor, 3)}</td>
                        <td className="px-2 py-1 text-right">{fmtNum(e.exp_contra, 3)}</td>
                        <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{e.n_favor + e.n_contra}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-[var(--t-text-dim)] border border-[var(--t-border-2)] p-4">
            Todavía no hay señales resueltas. El track-record se construye solo: cada señal emitida
            queda en el ledger y el resolver la mide intradía.
          </div>
        )}

        {/* señales resueltas (auditoría) */}
        {senales.length > 0 && (
          <div className="border border-[var(--t-border-2)] overflow-x-auto mt-3">
            <div className="px-2 py-1 text-[10px] text-[var(--t-text-dim)] border-b border-[var(--t-border-2)]">
              SEÑALES (30d, ledger inmutable — una fila por señal × horizonte)
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-[10px] text-[var(--t-text-dim)] border-b border-[var(--t-border-2)]">
                  <th className="px-2 py-1">FECHA/HORA</th>
                  <th className="px-2 py-1">TICKER</th>
                  <th className="px-2 py-1">DIR</th>
                  <th className="px-2 py-1 text-right">SCORE</th>
                  <th className="px-2 py-1 text-right">PRECIO</th>
                  <th className="px-2 py-1 text-right">HZTE</th>
                  <th className="px-2 py-1 text-right">RET %</th>
                  <th className="px-2 py-1 text-right">MFE/MAE</th>
                  <th className="px-2 py-1">RESULTADO</th>
                </tr>
              </thead>
              <tbody>
                {senales.map((s) => (
                  <tr key={`${s.id}-${s.horizonte_min}`} className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)]">
                      {s.ts ? new Date(s.ts).toLocaleString("es-AR", {
                        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                      }) : "—"}
                    </td>
                    <td className="px-2 py-1 font-bold">{s.ticker}</td>
                    <td className={`px-2 py-1 font-bold ${s.direccion === "LONG" ? "text-emerald-400" : "text-red-400"}`}>
                      {s.direccion}
                    </td>
                    <td className="px-2 py-1 text-right">{s.score > 0 ? "+" : ""}{fmtNum(s.score, 0)}</td>
                    <td className="px-2 py-1 text-right">{fmtNum(s.precio)}</td>
                    <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{s.horizonte_min}′</td>
                    <td className={`px-2 py-1 text-right font-bold ${
                      s.ret_pct == null ? "text-[var(--t-text-dim)]" : s.ret_pct >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                      {s.ret_pct == null ? "—" : `${s.ret_pct > 0 ? "+" : ""}${fmtNum(s.ret_pct, 2)}`}
                    </td>
                    <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">
                      {fmtNum(s.mfe_pct, 2)} / {fmtNum(s.mae_pct, 2)}
                    </td>
                    <td className="px-2 py-1">
                      {s.parcial ? (
                        <span className="text-amber-400 text-[10px]">PARCIAL</span>
                      ) : s.gano == null ? (
                        <span className="text-[var(--t-text-dim)] text-[10px]">—</span>
                      ) : s.gano ? (
                        <span className="text-emerald-400 text-[10px]">GANÓ{s.toco_objetivo ? " ·obj" : ""}</span>
                      ) : (
                        <span className="text-red-400 text-[10px]">PERDIÓ</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// Curva de equity acumulada (SVG mínimo, sin libs — mismo espíritu que otras
// mini-charts de la vista trading).
function EquityMini({ serie, h }: { serie: { ts: string | null; acum_pct: number }[]; h: number }) {
  if (serie.length < 2) return null;
  const W = 600, H = 80, PAD = 4;
  const vals = serie.map((p) => p.acum_pct);
  const min = Math.min(...vals, 0), max = Math.max(...vals, 0);
  const rango = max - min || 1;
  const x = (i: number) => PAD + (i / (serie.length - 1)) * (W - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / rango) * (H - 2 * PAD);
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ultimo = vals[vals.length - 1];
  return (
    <div className="px-2 py-2 border-t border-[var(--t-border)]">
      <div className="text-[10px] text-[var(--t-text-dim)] mb-1">
        EQUITY ACUMULADA a {h}′ (Σ ret% direccional por señal)
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
        <line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} stroke="var(--t-border-2)" strokeWidth="1" strokeDasharray="3 3" />
        <path d={d} fill="none" stroke={ultimo >= 0 ? "#34d399" : "#f87171"} strokeWidth="1.5" />
      </svg>
    </div>
  );
}
