"use client";

import { useEffect, useMemo, useState } from "react";
import { fmtMoney, fmtMoneyFull } from "@/lib/fmt-money";
import { usePersistedState } from "@/lib/use-persisted-state";
import type { BookAnalysis, ExposicionGrupo } from "@/lib/types-estrategia";
import {
  AccionChip,
  KpiCard,
  MiniBar,
  TickerSearch,
  fmtNum,
  useDebounced,
  useUniverso,
} from "./estrategia-shared";
import { TableHelp } from "./help-tooltip";

/**
 * BOOK & RIESGO — Módulo 2 de la Mesa de Estrategia.
 *
 * Cargás el book (ticker + notional USD, negativo = short) y devuelve
 * exposición por sector/región, concentración (TOP5 / HHI), riesgo
 * agregado (vol del book, VaR 1d, beta en USD) y la contribución de
 * riesgo de cada posición.
 *
 * Backend: GET /api/scanner/book-analysis (api/services/rv_motor.py).
 */

const GLOSARIO = [
  { label: "GROSS / NET",        text: "Gross = Σ|posiciones| (capital total en juego). Net = Σ posiciones con signo (sesgo direccional). Net ≈ 0 con gross alto = book market-neutral." },
  { label: "VOL DEL BOOK",       text: "Volatilidad anualizada del P&L agregado, contando las correlaciones entre posiciones: dos longs correlacionados suman riesgo; un long y un short correlacionados se cancelan." },
  { label: "VaR 1 DÍA (95%)",    text: "Pérdida máxima esperada del book en 1 día con 95% de confianza: 1.645 × σ_diaria del P&L. 1 de cada 20 ruedas puede ser peor." },
  { label: "β$ (SPY/QQQ)",       text: "Exposición de mercado equivalente del book: Σ notional_i × β_i. Si da +$2M SPY, el book se mueve como $2M de SPY — shortear eso lo neutraliza." },
  { label: "TOP 5",              text: "Porcentaje del gross concentrado en las 5 posiciones más grandes." },
  { label: "HHI",                text: "Índice Herfindahl de concentración: Σ(peso²) × 100. <10 diversificado · 10–25 moderado · >25 concentrado (un book de 1 sola posición = 100)." },
  { label: "CONTRIB. RIESGO",    text: "Cuánto de la varianza del book aporta cada posición (suma 100%). Puede ser NEGATIVA: esa posición cubre al resto. La posición más grande no siempre es la que más riesgo mete." },
  { label: "EXCLUIDOS",          text: "Tickers sin serie suficiente (<30 ruedas comunes) — quedan fuera del cálculo de riesgo pero cuentan en gross/net y exposición por sector." },
];

interface PosInput {
  t: string; // ticker
  n: number; // notional USD con signo (<0 = short)
}

const EJEMPLO: PosInput[] = [
  { t: "NVDA", n: 1_000_000 },
  { t: "AAPL", n: 500_000 },
  { t: "GGAL", n: -300_000 },
];

function hhiLabel(hhi: number | undefined): { txt: string; cls: string } {
  if (hhi == null) return { txt: "--", cls: "text-[var(--t-text-muted)]" };
  if (hhi < 10) return { txt: "DIVERSIFICADO", cls: "text-[var(--t-pos)]" };
  if (hhi <= 25) return { txt: "MODERADO", cls: "text-[var(--t-accent)]" };
  return { txt: "CONCENTRADO", cls: "text-[var(--t-neg)]" };
}

function parsePaste(text: string): PosInput[] {
  // Acepta "TICKER 500000", "TICKER:500000", "TICKER,-500000", "TICKER\t1e6"
  const out: PosInput[] = [];
  for (const raw of text.split(/[\n;]+/)) {
    const m = raw.trim().match(/^([A-Za-z0-9.]+)[\s:,]+(-?[\d.,]+)\s*$/);
    if (!m) continue;
    const n = Number(m[2].replace(/\./g, "").replace(",", "."));
    if (!isFinite(n) || n === 0) continue;
    out.push({ t: m[1].toUpperCase(), n });
  }
  return out;
}

