"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CedearsTimeSalesPanel } from "@/components/cedears-timesales-panel";
import { IaVistaPanel } from "@/components/ia-vista-panel";
import { LiveIntradayChart } from "@/components/live-intraday-chart";
import { OrderBookPanel } from "@/components/order-book-panel";
import { TradingRadarPanel } from "@/components/trading-radar-panel";
import { usePoll } from "@/lib/use-poll";
import {
  VWAP_COLOR,
  type PivotLevels,
  type PivotMode,
  type PivotRow,
  type UniversoItem,
} from "@/lib/types-trading";

const POLL_MS = 4_000;
const LS_CARDS = "trd-fx-trading-pivot-cards-v1";

type Card = { id: string; ticker: string };

const SLOTS = 12; // 4 por fila × 3 filas — algunas pueden quedar vacías

const DEFAULT_CARDS: Card[] = [
  { id: "c1", ticker: "RKLB" },
  { id: "c2", ticker: "SNDK" },
  { id: "c3", ticker: "ASTS" },
  { id: "c4", ticker: "" },
  { id: "c5", ticker: "" },
  { id: "c6", ticker: "" },
  { id: "c7", ticker: "" },
  { id: "c8", ticker: "" },
  { id: "c9", ticker: "" },
  { id: "c10", ticker: "" },
  { id: "c11", ticker: "" },
  { id: "c12", ticker: "" },
];

// Rellena/recorta a SLOTS cards (para que siempre haya la grilla completa, con vacías).
function padCards(arr: Card[]): Card[] {
  const out = arr.slice(0, SLOTS);
  while (out.length < SLOTS) out.push({ id: `c${out.length + 1}`, ticker: "" });
  return out;
}

// Lazy init desde localStorage (guard SSR — mismo patrón que el módulo de órdenes).
function loadCards(): Card[] {
  if (typeof window === "undefined") return DEFAULT_CARDS;
  try {
    const raw = window.localStorage.getItem(LS_CARDS);
    if (raw) {
      const arr = JSON.parse(raw) as Card[];
      if (Array.isArray(arr) && arr.length) return padCards(arr);
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_CARDS;
}

function saveCards(cards: Card[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_CARDS, JSON.stringify(cards));
  } catch {
    /* ignore */
  }
}

// Override manual de máx/mín/cierre, keyed por CEDEAR → persiste entre navegación
// y recargas. {} = ninguno; presencia de un ticker = el usuario lo editó a mano.
type Ov = { h: string; l: string; c: string };
const LS_OVERRIDES = "trd-fx-trading-pivot-overrides-v1";

function loadOverrides(): Record<string, Ov> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_OVERRIDES);
    if (raw) {
      const o = JSON.parse(raw) as Record<string, Ov>;
      if (o && typeof o === "object") return o;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function saveOverrides(ov: Record<string, Ov>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_OVERRIDES, JSON.stringify(ov));
  } catch {
    /* ignore */
  }
}

// Pivot Floor Trader en el cliente (para que el editar máx/mín/cierre recalcule).
function calcPivots(h: number, l: number, c: number): PivotLevels {
  const pp = (h + l + c) / 3;
  const rango = h - l;
  return {
    pp,
    r1: 2 * pp - l,
    s1: 2 * pp - h,
    r2: pp + rango,
    s2: pp - rango,
    r3: h + 2 * (pp - l),
    s3: l - 2 * (h - pp),
  };
}

// Orden y tipo de cada nivel (resistencias verdes, soportes rojos, PP gris) — como la imagen.
const NIVELES: { key: keyof PivotLevels; label: string; kind: "R" | "S" | "PP" }[] = [
  { key: "r3", label: "R3", kind: "R" },
  { key: "r2", label: "R2", kind: "R" },
  { key: "r1", label: "R1", kind: "R" },
  { key: "pp", label: "PP", kind: "PP" },
  { key: "s1", label: "S1", kind: "S" },
  { key: "s2", label: "S2", kind: "S" },
  { key: "s3", label: "S3", kind: "S" },
];

const BG: Record<"R" | "S" | "PP", string> = {
  R: "rgba(16,163,74,0.16)",
  S: "rgba(220,38,38,0.16)",
  PP: "rgba(130,130,130,0.20)",
};

