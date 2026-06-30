"use client";

import { useEffect, useMemo, useState } from "react";

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
  R: "rgba(16,163,74,0.14)",
  S: "rgba(220,38,38,0.14)",
  PP: "rgba(130,130,130,0.18)",
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

// Valor a mostrar para un nivel según el modo global.
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

  // persistir cards al cambiar
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
        {/* izquierda: 4 cards 2×2 */}
        <div className="min-h-0 overflow-y-auto grid grid-cols-1 xl:grid-cols-2 gap-2 auto-rows-min content-start">
          {cards.map((c) => (
            <PivotCard
              key={c.id}
              ticker={c.ticker}
              row={c.ticker ? byTicker.get(c.ticker) : undefined}
              mode={mode}
              universo={universo}
              onPick={(tk) => setTicker(c.id, tk)}
            />
          ))}
        </div>

        {/* derecha: vacío por ahora */}
        <div className="min-h-0 hidden lg:flex items-center justify-center border border-dashed border-[var(--t-border)] rounded-sm text-[11px] text-[var(--t-text-muted)]">
          (próximamente)
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
  onPick,
}: {
  ticker: string;
  row: PivotRow | undefined;
  mode: PivotMode;
  universo: UniversoItem[];
  onPick: (ticker: string) => void;
}) {
  const last = row?.last ?? null;
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)] flex flex-col min-w-0 w-full">
      {/* header: selector + last */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--t-border)]">
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
        <div className="flex-1 flex items-center justify-center py-6 text-[10px] text-[var(--t-text-muted)]">
          elegí un CEDEAR
        </div>
      ) : !row || row.sin_datos || !row.pivots ? (
        <div className="flex-1 flex items-center justify-center py-6 text-[10px] text-[var(--t-text-muted)] text-center px-2">
          esperando la primera rueda guardada
          <br />
          (los pivots aparecen tras el cierre)
        </div>
      ) : (
        <PivotBlock row={row} mode={mode} />
      )}
    </div>
  );
}

function PivotBlock({ row, mode }: { row: PivotRow; mode: PivotMode }) {
  const piv = row.pivots!;
  const last = row.last ?? null;
  const refs: [string, number | undefined][] = [
    ["máximo", row.high],
    ["mínimo", row.low],
    ["cierre", row.close],
  ];
  return (
    <table className="w-full text-[11px] tabular-nums">
      <tbody>
        {/* máx / mín / cierre — siempre en precio */}
        {refs.map(([label, v]) => (
          <tr key={label} className="border-b border-[var(--t-border)]">
            <td className="px-2 py-0.5 font-semibold text-[var(--t-text-dim)]">{label}</td>
            <td className="px-2 py-0.5 text-right">{v != null ? fmtPrecio(v) : "—"}</td>
          </tr>
        ))}
        {/* niveles */}
        {NIVELES.map((n) => {
          const color =
            n.kind === "R"
              ? "var(--t-pos)"
              : n.kind === "S"
                ? "var(--t-neg)"
                : "var(--t-text)";
          return (
            <tr key={n.key} style={{ backgroundColor: BG[n.kind] }}>
              <td className="px-2 py-0.5 font-bold" style={{ color }}>
                {n.label}
              </td>
              <td className="px-2 py-0.5 text-right font-semibold" style={{ color }}>
                {valorNivel(piv[n.key], last, mode)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
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
          {hits.map((h) => (
            <div
              key={h.ticker_corto}
              onMouseDown={() => {
                onPick(h.ticker_corto);
                setOpen(false);
              }}
              className="px-2 py-0.5 hover:bg-[var(--t-border)] cursor-pointer font-mono flex gap-2"
            >
              <span className="text-[var(--t-text)] w-12">{h.ticker_corto}</span>
              <span className="text-[var(--t-text-muted)] truncate">{h.nombre}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