export function BookLabView() {
  const { universo } = useUniverso();
  const [posiciones, setPosiciones] = usePersistedState<PosInput[]>("estrategia.book.pos", []);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");

  // Resultado keyed por el CSV del book. Todo el estado se setea SOLO en
  // callbacks async (react-hooks/set-state-in-effect): `loading` y `error`
  // se derivan comparando keys. El último resultado bueno queda visible
  // mientras se recalcula (stale-while-revalidate) — el footer marca
  // "calculando…".
  const [res, setRes] = useState<{ key: string; b?: BookAnalysis; err?: string } | null>(null);

  const validas = useMemo(
    () => posiciones.filter((p) => p.t && isFinite(p.n) && p.n !== 0),
    [posiciones],
  );
  const csv = useMemo(
    () => validas.map((p) => `${p.t}:${Math.round(p.n)}`).join(","),
    [validas],
  );
  const csvDeb = useDebounced(csv, 600);

  useEffect(() => {
    if (!csvDeb) return;
    let alive = true;
    fetch(`/api/scanner/book-analysis?posiciones=${encodeURIComponent(csvDeb)}`, {
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: BookAnalysis) => {
        if (alive) setRes({ key: csvDeb, b: j });
      })
      .catch((e: unknown) => {
        if (alive) setRes({ key: csvDeb, err: e instanceof Error ? e.message : "error" });
      });
    return () => {
      alive = false;
    };
  }, [csvDeb]);

  const loading = !!csvDeb && res?.key !== csvDeb;
  const error = csvDeb && res?.key === csvDeb ? res.err ?? null : null;

  const setPos = (i: number, p: Partial<PosInput>) =>
    setPosiciones((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const delPos = (i: number) => setPosiciones((prev) => prev.filter((_, j) => j !== i));

  const grossLocal = validas.reduce((s, p) => s + Math.abs(p.n), 0);
  const netLocal = validas.reduce((s, p) => s + p.n, 0);
  // Resultado visible: último bueno mientras el book no esté vacío (SWR).
  const data = csvDeb ? res?.b ?? null : null;
  const r = data?.riesgo;
  const hhi = hhiLabel(data?.concentracion.hhi);

  return (
    <div className="h-full min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2 p-3 overflow-y-auto">
      {/* ── Editor del book ──────────────────────────────────────── */}
      <div className="xl:col-span-4 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-h-[300px]">
        <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide">
            POSICIONES
          </span>
          <span className="text-[9px] text-[var(--t-text-muted)]">{validas.length}</span>
          <TableHelp entries={GLOSARIO} />
          <button
            onClick={() => setPasteOpen((v) => !v)}
            className="ml-auto text-[9px] px-1.5 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] transition-colors tracking-wider"
          >
            PEGAR
          </button>
          {posiciones.length > 0 && (
            <button
              onClick={() => setPosiciones([])}
              className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-neg)] hover:border-[var(--t-neg)] transition-colors tracking-wider"
            >
              LIMPIAR
            </button>
          )}
        </div>

        {pasteOpen && (
          <div className="p-2 border-b border-[var(--t-border)] flex flex-col gap-1">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={4}
              placeholder={"NVDA 1000000\nAAPL:500000\nGGAL -300000"}
              className="w-full bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-1 text-[10px] font-mono text-[var(--t-text)] outline-none focus:border-[var(--t-accent)] resize-none"
            />
            <button
              onClick={() => {
                const parsed = parsePaste(pasteText);
                if (parsed.length) {
                  setPosiciones(parsed);
                  setPasteText("");
                  setPasteOpen(false);
                }
              }}
              className="self-end px-2 py-0.5 text-[10px] font-semibold border border-[var(--t-accent)]/50 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 transition-colors"
            >
              CARGAR ({parsePaste(pasteText).length})
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-1">
          {posiciones.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-[var(--t-text-dim)] text-[11px] max-w-[260px]">
                Cargá posiciones (notional USD, short en negativo) para medir el
                riesgo agregado del book.
              </p>
              <button
                onClick={() => setPosiciones(EJEMPLO)}
                className="px-2 py-1 text-[10px] border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)] transition-colors"
              >
                CARGAR EJEMPLO
              </button>
            </div>
          )}
          {posiciones.map((p, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                value={p.t}
                onChange={(e) =>
                  setPos(i, { t: e.target.value.toUpperCase().replace(/[^A-Z0-9.]/g, "") })
                }
                placeholder="TICKER"
                className="w-[72px] bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-1 text-[11px] font-mono font-semibold text-[var(--t-accent)] outline-none focus:border-[var(--t-accent)] uppercase"
              />
              <input
                value={p.n ? Math.abs(p.n).toLocaleString("es-AR") : ""}
                onChange={(e) => {
                  const digits = e.target.value.replace(/[^\d]/g, "");
                  const mag = digits ? Number(digits) : 0;
                  setPos(i, { n: p.n < 0 ? -mag : mag });
                }}
                inputMode="numeric"
                placeholder="notional USD"
                className="flex-1 min-w-0 bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-1 text-[11px] font-mono text-right text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
              />
              <button
                onClick={() => setPos(i, { n: -p.n })}
                title="Invertir long/short"
                className="shrink-0"
              >
                <AccionChip accion={p.n < 0 ? "short" : "long"} />
              </button>
              <button
                onClick={() => delPos(i)}
                className="text-[var(--t-text-muted)] hover:text-[var(--t-neg)] text-[11px] px-1"
                title="Quitar"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="pt-1">
            <TickerSearch
              universo={universo}
              onSelect={(tk) =>
                setPosiciones((prev) =>
                  prev.some((p) => p.t === tk) ? prev : [...prev, { t: tk, n: 100_000 }],
                )
              }
              placeholder="+ agregar ticker…"
            />
          </div>
        </div>

        {validas.length > 0 && (
          <div className="px-3 py-1.5 border-t border-[var(--t-border)] flex items-center justify-between text-[10px] font-mono tabular-nums">
            <span className="text-[var(--t-text-dim)]">
              GROSS <span className="text-[var(--t-text)]">{fmtMoney(grossLocal)}</span>
            </span>
            <span className="text-[var(--t-text-dim)]">
              NET{" "}
              <span className={netLocal >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}>
                {fmtMoney(netLocal)}
              </span>
            </span>
            <span className="text-[var(--t-text-muted)]">
              {loading ? "calculando…" : error ? `⚠ ${error}` : data ? `n_obs ${r?.n_obs ?? "--"}` : ""}
            </span>
          </div>
        )}
      </div>

      {/* ── Resultados ───────────────────────────────────────────── */}
      <div className="xl:col-span-8 flex flex-col gap-2 min-h-0">
        {!data && (
          <div className="flex-1 flex items-center justify-center border border-[var(--t-border)] bg-[var(--t-panel)] min-h-[200px]">
            <span className={`text-xs ${error ? "text-[var(--t-neg)]" : "text-[var(--t-text-muted)]"}`}>
              {error
                ? `⚠ ${error}`
                : loading
                ? "Calculando riesgo del book…"
                : "El análisis aparece acá al cargar posiciones."}
            </span>
          </div>
        )}

        {data && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 shrink-0">
              <KpiCard label="Gross" value={fmtMoney(data.book.gross)} sub={`${data.book.n} posiciones`} />
              <KpiCard
                label="Net"
                value={fmtMoney(data.book.net)}
                sub={data.book.gross > 0 ? `${((data.book.net / data.book.gross) * 100).toFixed(0)}% direccional` : undefined}
                valueClass={data.book.net >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}
              />
              <KpiCard
                label="Vol book (anual)"
                value={r?.vol_anual_book_pct != null ? `${r.vol_anual_book_pct.toFixed(1)}%` : "--"}
              />
              <KpiCard
                label="VaR 1 día (95%)"
                value={r?.var_1d_95 != null ? `−${fmtMoney(r.var_1d_95)}` : "--"}
                valueClass="text-[var(--t-neg)]"
              />
              <KpiCard
                label="β$ SPY"
                value={r?.exposicion_mercado_usd?.spy != null ? fmtMoney(r.exposicion_mercado_usd.spy) : "--"}
                sub={`QQQ ${r?.exposicion_mercado_usd?.qqq != null ? fmtMoney(r.exposicion_mercado_usd.qqq) : "--"}`}
              />
              <KpiCard
                label="Concentración"
                value={data.concentracion.hhi != null ? `HHI ${fmtNum(data.concentracion.hhi, 1)}` : "--"}
                sub={`top5 ${data.concentracion.pct_top5 != null ? `${data.concentracion.pct_top5}%` : "--"}`}
                valueClass={hhi.cls}
              />
            </div>

            {data.excluidos.length > 0 && (
              <div className="text-[10px] text-[var(--t-accent)] border border-[var(--t-accent)]/30 bg-[var(--t-accent)]/5 px-2 py-1 shrink-0">
                ⚠ Sin serie para el cálculo de riesgo (cuentan en gross/sector):{" "}
                <span className="font-mono">{data.excluidos.join(", ")}</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <ExposicionPanel titulo="EXPOSICIÓN POR SECTOR" grupos={data.exposicion.por_sector} />
              <ExposicionPanel titulo="EXPOSICIÓN POR REGIÓN" grupos={data.exposicion.por_region} />
            </div>

            {/* Contribución de riesgo */}
            <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
              <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 flex items-baseline gap-2">
                <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide">
                  CONTRIBUCIÓN DE RIESGO
                </span>
                <span className="text-[9px] text-[var(--t-text-muted)]">
                  % de la varianza del book que aporta cada posición — negativa = cubre al resto
                </span>
              </div>
              {data.contribucion_riesgo.length === 0 ? (
                <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
                  Sin datos de riesgo (todas las posiciones excluidas).
                </p>
              ) : (
                <table className="w-full text-[11px]">
                  <tbody>
                    {data.contribucion_riesgo.map((cr) => {
                      const pos = data.book.posiciones.find((p) => p.ticker === cr.ticker);
                      return (
                        <tr key={cr.ticker} className="border-b border-[var(--t-border)] last:border-b-0">
                          <td className="!px-3 !py-1 font-mono font-semibold text-[var(--t-accent)] w-[70px]">
                            {cr.ticker}
                          </td>
                          <td className="!px-2 !py-1 text-[10px] text-[var(--t-text-dim)] hidden md:table-cell">
                            {pos?.sector ?? "—"}
                          </td>
                          <td
                            className="!px-2 !py-1 text-right font-mono tabular-nums text-[var(--t-text)] w-[90px]"
                            title={fmtMoneyFull(cr.notional)}
                          >
                            {fmtMoney(cr.notional)}
                          </td>
                          <td className="!px-2 !py-1 w-[45%]">
                            <MiniBar
                              value={cr.contrib_pct}
                              max={Math.max(...data.contribucion_riesgo.map((x) => Math.abs(x.contrib_pct)), 1)}
                              className={cr.contrib_pct >= 0 ? "bg-[var(--t-neg)]/60" : "bg-[var(--t-pos)]/60"}
                            />
                          </td>
                          <td className={`!px-3 !py-1 text-right font-mono tabular-nums font-semibold w-[70px] ${cr.contrib_pct >= 0 ? "text-[var(--t-text)]" : "text-[var(--t-pos)]"}`}>
                            {cr.contrib_pct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ExposicionPanel({ titulo, grupos }: { titulo: string; grupos: ExposicionGrupo[] }) {
  const max = Math.max(...grupos.map((g) => g.bruto), 1);
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 text-[11px] font-semibold text-[var(--t-accent)] tracking-wide">
        {titulo}
      </div>
      {grupos.length === 0 ? (
        <p className="text-[var(--t-text-muted)] text-xs py-3 text-center">Sin datos.</p>
      ) : (
        <div className="p-2 flex flex-col gap-1.5">
          {grupos.map((g) => (
            <div key={g.grupo} className="flex items-center gap-2 text-[10px]">
              <span className="w-[110px] shrink-0 truncate text-[var(--t-text-dim)]" title={g.grupo}>
                {g.grupo}
              </span>
              <span className="flex-1 min-w-0">
                <MiniBar value={g.bruto} max={max} />
              </span>
              <span className="w-[58px] text-right font-mono tabular-nums text-[var(--t-text)]" title={fmtMoneyFull(g.bruto)}>
                {fmtMoney(g.bruto)}
              </span>
              <span
                className={`w-[58px] text-right font-mono tabular-nums ${g.neto >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}`}
                title={`Neto ${fmtMoneyFull(g.neto)}`}
              >
                {fmtMoney(g.neto)}
              </span>
              <span className="w-[38px] text-right text-[var(--t-text-muted)] tabular-nums">
                {g.pct_bruto}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