// ── formato ──────────────────────────────────────────────────────────────────
function fmtPrecio(v: number): string {
  return v.toLocaleString("es-AR", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
}
function fmtDif(v: number): string {
  const s = Math.abs(v).toLocaleString("es-AR", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
  return `${v >= 0 ? "+" : "−"}${s}`;
}
function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
function valorNivel(p: number, last: number | null, mode: PivotMode): string {
  if (mode === "precio") return fmtPrecio(p);
  if (last === null) return "—";
  // pivot vs precio: cuánto está el NIVEL por encima (+) / debajo (−) del precio actual.
  if (mode === "dif") return fmtDif(p - last);
  return last !== 0 ? fmtPct(((p - last) / last) * 100) : "—";
}

type VigiaAlerta = {
  id: string;
  tipo: string;
  ticker: string;
  nivel: string | null;
  mensaje: string;
  pregunta: string;
  accion_agregar?: string;
};

const VIGIA_VISTOS_KEY = "trd-fx-vigia-vistos-v1";
const VIGIA_POLL_MS = 15_000;

function loadVigiaVistos(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(VIGIA_VISTOS_KEY) || "{}");
    const hoy = new Date().toISOString().slice(0, 10);
    if (raw?.fecha === hoy && Array.isArray(raw.ids)) return new Set(raw.ids);
  } catch {
    /* arranca limpio */
  }
  return new Set();
}

function saveVigiaVistos(ids: Set<string>) {
  try {
    localStorage.setItem(
      VIGIA_VISTOS_KEY,
      JSON.stringify({ fecha: new Date().toISOString().slice(0, 10), ids: [...ids] }),
    );
  } catch {
    /* sin persistencia de vistos */
  }
}

