"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface Quote {
  symbol: string;
  type: "stock" | "forex";
  grupo?: string;
  last: number | null;
  prev_close: number | null;
  pct_day: number | null;
  updated_at?: string;
}

const POLL_MS = 30_000;

function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 10) return v.toFixed(2);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

const FILTROS_ORDER = ["Índices", "Regiones", "Commodities", "Monedas"];

export function WatchlistPanel() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [filtro, setFiltro] = useState<string>("all");

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/market/quotes", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Quote[] = await res.json();
      setQuotes(Array.isArray(data) ? data : []);
      setLastFetch(new Date());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
    const iv = setInterval(fetchQuotes, POLL_MS);
    return () => clearInterval(iv);
  }, [fetchQuotes]);

  // Filtros disponibles (solo grupos que realmente tienen tickers)
  const gruposPresentes = useMemo(() => {
    const set = new Set<string>();
    for (const q of quotes) {
      const g = q.grupo || (q.type === "forex" ? "Monedas" : "Otros");
      set.add(g);
    }
    return Array.from(set).sort(
      (a, b) =>
        (FILTROS_ORDER.indexOf(a) === -1 ? 99 : FILTROS_ORDER.indexOf(a)) -
        (FILTROS_ORDER.indexOf(b) === -1 ? 99 : FILTROS_ORDER.indexOf(b)),
    );
  }, [quotes]);

  const visibles = useMemo(() => {
    const src = filtro === "all"
      ? quotes
      : quotes.filter((q) => (q.grupo || (q.type === "forex" ? "Monedas" : "Otros")) === filtro);
    return src
      .slice()
      .sort((a, b) => {
        const ga = a.grupo || "Otros";
        const gb = b.grupo || "Otros";
        const oa = FILTROS_ORDER.indexOf(ga);
        const ob = FILTROS_ORDER.indexOf(gb);
        const da = oa === -1 ? 99 : oa;
        const db = ob === -1 ? 99 : ob;
        if (da !== db) return da - db;
        return a.symbol.localeCompare(b.symbol);
      });
  }, [quotes, filtro]);

  return (
    <div className="h-full flex flex-col min-h-0 border border-[#1a1a1a] bg-[#080808]">
      <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
          Watchlist
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: loading ? "#ff9900" : "#00cc66" }}
        />
        <span className="text-[9px] text-[#555555] tracking-wide uppercase">
          {lastFetch
            ? `${lastFetch.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
            : "—"}
        </span>
        <span className="text-[9px] text-[#555555]">· poll 30s</span>
        <span className="ml-auto text-[9px] text-[#555555]">{visibles.length}/{quotes.length}</span>
      </div>

      {/* Chips de filtro */}
      <div className="px-2 py-1.5 border-b border-[#1a1a1a] flex flex-wrap items-center gap-1 shrink-0">
        <button
          onClick={() => setFiltro("all")}
          className={`px-2 py-0.5 text-[9px] font-mono border uppercase tracking-wide ${
            filtro === "all"
              ? "bg-[#ff9900] text-black border-[#ff9900]"
              : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
          }`}
        >
          Todos
        </button>
        {gruposPresentes.map((g) => (
          <button
            key={g}
            onClick={() => setFiltro(g)}
            className={`px-2 py-0.5 text-[9px] font-mono border uppercase tracking-wide ${
              filtro === g
                ? "bg-[#ff9900] text-black border-[#ff9900]"
                : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {error && (
          <div className="px-3 py-2 text-[10px] text-[#ff3333] font-mono">Error: {error}</div>
        )}
        {!loading && quotes.length === 0 && !error && (
          <div className="px-3 py-6 text-[11px] text-[#555555] text-center font-mono">
            Watchlist vacía. Correr una vez `python -m jobs.market_quotes`.
          </div>
        )}
        {!loading && quotes.length > 0 && visibles.length === 0 && (
          <div className="px-3 py-6 text-[11px] text-[#555555] text-center font-mono">
            Sin tickers en este filtro.
          </div>
        )}
        <table className="w-full text-[10px] font-mono">
          <thead className="sticky top-0 bg-[#080808] z-10 border-b border-[#1a1a1a]">
            <tr className="text-[9px] text-[#555555] uppercase tracking-wide">
              <th className="px-2 py-1 text-left">Símbolo</th>
              <th className="px-2 py-1 text-left w-[86px]">Grupo</th>
              <th className="px-2 py-1 text-right">Último</th>
              <th className="px-2 py-1 text-right w-[64px]">%Día</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((q) => {
              const up = q.pct_day !== null && (q.pct_day ?? 0) >= 0;
              const grupo = q.grupo || "Otros";
              return (
                <tr key={q.symbol} className="border-b border-[#0e0e0e] hover:bg-[#0e0e0e]">
                  <td className="px-2 py-0.5 text-[#d0d0d0] font-semibold w-[80px]">
                    {q.symbol}
                  </td>
                  <td className="px-2 py-0.5 text-[#666666]">{grupo}</td>
                  <td className="px-2 py-0.5 text-right text-[#d0d0d0] tabular-nums">
                    {fmtPrice(q.last)}
                  </td>
                  <td
                    className="px-2 py-0.5 text-right tabular-nums"
                    style={{ color: up ? "#00cc66" : "#ff3333" }}
                  >
                    {fmtPct(q.pct_day)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
