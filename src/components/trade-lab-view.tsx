"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtMoney, fmtMoneyFull } from "@/lib/fmt-money";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { Direccion, TradeAnalysis, UniversoItem } from "@/lib/types-estrategia";
import {
  AccionChip,
  CorrBar,
  KpiCard,
  MiniBar,
  TickerSearch,
  fmtNum,
  fmtPct,
  useDebounced,
  useUniverso,
  zClass,
} from "./estrategia-shared";
import { TableHelp } from "./help-tooltip";

/**
 * TRADE LAB — Módulo 1 de la Mesa de Estrategia.
 *
 * Caracteriza el riesgo de un trade individual (vol, beta, z-score, VaR,
 * peor mes) y rankea TODO el universo como candidato de cobertura
 * (hedge-finder por correlación, con ratio de mínima varianza).
 *
 * Backend: GET /api/scanner/trade-analysis (api/services/rv_motor.py).
 * Serie base: Trading.PreciosAcciones (EOD USD del subyacente).
 */

const GLOSARIO = [
  { label: "VOL REALIZADA",       text: "Volatilidad histórica anualizada: stdev(retornos diarios) × √252. Cuánto se movió de verdad el activo. Es el insumo del sizing y del VaR." },
  { label: "BETA (β)",            text: "Sensibilidad al benchmark: β = cov(activo, bench) / var(bench). β=1 se mueve igual que el mercado; β=2 amplifica ×2; β<0 se mueve al revés. Ventana 60 ruedas." },
  { label: "Z-SCORE HOY",         text: "Cuán raro es el movimiento de HOY vs los días previos: z = (r_hoy − μ) / σ. |z|>2 es atípico (~5% de probabilidad); |z|>3 extremo. Candidato a mean-reversion." },
  { label: "VaR 1 DÍA (95%)",     text: "Pérdida máxima esperada en 1 día con 95% de confianza, asumiendo normalidad: monto × 1.645 × σ_diaria. 1 de cada 20 ruedas la pérdida puede SUPERAR este número." },
  { label: "PEOR MES (1σ)",       text: "Movimiento mensual de 1 desvío: monto × σ_anual / √12. Orden de magnitud de un mes malo 'normal' (no un crash)." },
  { label: "EXPOSICIÓN EQUIV.",   text: "monto × β = cuántos dólares de mercado (SPY/QQQ) 'son' este trade. Un long de $1M con β 1.5 se mueve como $1.5M de SPY." },
  { label: "HEDGE DIRECTO",       text: "Neutralizar el riesgo de mercado operando el benchmark en sentido contrario por la exposición equivalente. Lo que queda después es riesgo idiosincrático del activo." },
  { label: "ρ (CORRELACIÓN)",     text: "Pearson entre retornos diarios. Rojo (ρ>0): se mueven juntos — se cubre con la posición CONTRARIA. Azul (ρ<0): se mueven opuestos — se cubre con la MISMA dirección." },
  { label: "HEDGE RATIO",         text: "Ratio de mínima varianza: h = ρ × σ_activo / σ_candidato. Cuántos USD del candidato por cada USD del trade minimizan la varianza del combo." },
  { label: "REDUCC. VOL",         text: "Cuánta volatilidad elimina la cobertura óptima con ese candidato: 1 − √(1 − ρ²). Con ρ=0.9 reducís ~56% de la vol; con ρ=0.5 apenas ~13% — la cobertura buena exige |ρ| alta." },
];

const MONTO_PRESETS = [
  { label: "100k", value: 100_000 },
  { label: "250k", value: 250_000 },
  { label: "500k", value: 500_000 },
  { label: "1M",   value: 1_000_000 },
  { label: "5M",   value: 5_000_000 },
];

const QUICK_PICKS = ["NVDA", "AAPL", "TSLA", "MELI", "GGAL", "YPFD"];
const TOP_N = 25;
const REFRESH_MS = 300_000; // serie EOD + last cada 15 min → 5 min sobra

