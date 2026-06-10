"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CedearScannerRow } from "@/lib/types-scanner";
import type { Direccion, UniversoItem } from "@/lib/types-estrategia";

/**
 * Átomos compartidos por las tabs de la Mesa de Estrategia (TRADE LAB,
 * BOOK & RIESGO, CORRELACIONES): universo de tickers, buscador con
 * teclado, barras de magnitud/correlación, chips y formatters.
 */

// ─────────────────────────────────────────────────────────────────────
// Datos
// ─────────────────────────────────────────────────────────────────────

/**
 * Universo de Renta Variable (ticker + nombre + sector) desde
 * /api/scanner/cedears. Un fetch al montar — el master cambia poco.
 */
export function useUniverso(): { universo: UniversoItem[]; loading: boolean } {
  const [universo, setUniverso] = useState<UniversoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/scanner/cedears", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: CedearScannerRow[]) => {
        if (!alive) return;
        const items = (rows ?? [])
          .filter((r) => r.ticker_corto)
          .map((r) => ({
            ticker: r.ticker_corto.toUpperCase(),
            nombre: r.nombre,
            sector: r.sector,
          }))
          .sort((a, b) => a.ticker.localeCompare(b.ticker));
        setUniverso(items);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { universo, loading };
}

/** Valor debounced — para no disparar un fetch por cada tecla. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

// ─────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────

/** "+12.3%" / "−4.5%" — pct con signo. null → "--". */
export function fmtPctSigned(v: number | null | undefined, dec = 1): string {
  if (v == null || !isFinite(v)) return "--";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

/** "42.3%" — pct sin signo. null → "--". */
export function fmtPct(v: number | null | undefined, dec = 1): string {
  if (v == null || !isFinite(v)) return "--";
  return `${v.toFixed(dec)}%`;
}

/** Número plano con decimales fijos. null → "--". */
export function fmtNum(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return "--";
  return v.toFixed(dec);
}

/** "+2.13 σ" coloreado por extremidad (|z|≥3 rojo, ≥2 naranja, <2 verde). */
export function zClass(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "text-[var(--t-text-muted)]";
  const a = Math.abs(v);
  if (a >= 3) return "text-[var(--t-neg)]";
  if (a >= 2) return "text-[var(--t-accent)]";
  return "text-[var(--t-pos)]";
}

// ─────────────────────────────────────────────────────────────────────
// Micro-componentes visuales
// ─────────────────────────────────────────────────────────────────────

/** Barra horizontal simple 0..100 (porcentaje de `max`). */
export function MiniBar({
  value,
  max,
  className = "bg-[var(--t-accent)]/60",
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(Math.abs(value) / max, 1) * 100 : 0;
  return (
    <span className="inline-block w-full h-[5px] bg-[var(--t-border)] align-middle">
      <span
        className={`block h-full ${className}`}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

/**
 * Barra de correlación con signo, centrada en 0: ρ>0 crece a la derecha
 * (rojo = mismo riesgo), ρ<0 a la izquierda (azul = diversifica).
 */
export function CorrBar({ value }: { value: number }) {
  const half = Math.min(Math.abs(value), 1) * 50; // % de la mitad
  const pos = value >= 0;
  return (
    <span className="relative inline-block w-full h-[6px] bg-[var(--t-border)] align-middle">
      {/* eje 0 al centro */}
      <span className="absolute left-1/2 top-0 h-full w-px bg-[var(--t-border-2)]" />
      <span
        className={`absolute top-0 h-full ${pos ? "bg-[#ff4444]/70" : "bg-[#4080ff]/70"}`}
        style={pos ? { left: "50%", width: `${half}%` } : { right: "50%", width: `${half}%` }}
      />
    </span>
  );
}

/** Chip LONG (verde) / SHORT (rojo). */
export function AccionChip({ accion }: { accion: Direccion }) {
  const long = accion === "long";
  return (
    <span
      className={`inline-block px-1.5 py-px text-[9px] font-bold tracking-widest border ${
        long
          ? "text-[var(--t-pos)] border-[var(--t-pos)]/40 bg-[var(--t-pos)]/10"
          : "text-[var(--t-neg)] border-[var(--t-neg)]/40 bg-[var(--t-neg)]/10"
      }`}
    >
      {long ? "LONG" : "SHORT"}
    </span>
  );
}

/** Tarjeta KPI: label chico arriba, número grande mono, sub-línea dim. */
export function KpiCard({
  label,
  value,
  sub,
  valueClass = "text-[var(--t-text)]",
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-surface)] px-3 py-2 min-w-0">
      <div className="text-[9px] font-semibold tracking-widest text-[var(--t-text-muted)] uppercase truncate">
        {label}
      </div>
      <div className={`text-[17px] leading-6 font-semibold tabular-nums truncate ${valueClass}`}>
        {value}
      </div>
      {sub !== undefined && (
        <div className="text-[9px] text-[var(--t-text-dim)] tabular-nums truncate">{sub}</div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Buscador de tickers (combobox con teclado)
// ─────────────────────────────────────────────────────────────────────

export function TickerSearch({
  universo,
  onSelect,
  placeholder = "Buscar ticker…",
  autoFocus = false,
}: {
  universo: UniversoItem[];
  onSelect: (ticker: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0); // índice resaltado
  const boxRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return universo.slice(0, 12);
    const starts = universo.filter((u) => u.ticker.startsWith(q));
    const contains = universo.filter(
      (u) =>
        !u.ticker.startsWith(q) &&
        (u.ticker.includes(q) ||
          (u.nombre ?? "").toUpperCase().includes(q) ||
          (u.sector ?? "").toUpperCase().includes(q)),
    );
    return [...starts, ...contains].slice(0, 12);
  }, [universo, query]);

  // Cerrar al clickear afuera.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (tk: string) => {
    onSelect(tk);
    setQuery("");
    setOpen(false);
    setHi(0);
  };

  return (
    <div ref={boxRef} className="relative min-w-[220px]">
      <input
        value={query}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && matches[hi]) pick(matches[hi].ticker);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="w-full bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-1 text-[11px] text-[var(--t-text)] placeholder-[var(--t-text-muted)] outline-none focus:border-[var(--t-accent)] font-mono uppercase"
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-px z-40 bg-[var(--t-panel)] border border-[var(--t-border-2)] shadow-xl max-h-[260px] overflow-y-auto">
          {matches.map((u, i) => (
            <button
              key={u.ticker}
              type="button"
              onMouseDown={(e) => {
                // mousedown (no click) para ganarle al blur del input.
                e.preventDefault();
                pick(u.ticker);
              }}
              onMouseEnter={() => setHi(i)}
              className={`w-full text-left px-2 py-1 text-[11px] flex items-baseline gap-2 ${
                i === hi ? "bg-[var(--t-accent)]/15" : ""
              }`}
            >
              <span className="font-mono font-semibold text-[var(--t-accent)] w-[52px] shrink-0">
                {u.ticker}
              </span>
              <span className="text-[var(--t-text-dim)] truncate flex-1">
                {u.nombre ?? "—"}
              </span>
              <span className="text-[9px] text-[var(--t-text-muted)] shrink-0">
                {u.sector ?? ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
