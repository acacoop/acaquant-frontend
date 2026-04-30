"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Quote } from "@/lib/types";

const POLL_MS = 30_000;
const POLL_LOCAL_MS = 5_000;   // ARGY + futuros DLR refrescan cada 5s (live)

// Default cuando el filtro cambia y el ticker actual no aplica más
// (ej: estabas viendo curva DLR y volvés a Índices). MERVAL siempre vive
// en TradingView (BCBA:IMV vía mapSymbol).
const DEFAULT_TICKER_AL_SALIR_DE_DLR = "MERVAL";

// ── Helpers de formateo ──

function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 10) return v.toFixed(2);
  if (Math.abs(v) >= 1) return v.toFixed(3);
  return v.toFixed(4);
}

// Formato específico para cotizaciones de dólar futuro: siempre 2 decimales,
// incluso si el valor es >= 1000 (DLR cotizan ~1300-2000 con centavos que
// importan al operador).
function fmtPriceDlr(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtTna(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(2)}%`;
}

function PctCell({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) {
    return <td className="px-2 py-0.5 text-right text-[#555555] tabular-nums">—</td>;
  }
  const color = v >= 0 ? "#00cc66" : "#ff3333";
  return (
    <td className="px-2 py-0.5 text-right tabular-nums" style={{ color }}>
      {fmtPct(v)}
    </td>
  );
}

// ── Tipos derivados de los endpoints nuevos ──

interface FuturoDlrDoc {
  ticker: string;
  vencimiento: string;
  dias_a_vto: number;
  bid_price: number | null;
  offer_price: number | null;
  last_price: number | null;
  // 3 TNAs separadas — la principal es sobre last; bid/offer muestran
  // la dispersión. Spot = mid (compra+venta)/2 del oficial.
  tasa_implicita_tna: number | null;
  tasa_implicita_tna_bid: number | null;
  tasa_implicita_tna_offer: number | null;
  spot_referencia: number | null;
  fuente_spot: string | null;
}

interface ArgyDoc {
  label: string;
  value: number | null;
  unit: "$" | "%";
  plazo_dias?: number | null;
  ret_day: number | null;
  ret_7d: number | null;
  ret_mtd: number | null;
  ret_ytd: number | null;
  ts: string | null;
  source: string;
}

const FILTROS_ORDER = [
  "ARGY",
  "FUTUROS ROFEX",
  "Índices",
  "Acciones",
  "Futuros",
  "US Treasury",
];

interface WatchlistPanelProps {
  onSelect?: (symbol: string) => void;
  selected?: string | null;
}

export function WatchlistPanel({ onSelect, selected }: WatchlistPanelProps = {}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [futurosDlr, setFuturosDlr] = useState<FuturoDlrDoc[]>([]);
  const [argy, setArgy] = useState<ArgyDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [filtro, setFiltro] = useState<string>("");

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

  const fetchLocal = useCallback(async () => {
    // 2 fetches en paralelo: futuros DLR + ARGY (5 métricas con returns).
    try {
      const [fRes, aRes] = await Promise.all([
        fetch("/api/futuros-dlr", { cache: "no-store" }),
        fetch("/api/argy", { cache: "no-store" }),
      ]);
      if (fRes.ok) setFuturosDlr(await fRes.json());
      if (aRes.ok) setArgy(await aRes.json());
    } catch {
      // best-effort, no rompemos la UI por estos
    }
  }, []);

  useEffect(() => {
    fetchQuotes();
    const iv = setInterval(fetchQuotes, POLL_MS);
    return () => clearInterval(iv);
  }, [fetchQuotes]);

  useEffect(() => {
    fetchLocal();
    const iv = setInterval(fetchLocal, POLL_LOCAL_MS);
    return () => clearInterval(iv);
  }, [fetchLocal]);

  // ── Filtros disponibles ──

  const gruposPresentes = useMemo(() => {
    const set = new Set<string>();
    if (futurosDlr.length > 0) set.add("FUTUROS ROFEX");
    if (argy.length > 0) set.add("ARGY");
    for (const q of quotes) {
      const g = q.grupo || (q.type === "forex" ? "Monedas" : "Otros");
      set.add(g);
    }
    return Array.from(set).sort(
      (a, b) =>
        (FILTROS_ORDER.indexOf(a) === -1 ? 99 : FILTROS_ORDER.indexOf(a)) -
        (FILTROS_ORDER.indexOf(b) === -1 ? 99 : FILTROS_ORDER.indexOf(b)),
    );
  }, [quotes, futurosDlr, argy]);

  useEffect(() => {
    if (!filtro && gruposPresentes.length > 0) {
      // Default = FUTUROS ROFEX si está disponible (pedido de la mesa).
      // Si el motor de futuros está caído y no hay docs, cae al primero
      // del orden visual (típicamente ARGY).
      const preferido = "FUTUROS ROFEX";
      setFiltro(
        gruposPresentes.includes(preferido) ? preferido : gruposPresentes[0],
      );
    }
  }, [filtro, gruposPresentes]);

  // Sincronización chart ↔ filtro (sin requerir click en una fila):
  //   - Entrás a FUTUROS ROFEX  → chart se linkea a la curva DLR.
  //   - Entrás a ARGY           → chart se linkea al chart de dólares.
  //   - Cambiás a otra cat      → si el ticker activo era custom, vuelve a MERVAL.
  // Ref del selected para no incluirlo en deps y evitar loops.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    const sel = selectedRef.current;
    if (!onSelect || !filtro) return;

    const esDlr = (s: string | null | undefined) =>
      !!s && (s.startsWith("DLR/") || s === "FUTUROS ROFEX");
    const esArgy = (s: string | null | undefined) =>
      s === "ARGY" || s === "DOLAR MEP" || s === "DOLAR CCL" ||
      s === "DOLAR OFICIAL";

    if (filtro === "FUTUROS ROFEX") {
      if (!esDlr(sel)) onSelect("FUTUROS ROFEX");
      return;
    }
    if (filtro === "ARGY") {
      if (!esArgy(sel)) onSelect("ARGY");
      return;
    }
    // Saliendo a otra categoría: si el ticker activo era custom, reset.
    if (esDlr(sel) || esArgy(sel)) {
      onSelect(DEFAULT_TICKER_AL_SALIR_DE_DLR);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  // ── Filas para grupos globales (Índices, Regiones, ...) ──
  const visiblesGlobales = useMemo(() => {
    if (filtro === "FUTUROS ROFEX" || filtro === "ARGY") return [];
    if (!filtro) return [];
    return quotes
      .filter((q) => (q.grupo || (q.type === "forex" ? "Monedas" : "Otros")) === filtro)
      .slice()
      .sort((a, b) => a.symbol.localeCompare(b.symbol));
  }, [quotes, filtro]);

  // ── Filas para FUTUROS ROFEX ──
  const visiblesFuturosDlr = useMemo(() => {
    if (filtro !== "FUTUROS ROFEX") return [];
    return [...futurosDlr].sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
  }, [filtro, futurosDlr]);

  // ── Filas para ARGY (vienen del endpoint con returns calculados) ──
  const visiblesArgy = useMemo<ArgyDoc[]>(() => {
    if (filtro !== "ARGY") return [];
    return argy;
  }, [filtro, argy]);

  const totalVisibles =
    visiblesGlobales.length + visiblesFuturosDlr.length + visiblesArgy.length;

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
        <span className="text-[9px] text-[#555555]">
          · poll {filtro === "FUTUROS ROFEX" || filtro === "ARGY" ? "5s" : "30s"}
        </span>
        <span className="ml-auto text-[9px] text-[#555555]">{totalVisibles}</span>
      </div>

      {/* Chips de filtro */}
      <div className="px-2 py-1.5 border-b border-[#1a1a1a] flex flex-wrap items-center gap-1 shrink-0">
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

        {!loading && totalVisibles === 0 && !error && (
          <div className="px-3 py-6 text-[11px] text-[#555555] text-center font-mono">
            Sin tickers en este filtro.
          </div>
        )}

        {/* ── Tabla globales (Índices, Commodities, etc.) ── */}
        {visiblesGlobales.length > 0 && (
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[#080808] z-10 border-b border-[#1a1a1a]">
              <tr className="text-[9px] text-[#555555] uppercase tracking-wide">
                <th className="px-2 py-1 text-left">Símbolo</th>
                <th className="px-2 py-1 text-right">Último</th>
                <th className="px-2 py-1 text-right">%Día</th>
                <th className="px-2 py-1 text-right">%7d</th>
                <th className="px-2 py-1 text-right">%MTD</th>
                <th className="px-2 py-1 text-right">%YTD</th>
              </tr>
            </thead>
            <tbody>
              {visiblesGlobales.map((q) => {
                const isSel = selected === q.symbol;
                const clickable = !!onSelect;
                return (
                  <tr
                    key={q.symbol}
                    onClick={clickable ? () => onSelect!(q.symbol) : undefined}
                    className={`border-b border-[#0e0e0e] ${
                      isSel
                        ? "bg-[#ff9900]/15"
                        : clickable
                        ? "hover:bg-[#0e0e0e] cursor-pointer"
                        : "hover:bg-[#0e0e0e]"
                    }`}
                  >
                    <td className="px-2 py-0.5 text-[#d0d0d0] font-semibold">{q.symbol}</td>
                    <td className="px-2 py-0.5 text-right text-[#d0d0d0] tabular-nums">
                      {fmtPrice(q.last)}
                    </td>
                    <PctCell v={q.pct_day} />
                    <PctCell v={q.ret_7d} />
                    <PctCell v={q.ret_mtd} />
                    <PctCell v={q.ret_ytd} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* ── Tabla FUTUROS ROFEX (DLR outrights con tasa implícita) ── */}
        {visiblesFuturosDlr.length > 0 && (
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[#080808] z-10 border-b border-[#1a1a1a]">
              <tr className="text-[9px] text-[#555555] uppercase tracking-wide">
                <th className="px-2 py-1 text-left">Ticker</th>
                <th className="px-2 py-1 text-right">Días</th>
                <th className="px-2 py-1 text-right">Último</th>
                <th className="px-2 py-1 text-right">TC</th>
                <th className="px-2 py-1 text-right">Directo</th>
                <th className="px-2 py-1 text-right">DEVA</th>
                <th className="px-2 py-1 text-right">TNA Bid</th>
                <th className="px-2 py-1 text-right">TNA Last</th>
                <th className="px-2 py-1 text-right">TNA Offer</th>
              </tr>
            </thead>
            <tbody>
              {visiblesFuturosDlr.map((f, idx) => {
                // Directo = futuro/spot - 1 (sobre el last del DLR).
                const directo =
                  f.last_price && f.spot_referencia && f.spot_referencia > 0
                    ? (f.last_price / f.spot_referencia - 1) * 100
                    : null;
                // DEVA implícita = last_actual/last_anterior - 1.
                // El "anterior" es el outright que vence antes (lista
                // ordenada por vto ascendente — idx 0 no tiene anterior).
                const anterior = idx > 0 ? visiblesFuturosDlr[idx - 1] : null;
                const deva =
                  f.last_price && anterior?.last_price && anterior.last_price > 0
                    ? (f.last_price / anterior.last_price - 1) * 100
                    : null;
                // Cualquier outright DLR dispara la curva en home-view
                // (el chart custom interpreta tickers DLR/* como "mostrar
                // curva entera"). Highlighteamos la fila seleccionada.
                const isSel = selected === f.ticker;
                const clickable = !!onSelect;
                return (
                  <tr
                    key={f.ticker}
                    onClick={clickable ? () => onSelect!(f.ticker) : undefined}
                    className={`border-b border-[#0e0e0e] ${
                      isSel
                        ? "bg-[#ff9900]/15"
                        : clickable
                        ? "hover:bg-[#0e0e0e] cursor-pointer"
                        : "hover:bg-[#0e0e0e]"
                    }`}
                  >
                    <td className="px-2 py-0.5 text-[#d0d0d0] font-semibold">{f.ticker}</td>
                    <td className="px-2 py-0.5 text-right text-[#888888] tabular-nums">
                      {f.dias_a_vto}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[#d0d0d0] tabular-nums">
                      {fmtPriceDlr(f.last_price)}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[#888888] tabular-nums">
                      {fmtPriceDlr(f.spot_referencia)}
                    </td>
                    <PctCell v={directo} />
                    <PctCell v={deva} />
                    <td className="px-2 py-0.5 text-right tabular-nums" style={{ color: "#00cc66" }}>
                      {fmtTna(f.tasa_implicita_tna_bid)}
                    </td>
                    <td
                      className="px-2 py-0.5 text-right tabular-nums font-semibold"
                      style={{ color: "#ffcc00" }}
                    >
                      {fmtTna(f.tasa_implicita_tna)}
                    </td>
                    <td className="px-2 py-0.5 text-right tabular-nums" style={{ color: "#ff3333" }}>
                      {fmtTna(f.tasa_implicita_tna_offer)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* ── Tabla ARGY (MEP, CCL, canje, cauciones) con returns ── */}
        {visiblesArgy.length > 0 && (
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[#080808] z-10 border-b border-[#1a1a1a]">
              <tr className="text-[9px] text-[#555555] uppercase tracking-wide">
                <th className="px-2 py-1 text-left">Concepto</th>
                <th className="px-2 py-1 text-right">Valor</th>
                <th className="px-2 py-1 text-right">%Día</th>
                <th className="px-2 py-1 text-right">%7d</th>
                <th className="px-2 py-1 text-right">%MTD</th>
                <th className="px-2 py-1 text-right">%YTD</th>
              </tr>
            </thead>
            <tbody>
              {visiblesArgy.map((r) => {
                const isPct = r.unit === "%";
                const valueColor = isPct
                  ? r.label === "CANJE"
                    ? r.value !== null && r.value < 0
                      ? "#ff3333"
                      : "#00cc66"
                    : "#ffcc00"
                  : "#00cc66";
                const labelExtra = r.plazo_dias ? ` ${r.plazo_dias}D` : "";
                return (
                  <tr
                    key={r.label}
                    className="border-b border-[#0e0e0e] hover:bg-[#0e0e0e]"
                  >
                    <td className="px-2 py-0.5 text-[#d0d0d0] font-semibold">
                      {r.label}
                      {labelExtra && (
                        <span className="text-[#555555] font-normal">{labelExtra}</span>
                      )}
                    </td>
                    <td
                      className="px-2 py-0.5 text-right tabular-nums font-semibold"
                      style={{ color: valueColor }}
                    >
                      {r.value === null
                        ? "—"
                        : isPct
                        ? `${r.value.toFixed(2)}%`
                        : r.label === "DOLAR OFICIAL"
                        ? `$${fmtPriceDlr(r.value)}`
                        : `$${fmtPrice(r.value)}`}
                    </td>
                    <PctCell v={r.ret_day} />
                    <PctCell v={r.ret_7d} />
                    <PctCell v={r.ret_mtd} />
                    <PctCell v={r.ret_ytd} />
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