export function TradingView() {
  const [mode, setMode] = useState<PivotMode>("precio");
  const [cards, setCards] = useState<Card[]>(loadCards);
  const [universo, setUniverso] = useState<UniversoItem[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [overrides, setOverrides] = useState<Record<string, Ov>>(loadOverrides);
  const [vigiaAlertas, setVigiaAlertas] = useState<VigiaAlerta[]>([]);
  const [pregExterna, setPregExterna] = useState<{ texto: string; n: number } | undefined>();
  const vigiaVistos = useRef<Set<string>>(loadVigiaVistos());

  // CEDEAR que manda el chart + time sales: la card marcada, o la primera con ticker.
  const shownTicker =
    selected && cards.some((c) => c.ticker === selected)
      ? selected
      : cards.find((c) => c.ticker)?.ticker || "";

  useEffect(() => {
    saveCards(cards);
  }, [cards]);

  useEffect(() => {
    saveOverrides(overrides);
  }, [overrides]);

  // EL VIGÍA: pollea los disparadores deterministas (tarjeta en nivel /
  // candidato del radar) — cero tokens; los toasts son templates del server.
  useEffect(() => {
    let vivo = true;
    const consultar = async () => {
      try {
        const r = await fetch("/api/ia/copiloto/vigia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            params: {
              tickers: cards.map((c) => c.ticker).filter(Boolean),
              overrides: Object.fromEntries(
                Object.entries(overrides).map(([tk, ov]) => [
                  tk,
                  { high: parseFloat(ov.h), low: parseFloat(ov.l), close: parseFloat(ov.c) },
                ]),
              ),
            },
          }),
        });
        if (!r.ok || !vivo) return; // 403 = sin módulo ia → sin vigía, silencioso
        const j = (await r.json()) as { alertas?: VigiaAlerta[] };
        const nuevas = (j.alertas ?? []).filter((a) => !vigiaVistos.current.has(a.id));
        setVigiaAlertas(nuevas.slice(0, 3));
      } catch {
        /* transitorio */
      }
    };
    void consultar();
    const t = setInterval(consultar, VIGIA_POLL_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [cards, overrides]);

  function vigiaDescartar(id: string) {
    vigiaVistos.current.add(id);
    saveVigiaVistos(vigiaVistos.current);
    setVigiaAlertas((as) => as.filter((a) => a.id !== id));
  }

  const pregNum = useRef(0);
  function vigiaMirar(a: VigiaAlerta) {
    pregNum.current += 1;
    setPregExterna({ texto: a.pregunta, n: pregNum.current });
    vigiaDescartar(a.id);
  }

  function setOverride(ticker: string, ov: Ov | null) {
    setOverrides((prev) => {
      const next = { ...prev };
      if (ov === null) delete next[ticker];
      else next[ticker] = ov;
      return next;
    });
  }

  // catálogo de CEDEARs para el selector (1 vez)
  useEffect(() => {
    let alive = true;
    fetch("/api/trading/universo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((j: UniversoItem[]) => {
        if (alive && Array.isArray(j)) setUniverso(j);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const csv = cards.map((c) => c.ticker).filter(Boolean).join(",");
  const { data: rows } = usePoll<PivotRow[]>(
    `/api/trading/pivots?tickers=${encodeURIComponent(csv)}`,
    [],
    POLL_MS,
    { fetchOnMount: true },
  );
  const byTicker = useMemo(() => {
    const m = new Map<string, PivotRow>();
    for (const r of rows ?? []) m.set(r.ticker, r);
    return m;
  }, [rows]);

  // Pivots que van al chart: si el CEDEAR mostrado tiene override editado a mano,
  // se calculan con esos valores → las líneas del gráfico siguen la edición de la card.
  const shownPivots = useMemo(() => {
    const ov = overrides[shownTicker];
    if (ov) {
      const h = parseFloat(ov.h);
      const l = parseFloat(ov.l);
      const c = parseFloat(ov.c);
      if (Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c)) return calcPivots(h, l, c);
    }
    return byTicker.get(shownTicker)?.pivots ?? null;
  }, [overrides, shownTicker, byTicker]);

  function setTicker(id: string, ticker: string) {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ticker: ticker.toUpperCase() } : c)));
  }

  // Click en el radar hot-movers → carga el ticker en una card (la primera vacía,
  // o la última si están todas ocupadas) y lo marca como el mostrado (chart/libro/tape).
  function loadTicker(ticker: string) {
    const up = ticker.toUpperCase();
    setCards((cs) => {
      if (cs.some((c) => c.ticker === up)) return cs;
      const emptyIdx = cs.findIndex((c) => !c.ticker);
      const idx = emptyIdx >= 0 ? emptyIdx : cs.length - 1;
      return cs.map((c, i) => (i === idx ? { ...c, ticker: up } : c));
    });
    setSelected(up);
  }

  return (
    <div className="h-full flex flex-col min-h-0 p-2 gap-2 text-[var(--t-text)]">
      {/* toolbar: título + toggle de modo */}
      <div className="flex items-center gap-3 shrink-0">
        <h1 className="text-sm font-bold tracking-wide">TRADING · Pivots</h1>
        <div className="flex items-center gap-1">
          {([
            ["precio", "PRECIO"],
            ["dif", "DIF $"],
            ["pct", "DIF %"],
          ] as [PivotMode, string][]).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                "px-3 py-1 text-[11px] font-semibold tracking-wide border transition-colors " +
                (mode === m
                  ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                  : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <MarketKpis />
        {/* Copiloto IA de la vista TRADING: manda la SELECCIÓN (tickers de las
            cards + foco + overrides) como parámetros; el server busca los
            datos frescos él mismo. Oculto sin módulos ia+trading. */}
        <IaVistaPanel
          vista="trading"
          preguntaExterna={pregExterna}
          getParams={() => {
            let posiciones: unknown = undefined;
            try {
              const raw = localStorage.getItem("trd-fx-intraday-posiciones-v1");
              if (raw) posiciones = JSON.parse(raw);
            } catch {
              /* sin puente intraday */
            }
            return {
              tickers: cards.map((c) => c.ticker).filter(Boolean),
              seleccionado: shownTicker || undefined,
              overrides: Object.fromEntries(
                Object.entries(overrides).map(([tk, ov]) => [
                  tk,
                  { high: parseFloat(ov.h), low: parseFloat(ov.l), close: parseFloat(ov.c) },
                ]),
              ),
              posiciones,
            };
          }}
        />
      </div>

      {/* Toasts del vigía (esquina inferior izquierda) */}
      {vigiaAlertas.length > 0 && (
        <div className="fixed bottom-4 left-4 z-40 flex flex-col gap-2 w-[380px] max-w-[90vw]">
          {vigiaAlertas.map((a) => (
            <div
              key={a.id}
              className="border border-[var(--t-accent)] bg-[var(--t-panel)] px-3 py-2 text-[11px] shadow-lg"
            >
              <div className="flex items-start gap-2">
                <span>🔔</span>
                <span className="flex-1">{a.mensaje}</span>
                <button
                  onClick={() => vigiaDescartar(a.id)}
                  className="text-[var(--t-text-dim)] hover:text-[var(--t-neg)] leading-none"
                  title="Descartar por hoy"
                >
                  ×
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  onClick={() => vigiaMirar(a)}
                  className="px-2 py-0.5 text-[9px] font-semibold border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)] hover:text-[var(--t-on-accent)] transition-colors"
                >
                  ¿LO MIRAMOS?
                </button>
                {a.accion_agregar && (
                  <button
                    onClick={() => {
                      loadTicker(a.accion_agregar!);
                      vigiaDescartar(a.id);
                    }}
                    className="px-2 py-0.5 text-[9px] font-semibold border border-[var(--t-border)] text-[var(--t-text-dim)] hover:border-[var(--t-accent)] hover:text-[var(--t-accent)] transition-colors"
                  >
                    ➕ AGREGAR {a.accion_agregar}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* split 60 (cards) / 40 (chart + tape) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-2">
        {/* izquierda: cards (arriba, 4/fila × 3 filas, llenan el alto) + order book (abajo) */}
        <div className="min-h-0 grid grid-rows-[7fr_3fr] gap-2">
          {/* Filas con altura MÍNIMA (170px = card completa hasta S3): en un
              monitor grande siguen llenando el alto (1fr); en uno chico ya no
              se aplastan — el contenedor scrollea y se ve la card entera. */}
          <div className="min-h-0 grid grid-cols-4 auto-rows-[minmax(170px,1fr)] gap-1.5 overflow-y-auto">
          {cards.map((c) => (
            <PivotCard
              key={c.id}
              ticker={c.ticker}
              row={c.ticker ? byTicker.get(c.ticker) : undefined}
              mode={mode}
              universo={universo}
              selected={!!c.ticker && c.ticker === shownTicker}
              override={c.ticker ? overrides[c.ticker] : undefined}
              onPick={(tk) => setTicker(c.id, tk)}
              onSelect={() => c.ticker && setSelected(c.ticker)}
              onEdit={(ov) => c.ticker && setOverride(c.ticker, ov)}
              onResetEdit={() => c.ticker && setOverride(c.ticker, null)}
            />
          ))}
          </div>
          {/* abajo izquierda: order book (mayor parte) + time sales (slice) */}
          <div className="min-h-0 grid grid-cols-[13fr_7fr] gap-2">
            <OrderBookPanel key={shownTicker} ticker={shownTicker} />
            <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
              <CedearsTimeSalesPanel ticker={shownTicker || null} compact />
            </div>
          </div>
        </div>

        {/* derecha: chart LIVE full arriba (60%) / radar hot-movers abajo (40%) */}
        <div className="min-h-0 hidden lg:grid grid-rows-[3fr_2fr] gap-2">
          {/* chart live — ocupa todo el ancho (ya no comparte con el tape) */}
          <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col">
            <div className="px-2 py-1 border-b border-[var(--t-border)] shrink-0 text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
              Live <span className="text-[var(--t-text-muted)] font-mono ml-1 normal-case">{shownTicker || "—"}</span>
            </div>
            <div className="flex-1 min-h-0">
              {shownTicker ? (
                <LiveIntradayChart
                  ticker={shownTicker}
                  pivots={shownPivots}
                  vwap={byTicker.get(shownTicker)?.vwap ?? null}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-muted)]">
                  elegí una card
                </div>
              )}
            </div>
          </div>
          {/* radar con 2 tabs: MOVERS ±4% + PIVOTES (proximidad a pivote) */}
          <TradingRadarPanel onSelect={loadTicker} selectedTicker={shownTicker || null} />
        </div>
      </div>
    </div>
  );
}

function PivotCard({
  ticker,
  row,
  mode,
  universo,
  selected,
  override,
  onPick,
  onSelect,
  onEdit,
  onResetEdit,
}: {
  ticker: string;
  row: PivotRow | undefined;
  mode: PivotMode;
  universo: UniversoItem[];
  selected: boolean;
  override: Ov | undefined;
  onPick: (ticker: string) => void;
  onSelect: () => void;
  onEdit: (ov: Ov) => void;
  onResetEdit: () => void;
}) {
  const last = row?.last ?? null;
  const vwap = row?.vwap ?? null;

  // máx/mín/cierre: el override (editado a mano) lo guarda el padre y persiste en
  // localStorage. Sin override → sigue al server. Editar → llama onEdit (persiste).
  const srv: Ov = {
    h: row?.high != null ? String(row.high) : "",
    l: row?.low != null ? String(row.low) : "",
    c: row?.close != null ? String(row.close) : "",
  };
  const eff = override ?? srv;
  const setField = (k: "h" | "l" | "c", val: string) =>
    onEdit({ ...(override ?? srv), [k]: val });

  const h = parseFloat(eff.h);
  const l = parseFloat(eff.l);
  const c = parseFloat(eff.c);
  const piv =
    Number.isFinite(h) && Number.isFinite(l) && Number.isFinite(c) ? calcPivots(h, l, c) : null;

  return (
    <div
      onMouseDown={onSelect}
      className={
        "bg-[var(--t-panel)] flex flex-col min-w-0 min-h-0 overflow-hidden border cursor-pointer " +
        (selected ? "border-[var(--t-accent)]" : "border-[var(--t-border)]")
      }
    >
      {/* header: selector + last */}
      <div className="flex items-center gap-1 px-1.5 py-0.5 border-b border-[var(--t-border)] shrink-0">
        <CedearPicker value={ticker} universo={universo} onPick={onPick} />
        {override && (
          <button
            type="button"
            onClick={onResetEdit}
            className="text-[8px] font-semibold text-[var(--t-accent)] hover:underline"
            title="Editado a mano — volver a los valores reales del mercado"
          >
            editado ↺
          </button>
        )}
        <div className="flex flex-col items-end ml-auto leading-none gap-0.5">
          <div className="flex items-baseline gap-1">
            <span className="text-[8px] text-[var(--t-text-muted)]">last</span>
            <span className="text-[var(--t-accent)] font-bold tabular-nums text-[11px]">
              {last !== null ? fmtPrecio(last) : "—"}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[8px] text-[var(--t-text-muted)]">vwap</span>
            <span className="font-bold tabular-nums text-[10px]" style={{ color: VWAP_COLOR }}>
              {vwap != null ? fmtPrecio(vwap) : "—"}
            </span>
          </div>
        </div>
      </div>

      {/* cuerpo */}
      {!ticker ? (
        <div className="flex items-center justify-center py-3 text-[10px] text-[var(--t-text-muted)]">
          elegí un activo
        </div>
      ) : !piv && (!row || row.sin_datos) ? (
        <div className="flex items-center justify-center py-3 text-[10px] text-[var(--t-text-muted)] text-center px-2">
          esperando la primera rueda guardada
          <br />
          (o cargá máx/mín/cierre a mano)
        </div>
      ) : (
        <div className="overflow-hidden">
          <table className="w-full text-[10px] leading-none tabular-nums">
            <tbody>
              {/* máx / mín / cierre — EDITABLES */}
              {([
                ["máximo", "h"],
                ["mínimo", "l"],
                ["cierre", "c"],
              ] as const).map(([label, k]) => (
                <tr key={k} className="border-b border-[var(--t-border)]">
                  <td className="px-1.5 py-[1px] font-semibold text-[var(--t-text-dim)]">{label}</td>
                  <td className="px-1 py-0 text-right">
                    <input
                      value={eff[k]}
                      onChange={(e) => setField(k, e.target.value)}
                      inputMode="decimal"
                      className="w-full bg-transparent border border-transparent hover:border-[var(--t-border-2)] focus:border-[var(--t-accent)] outline-none text-right tabular-nums px-1 py-[1px] text-[var(--t-text)]"
                    />
                  </td>
                </tr>
              ))}
              {/* niveles — letra OSCURA (var --t-text) sobre la banda de color, como la planilla */}
              {NIVELES.map((n) => (
                <tr key={n.key} style={{ backgroundColor: BG[n.kind] }}>
                  <td className="px-1.5 py-[1px] font-bold text-[var(--t-text)]">{n.label}</td>
                  <td className="px-1.5 py-[1px] text-right font-semibold text-[var(--t-text)]">
                    {piv ? valorNivel(piv[n.key], last, mode) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── KPIs del toolbar: CCL + SPY + QQQ (referencia de mercado) ─────────────────
// SPY/QQQ salen del tablero REUTERS (feed real-time de la oficina) — antes
// venían de la watchlist de HOME (fuente externa, menos fresca).
interface ReutersQuote {
  ticker: string;
  last: number | null;
  var_pct: number | null;
}

function MarketKpis() {
  const { data: ccl } = usePoll<{ value: number | null; vs_1d_pct: number | null }>(
    "/api/scanner/ccl",
    { value: null, vs_1d_pct: null },
    5_000,
    { fetchOnMount: true },
  );
  const { data: quotes } = usePoll<ReutersQuote[]>(
    "/api/trading/reuters",
    [],
    5_000,
    { fetchOnMount: true },
  );
  const spy = quotes?.find?.((q) => q.ticker === "SPY");
  const qqq = quotes?.find?.((q) => q.ticker === "QQQ");
  return (
    <div className="flex items-center gap-3 ml-auto text-[11px]">
      <Kpi label="CCL" value={ccl.value} pct={ccl.vs_1d_pct} />
      <Kpi label="SPY" value={spy?.last ?? null} pct={spy?.var_pct ?? null} />
      <Kpi label="QQQ" value={qqq?.last ?? null} pct={qqq?.var_pct ?? null} />
    </div>
  );
}

function Kpi({ label, value, pct }: { label: string; value: number | null; pct: number | null }) {
  const cls =
    pct == null
      ? "text-[var(--t-text-muted)]"
      : pct >= 0
        ? "text-[var(--t-pos)]"
        : "text-[var(--t-neg)]";
  return (
    <span className="flex items-baseline gap-1">
      <span className="text-[var(--t-text-muted)] font-semibold">{label}</span>
      <b className="tabular-nums">
        {value != null ? value.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "—"}
      </b>
      <span className={"tabular-nums " + cls}>
        {pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—"}
      </span>
    </span>
  );
}

function CedearPicker({
  value,
  universo,
  onPick,
}: {
  value: string;
  universo: UniversoItem[];
  onPick: (ticker: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const hits = useMemo(() => {
    const term = q.trim().toUpperCase();
    if (!term) return universo.slice(0, 30);
    return universo
      .filter(
        (u) =>
          u.ticker_corto?.toUpperCase().includes(term) ||
          u.nombre?.toUpperCase().includes(term),
      )
      .slice(0, 30);
  }, [q, universo]);

  return (
    <div className="relative">
      <input
        value={open ? q : value}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="activo…"
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-1 py-0.5 text-[10px] w-[72px] font-mono uppercase focus:border-[var(--t-accent)] outline-none"
      />
      {open && hits.length > 0 && (
        <div className="absolute top-full left-0 mt-0.5 bg-[var(--t-surface)] border border-[var(--t-border-2)] z-20 max-h-[220px] overflow-y-auto min-w-[220px] text-[10px]">
          {hits.map((hit) => (
            <div
              key={hit.ticker_corto}
              onMouseDown={() => {
                onPick(hit.ticker_corto);
                setOpen(false);
              }}
              className="px-2 py-0.5 hover:bg-[var(--t-border)] cursor-pointer font-mono flex gap-2 items-center"
            >
              <span className="text-[var(--t-text)] w-12">{hit.ticker_corto}</span>
              <span className="text-[var(--t-text-muted)] truncate flex-1">{hit.nombre}</span>
              {hit.clase === "bono" && (
                <span className="text-[8px] font-semibold text-[var(--t-accent)] border border-[var(--t-border-2)] px-1 shrink-0">
                  BONO
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
