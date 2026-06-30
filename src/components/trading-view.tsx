"use client";

import { useEffect, useMemo, useState } from "react";

import { CedearsTimeSalesPanel } from "@/components/cedears-timesales-panel";
import { LiveIntradayChart } from "@/components/live-intraday-chart";
import { usePoll } from "@/lib/use-poll";
import type {
  PivotLevels,
  PivotMode,
  PivotRow,
  UniversoItem,
} from "@/lib/types-trading";

const POLL_MS = 4_000;
const LS_CARDS = "trd-fx-trading-pivot-cards-v1";

type Card = { id: string; ticker: string };

const DEFAULT_CARDS: Card[] = [
  { id: "c1", ticker: "RKLB" },
  { id: "c2", ticker: "SNDK" },
  { id: "c3", ticker: "ASTS" },
  { id: "c4", ticker: "" },
];

// Lazy init desde localStorage (guard SSR — mismo patrón que el módulo de órdenes).
function loadCards(): Card[] {
  if (typeof window === "undefined") return DEFAULT_CARDS;
  try {
    const raw = window.localStorage.getItem(LS_CARDS);
    if (raw) {
      const arr = JSON.parse(raw) as Card[];
      if (Array.isArray(arr) && arr.length) return arr.slice(0, 4);
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
  if (mode === "dif") return fmtDif(last - p);
  return p !== 0 ? fmtPct(((last - p) / p) * 100) : "—";
}

export function TradingView() {
  const [mode, setMode] = useState<PivotMode>("precio");
  const [cards, setCards] = useState<Card[]>(loadCards);
  const [universo, setUniverso] = useState<UniversoItem[]>([]);
  const [selected, setSelected] = useState<string>("");

  // CEDEAR que manda el chart + time sales: la card marcada, o la primera con ticker.
  const shownTicker =
    selected && cards.some((c) => c.ticker === selected)
      ? selected
      : cards.find((c) => c.ticker)?.ticker || "";

  useEffect(() => {
    saveCards(cards);
  }, [cards]);

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

  function setTicker(id: string, ticker: string) {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ticker: ticker.toUpperCase() } : c)));
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
      </div>

      {/* split 50 / 50 */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-2">
        {/* izquierda: 4 cards en 2×2 que LLENAN el alto */}
        <div className="min-h-0 grid grid-cols-2 grid-rows-2 gap-2">
          {cards.map((c) => (
            <PivotCard
              key={`${c.id}:${c.ticker}`}
              ticker={c.ticker}
              row={c.ticker ? byTicker.get(c.ticker) : undefined}
              mode={mode}
              universo={universo}
              selected={!!c.ticker && c.ticker === shownTicker}
              onPick={(tk) => setTicker(c.id, tk)}
              onSelect={() => c.ticker && setSelected(c.ticker)}
            />
          ))}
        </div>

        {/* derecha: 60% arriba (chart + tape) / 40% abajo (vacío) */}
        <div className="min-h-0 hidden lg:grid grid-rows-[3fr_2fr] gap-2">
          <div className="min-h-0 grid grid-cols-[3fr_2fr] gap-2">
            {/* chart live */}
            <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col">
              <div className="px-2 py-1 border-b border-[var(--t-border)] shrink-0 text-[10px] uppercase tracking-widest text-[var(--t-accent)]">
                Live <span className="text-[var(--t-text-muted)] font-mono ml-1 normal-case">{shownTicker || "—"}</span>
              </div>
              <div className="flex-1 min-h-0">
                {shownTicker ? (
                  <LiveIntradayChart ticker={shownTicker} />
                ) : (
                  <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-muted)]">
                    elegí una card
                  </div>
                )}
              </div>
            </div>
            {/* time sales compacto (hora + precio) */}
            <div className="min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden">
              <CedearsTimeSalesPanel ticker={shownTicker || null} compact />
            </div>
          </div>
          {/* 40% abajo: vacío */}
          <div className="min-h-0 border border-dashed border-[var(--t-border)] rounded-sm flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">
            (próximamente)
          </div>
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
  onPick,
  onSelect,
}: {
  ticker: string;
  row: PivotRow | undefined;
  mode: PivotMode;
  universo: UniversoItem[];
  selected: boolean;
  onPick: (ticker: string) => void;
  onSelect: () => void;
}) {
  const last = row?.last ?? null;

  // máx/mín/cierre editables. `ov` = override del usuario (null → sigue al server).
  // La card remonta al cambiar de ticker (key incluye el ticker) → ov se resetea.
  const [ov, setOv] = useState<{ h: string; l: string; c: string } | null>(null);
  const srv = {
    h: row?.high != null ? String(row.high) : "",
    l: row?.low != null ? String(row.low) : "",
    c: row?.close != null ? String(row.close) : "",
  };
  const eff = ov ?? srv;
  const setField = (k: "h" | "l" | "c", val: string) =>
    setOv((o) => ({ ...(o ?? srv), [k]: val }));

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
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--t-border)] shrink-0">
        <CedearPicker value={ticker} universo={universo} onPick={onPick} />
        <div className="flex items-baseline gap-1 ml-auto">
          <span className="text-[9px] text-[var(--t-text-muted)]">last</span>
          <span className="text-[var(--t-accent)] font-bold tabular-nums text-[12px]">
            {last !== null ? fmtPrecio(last) : "—"}
          </span>
        </div>
      </div>

      {/* cuerpo */}
      {!ticker ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--t-text-muted)]">
          elegí un CEDEAR
        </div>
      ) : !piv && (!row || row.sin_datos) ? (
        <div className="flex-1 flex items-center justify-center text-[10px] text-[var(--t-text-muted)] text-center px-2">
          esperando la primera rueda guardada
          <br />
          (o cargá máx/mín/cierre a mano)
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-[11px] tabular-nums">
            <tbody>
              {/* máx / mín / cierre — EDITABLES */}
              {([
                ["máximo", "h"],
                ["mínimo", "l"],
                ["cierre", "c"],
              ] as const).map(([label, k]) => (
                <tr key={k} className="border-b border-[var(--t-border)]">
                  <td className="px-2 py-1 font-semibold text-[var(--t-text-dim)]">{label}</td>
                  <td className="px-1 py-0.5 text-right">
                    <input
                      value={eff[k]}
                      onChange={(e) => setField(k, e.target.value)}
                      inputMode="decimal"
                      className="w-full bg-transparent border border-transparent hover:border-[var(--t-border-2)] focus:border-[var(--t-accent)] outline-none text-right tabular-nums px-1 py-0.5 text-[var(--t-text)]"
                    />
                  </td>
                </tr>
              ))}
              {/* niveles — letra OSCURA (var --t-text) sobre la banda de color, como la planilla */}
              {NIVELES.map((n) => (
                <tr key={n.key} style={{ backgroundColor: BG[n.kind] }}>
                  <td className="px-2 py-1 font-bold text-[var(--t-text)]">{n.label}</td>
                  <td className="px-2 py-1 text-right font-semibold text-[var(--t-text)]">
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
        placeholder="CEDEAR…"
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] w-[100px] font-mono uppercase focus:border-[var(--t-accent)] outline-none"
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
              className="px-2 py-0.5 hover:bg-[var(--t-border)] cursor-pointer font-mono flex gap-2"
            >
              <span className="text-[var(--t-text)] w-12">{hit.ticker_corto}</span>
              <span className="text-[var(--t-text-muted)] truncate">{hit.nombre}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
