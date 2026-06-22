"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { shortTicker, fmtNum } from "./ui";

interface RentaFijaDoc {
  instrumento: string;
  metrics?: {
    last_price?: number;
    vwap?: number;
    total_nominals?: number;
  };
}

interface Trade {
  ticker: string;
  timestamp: string;
  price: number;
  size: number;
  side?: string;
}

export function LibroPanel({ data }: { data: RentaFijaDoc[] }) {
  const tickers = useMemo(
    () =>
      data
        .filter((r) => r.metrics?.last_price)
        .sort(
          (a, b) =>
            (b.metrics?.total_nominals || 0) - (a.metrics?.total_nominals || 0)
        )
        .map((r) => r.instrumento),
    [data]
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const effectiveSelected = selected ?? (tickers.length > 0 ? tickers[0] : null);

  const selectedShort = effectiveSelected ? shortTicker(effectiveSelected) : "";

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tickers.filter((t) => shortTicker(t).toLowerCase().includes(q));
  }, [tickers, search]);

  const pickTicker = useCallback(
    (t: string) => {
      setSelected(t);
      setSearch("");
      setOpen(false);
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !inputRef.current?.contains(e.target as Node) &&
        !dropRef.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!effectiveSelected) return;
    let cancelled = false;

    async function fetchTrades() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/trades?instrumento=${encodeURIComponent(effectiveSelected!)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const json: Trade[] = await res.json();
        if (cancelled) return;
        setTrades(Array.isArray(json) ? json : []);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchTrades();
    const id = setInterval(fetchTrades, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [effectiveSelected]);

  // vwap memo removido junto con el chart — ya no se grafica la línea VWAP.

  const { todayTrades, sessionLabel } = useMemo(() => {
    // SOLO trades de HOY — sin fallback a sesiones viejas (pedido de la mesa). Si un
    // bono no operó hoy, el tape queda vacío.
    if (trades.length === 0) return { todayTrades: [], sessionLabel: "HOY" };
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const today = trades
      .filter((t) => new Date(t.timestamp).getTime() >= startOfDay)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return { todayTrades: today, sessionLabel: "HOY" };
  }, [trades]);

  const tapeTrades = useMemo(() => {
    return [...todayTrades].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [todayTrades]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] text-[var(--t-text-muted)] tracking-wide">TICKER</span>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={open ? search : selectedShort}
            placeholder={selectedShort || "buscar…"}
            onFocus={() => { setSearch(""); setOpen(true); }}
            onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && filtered.length > 0) pickTicker(filtered[0]);
            }}
            className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-accent)] text-[11px] px-2 py-0.5 font-mono focus:border-[var(--t-accent)] outline-none w-[140px]"
          />
          {open && filtered.length > 0 && (
            <div
              ref={dropRef}
              className="absolute top-full left-0 mt-px z-50 bg-[var(--t-surface)] border border-[var(--t-border-2)] max-h-[200px] overflow-y-auto min-w-full"
            >
              {filtered.map((t) => (
                <div
                  key={t}
                  onMouseDown={() => pickTicker(t)}
                  className={`px-2 py-0.5 text-[11px] font-mono cursor-pointer hover:bg-[var(--t-accent)]/10 ${
                    t === effectiveSelected ? "text-[var(--t-accent)]" : "text-[var(--t-text)]"
                  }`}
                >
                  {shortTicker(t)}
                </div>
              ))}
            </div>
          )}
        </div>
        {loading && (
          <span className="text-[10px] text-[var(--t-text-muted)]">cargando…</span>
        )}
        <span className="ml-auto text-[10px] text-[var(--t-text-muted)]">
          {todayTrades.length} trades {sessionLabel.toLowerCase()}
        </span>
      </div>

      {/* El chart fue removido por pedido de la mesa — ocupaba mucho
          espacio en un panel chico (~50%×50% de pantalla) y el eje X no
          se entendía. Time & Sales solo, full width. */}
      <div className="flex-1 min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)] overflow-hidden flex flex-col">
        <div className="flex items-center px-2 py-1 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10">
          <span className="text-[10px] text-[var(--t-accent)] tracking-wide font-semibold">
            TIME &amp; SALES
          </span>
          {sessionLabel && sessionLabel !== "HOY" && (
            <span className="ml-auto text-[9px] text-[var(--t-text-dim)]">
              {sessionLabel}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          <TimeSalesTape trades={tapeTrades} />
        </div>
      </div>
    </div>
  );
}

// LastMinutesChart removido — el chart ocupaba demasiado espacio en un
// Panel chico (~50%×50% de pantalla) y el eje X de horas no era legible.
// Time & Sales ahora usa todo el ancho disponible.

function TimeSalesTape({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-[var(--t-text-muted)] text-[10px]">
        SIN TRADES HOY
      </div>
    );
  }

  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
        <tr className="border-b border-[var(--t-border)]">
          <th className="text-left px-1.5 py-0.5 text-[var(--t-text-muted)] font-normal">
            HORA
          </th>
          <th className="text-right px-1.5 py-0.5 text-[var(--t-text-muted)] font-normal">
            PRECIO
          </th>
          <th className="text-right px-1.5 py-0.5 text-[var(--t-text-muted)] font-normal">
            VN
          </th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t, i) => {
          const side = (t.side || "").toUpperCase();
          const color =
            side === "BUY"
              ? "text-[var(--t-pos)]"
              : side === "SELL"
              ? "text-[var(--t-neg)]"
              : "text-[var(--t-text)]";
          const d = new Date(t.timestamp);
          const hora = `${String(d.getHours()).padStart(2, "0")}:${String(
            d.getMinutes()
          ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
          return (
            <tr
              key={`${t.timestamp}-${i}`}
              className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5"
            >
              <td className="px-1.5 py-0.5 text-[var(--t-text-dim)]">{hora}</td>
              <td className={`px-1.5 py-0.5 text-right font-semibold ${color}`}>
                {fmtNum(t.price)}
              </td>
              <td className="px-1.5 py-0.5 text-right text-[var(--t-text-dim)]">
                {fmtNum(t.size)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