export function TradeLabView() {
  const { universo } = useUniverso();
  const [ticker, setTicker] = usePersistedState<string | null>("estrategia.tl.ticker", null);
  const [monto, setMonto] = usePersistedState<number>("estrategia.tl.monto", 1_000_000);
  const [direccion, setDireccion] = usePersistedState<Direccion>("estrategia.tl.dir", "long");

  const [data, setData] = useState<TradeAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filtro, setFiltro] = useState("");
  const [verTodos, setVerTodos] = useState(false);

  const montoDeb = useDebounced(monto, 400);

  // Fetch del análisis — debounced sobre monto, inmediato sobre ticker/dirección.
  // No se resetea `data` acá: la vigencia se deriva en render (`vista`) para
  // evitar setState sincrónico en el effect (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!ticker || !montoDeb) return;
    let alive = true;
    const load = (spinner: boolean) => {
      if (spinner) setLoading(true);
      const qs = new URLSearchParams({
        ticker,
        monto: String(montoDeb),
        direccion,
      });
      fetch(`/api/scanner/trade-analysis?${qs}`, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((j: TradeAnalysis) => {
          if (!alive) return;
          setData(j);
          setError(null);
          setLoading(false);
        })
        .catch((e: unknown) => {
          if (!alive) return;
          setError(e instanceof Error ? e.message : "error");
          setLoading(false);
        });
    };
    load(true);
    const id = setInterval(() => load(false), REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ticker, montoDeb, direccion]);

  // Dato vigente: solo si corresponde al ticker seleccionado (stale-while-
  // revalidate sobre monto/dirección — el número viejo se pisa al llegar el
  // nuevo; sobre cambio de ticker se oculta hasta el fetch fresco).
  const vista = ticker && data && data.trade.ticker === ticker ? data : null;

  const meta: UniversoItem | undefined = useMemo(
    () => universo.find((u) => u.ticker === ticker),
    [universo, ticker],
  );

  const sectorPor = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of universo) m.set(u.ticker, u.sector ?? "—");
    return m;
  }, [universo]);

  const candidatos = useMemo(() => {
    if (!vista) return [];
    const q = filtro.trim().toUpperCase();
    const base = q
      ? vista.hedge_finder.filter(
          (c) => c.ticker.includes(q) || (sectorPor.get(c.ticker) ?? "").toUpperCase().includes(q),
        )
      : vista.hedge_finder;
    return verTodos ? base : base.slice(0, TOP_N);
  }, [vista, filtro, verTodos, sectorPor]);

  const c = vista?.caracterizacion;
  const z60 = c?.zscore?.d60 ?? null;
  const expoMax = Math.max(
    Math.abs(c?.exposicion_mercado_equiv.spy ?? 0),
    Math.abs(c?.exposicion_mercado_equiv.qqq ?? 0),
    montoDeb,
  );

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-2 overflow-y-auto">
      {/* ── Barra de control ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap shrink-0">
        {ticker ? (
          <span className="flex items-center gap-2 border border-[var(--t-accent)]/40 bg-[var(--t-accent)]/10 px-2 py-1">
            <span className="font-mono font-bold text-[13px] text-[var(--t-accent)]">{ticker}</span>
            {meta?.nombre && (
              <span className="text-[10px] text-[var(--t-text-dim)] max-w-[180px] truncate">{meta.nombre}</span>
            )}
            {meta?.sector && (
              <span className="text-[9px] text-[var(--t-text-muted)] uppercase">{meta.sector}</span>
            )}
            <button
              onClick={() => setTicker(null)}
              className="text-[var(--t-text-muted)] hover:text-[var(--t-neg)] text-[11px] leading-none"
              title="Cambiar ticker"
            >
              ✕
            </button>
          </span>
        ) : (
          <TickerSearch universo={universo} onSelect={setTicker} placeholder="TICKER…" autoFocus />
        )}

        {/* Monto */}
        <span className="flex items-center gap-1">
          <span className="text-[9px] text-[var(--t-text-muted)] tracking-widest">USD</span>
          <input
            value={monto ? monto.toLocaleString("es-AR") : ""}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^\d]/g, "");
              setMonto(digits ? Number(digits) : 0);
            }}
            inputMode="numeric"
            className="w-[110px] bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-1 text-[11px] text-right font-mono text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
          />
          {MONTO_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setMonto(p.value)}
              className={`px-1.5 py-1 text-[9px] font-semibold border transition-colors ${
                monto === p.value
                  ? "text-[var(--t-accent)] border-[var(--t-accent)]/50"
                  : "text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </span>

        {/* Dirección */}
        <span className="flex border border-[var(--t-border-2)]">
          {(["long", "short"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDireccion(d)}
              className={`px-3 py-1 text-[10px] font-bold tracking-widest transition-colors ${
                direccion === d
                  ? d === "long"
                    ? "bg-[var(--t-pos)]/20 text-[var(--t-pos)]"
                    : "bg-[var(--t-neg)]/20 text-[var(--t-neg)]"
                  : "text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
              }`}
            >
              {d.toUpperCase()}
            </button>
          ))}
        </span>

        <TableHelp entries={GLOSARIO} />

        <span className="ml-auto text-[9px] text-[var(--t-text-muted)] tracking-wide">
          {loading
            ? "calculando…"
            : error
            ? <span className="text-[var(--t-neg)]">⚠ {error}</span>
            : vista
            ? "serie EOD USD · ventana 60 ruedas · σ 30/60d"
            : ""}
        </span>
      </div>

      {/* ── Sin ticker: estado vacío con accesos rápidos ─────────── */}
      {!ticker && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="text-[var(--t-text-muted)] text-[11px] tracking-[0.3em] font-semibold">
            TRADE LAB
          </div>
          <p className="text-[var(--t-text-dim)] text-xs max-w-[420px]">
            Elegí un ticker para caracterizar el riesgo del trade (vol, beta, z-score,
            VaR) y rankear todo el universo como cobertura.
          </p>
          <div className="flex gap-1.5 flex-wrap justify-center">
            {QUICK_PICKS.filter((t) => universo.some((u) => u.ticker === t)).map((t) => (
              <button
                key={t}
                onClick={() => setTicker(t)}
                className="px-2.5 py-1 text-[11px] font-mono font-semibold border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] transition-colors"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Resultados ───────────────────────────────────────────── */}
      {ticker && vista && c && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 shrink-0">
            <KpiCard
              label="Último (USD)"
              value={c.last != null ? `$${c.last.toFixed(2)}` : "--"}
              sub={meta?.sector ?? undefined}
            />
            <KpiCard
              label="Vol 30d (anual)"
              value={c.vol_anual.d30 != null ? fmtPct(c.vol_anual.d30 * 100) : "--"}
              sub={`60d ${c.vol_anual.d60 != null ? fmtPct(c.vol_anual.d60 * 100) : "--"}`}
            />
            <KpiCard
              label="Beta SPY"
              value={fmtNum(c.beta.spy)}
              sub={`QQQ ${fmtNum(c.beta.qqq)}`}
            />
            <KpiCard
              label="Z-score hoy"
              value={z60 != null ? `${z60 >= 0 ? "+" : ""}${z60.toFixed(2)} σ` : "--"}
              sub={`30d ${c.zscore?.d30 != null ? `${c.zscore.d30 >= 0 ? "+" : ""}${c.zscore.d30.toFixed(2)} σ` : "--"}`}
              valueClass={zClass(z60)}
            />
            <KpiCard
              label="VaR 1 día (95%)"
              value={c.var_1d_95 != null ? `−${fmtMoney(c.var_1d_95)}` : "--"}
              sub={c.var_1d_95_pct != null ? `−${c.var_1d_95_pct.toFixed(2)}% del notional` : undefined}
              valueClass="text-[var(--t-neg)]"
            />
            <KpiCard
              label="Peor mes (1σ)"
              value={c.peor_mes_1sigma != null ? `−${fmtMoney(c.peor_mes_1sigma)}` : "--"}
              valueClass="text-[var(--t-neg)]"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-2 flex-1 min-h-0">
            {/* Exposición de mercado + hedge directo */}
            <div className="xl:col-span-4 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-[220px]">
              <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 text-[11px] font-semibold text-[var(--t-accent)] tracking-wide">
                EXPOSICIÓN DE MERCADO
              </div>
              <div className="p-3 flex flex-col gap-3 text-[11px]">
                {(["spy", "qqq"] as const).map((b) => {
                  const beta = c.beta[b];
                  const equiv = c.exposicion_mercado_equiv[b];
                  const hedge = vista.hedge_beta.find(
                    (h) => h.benchmark.toLowerCase() === b,
                  );
                  return (
                    <div key={b} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between">
                        <span className="font-mono font-semibold text-[var(--t-text)]">
                          {b.toUpperCase()}
                          <span className="ml-2 text-[var(--t-text-dim)] font-normal">
                            β {fmtNum(beta)}
                          </span>
                        </span>
                        <span
                          className="font-mono tabular-nums text-[var(--t-text)]"
                          title={fmtMoneyFull(equiv)}
                        >
                          {equiv != null ? fmtMoney(equiv) : "--"}
                        </span>
                      </div>
                      <MiniBar value={equiv ?? 0} max={expoMax} />
                      {hedge && (
                        <div className="flex items-center gap-1.5 text-[10px] text-[var(--t-text-dim)]">
                          <span className="text-[var(--t-text-muted)]">hedge directo:</span>
                          <AccionChip accion={hedge.accion} />
                          <span className="font-mono tabular-nums" title={fmtMoneyFull(hedge.notional)}>
                            {fmtMoney(hedge.notional)} {hedge.benchmark}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="text-[9px] text-[var(--t-text-muted)] leading-snug border-t border-[var(--t-border)] pt-2">
                  Un {direccion.toUpperCase()} de {fmtMoney(montoDeb)} en {ticker} se mueve
                  como esa cantidad de dólares del benchmark. El hedge directo neutraliza
                  el mercado: lo que queda es riesgo propio del activo.
                </p>
              </div>
            </div>

            {/* Hedge finder */}
            <div className="xl:col-span-8 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-[260px]">
              <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide">
                  HEDGE FINDER
                </span>
                <span className="text-[9px] text-[var(--t-text-muted)]">
                  universo rankeado por |ρ| · {vista.hedge_finder.length} candidatos
                </span>
                <input
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  placeholder="filtrar…"
                  className="ml-auto w-[120px] bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-0.5 text-[10px] text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
                />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto">
                {vista.hedge_finder.length === 0 ? (
                  <p className="text-[var(--t-text-muted)] text-xs py-6 text-center">
                    Sin candidatos — el ticker no tiene serie suficiente en la matriz de
                    correlación (mín. 30 ruedas comunes).
                  </p>
                ) : (
                  <table className="w-full text-[11px]">
                    <thead className="sticky top-0 bg-[var(--t-panel)] border-b border-[var(--t-border-2)]">
                      <tr className="text-[var(--t-text-muted)] text-[9px] tracking-wider">
                        <th className="!px-2 !py-1 text-left">#</th>
                        <th className="!px-2 !py-1 text-left">TICKER</th>
                        <th className="!px-2 !py-1 text-left hidden md:table-cell">SECTOR</th>
                        <th className="!px-2 !py-1 text-right">ρ</th>
                        <th className="!px-2 !py-1 w-[90px]"></th>
                        <th className="!px-2 !py-1 text-right">RATIO</th>
                        <th className="!px-2 !py-1 text-right">NOTIONAL</th>
                        <th className="!px-2 !py-1 text-center">ACCIÓN</th>
                        <th className="!px-2 !py-1 text-right">−VOL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidatos.map((h, i) => (
                        <tr
                          key={h.ticker}
                          className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface-2)]"
                        >
                          <td className="!px-2 !py-1 text-[var(--t-text-muted)] tabular-nums">{i + 1}</td>
                          <td className="!px-2 !py-1 font-mono font-semibold text-[var(--t-accent)]">{h.ticker}</td>
                          <td className="!px-2 !py-1 text-[var(--t-text-dim)] text-[10px] hidden md:table-cell">
                            {sectorPor.get(h.ticker) ?? "—"}
                          </td>
                          <td className={`!px-2 !py-1 text-right font-mono tabular-nums font-semibold ${h.correlacion >= 0 ? "text-[#ff7766]" : "text-[#6699ff]"}`}>
                            {h.correlacion >= 0 ? "+" : ""}{h.correlacion.toFixed(2)}
                          </td>
                          <td className="!px-1 !py-1"><CorrBar value={h.correlacion} /></td>
                          <td className="!px-2 !py-1 text-right font-mono tabular-nums text-[var(--t-text)]">
                            {h.hedge_ratio != null ? h.hedge_ratio.toFixed(2) : "--"}
                          </td>
                          <td
                            className="!px-2 !py-1 text-right font-mono tabular-nums text-[var(--t-text)]"
                            title={fmtMoneyFull(h.notional_hedge)}
                          >
                            {h.notional_hedge != null ? fmtMoney(h.notional_hedge) : "--"}
                          </td>
                          <td className="!px-2 !py-1 text-center"><AccionChip accion={h.accion} /></td>
                          <td className="!px-2 !py-1 text-right">
                            <span className="font-mono tabular-nums text-[var(--t-text)] mr-1">
                              {h.reduccion_vol_pct.toFixed(0)}%
                            </span>
                            <span className="inline-block w-[36px] align-middle">
                              <MiniBar value={h.reduccion_vol_pct} max={100} className="bg-[var(--t-pos)]/60" />
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {!verTodos && vista.hedge_finder.length > TOP_N && !filtro && (
                  <button
                    onClick={() => setVerTodos(true)}
                    className="w-full py-1.5 text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] transition-colors"
                  >
                    VER TODOS ({vista.hedge_finder.length})
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Loading sin data previa */}
      {ticker && !vista && loading && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[var(--t-text-muted)] text-xs animate-pulse">
            Calculando matriz de correlación del universo…
          </span>
        </div>
      )}
      {ticker && !vista && !loading && error && (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-[var(--t-neg)] text-xs">⚠ {error}</span>
        </div>
      )}
    </div>
  );
}
