"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Quote } from "@/lib/types";

const POLL_MS = 30_000;
const POLL_LOCAL_MS = 15_000;  // futuros DLR + caución + MEP refrescan más rápido

// ── Helpers de formateo ──

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

function fmtTna(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(2)}%`;
}

function fmtVencimiento(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(6, 8)}/${yyyymmdd.slice(4, 6)}/${yyyymmdd.slice(2, 4)}`;
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
  tasa_implicita_tna: number | null;
}

interface CaucionDoc {
  moneda: "ARS" | "USD";
  plazo_dias: number;
  tna_last: number | null;
  tna_closing: number | null;
  tna_bid: number | null;
  tna_offer: number | null;
}

interface MepDoc {
  mep: number;
  ccl?: number | null;
  canje?: number | null;
}

interface ArgyRow {
  label: string;
  value: number | null;
  unit: "$" | "%";
  extra?: string;
}

const FILTROS_ORDER = [
  "ARGY",
  "FUTUROS ROFEX",
  "Índices",
  "Regiones",
  "Commodities",
  "Monedas",
  "US Treasury",
];

interface WatchlistPanelProps {
  onSelect?: (symbol: string) => void;
  selected?: string | null;
}

export function WatchlistPanel({ onSelect, selected }: WatchlistPanelProps = {}) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [futurosDlr, setFuturosDlr] = useState<FuturoDlrDoc[]>([]);
  const [caucion, setCaucion] = useState<CaucionDoc[]>([]);
  const [mepDoc, setMepDoc] = useState<MepDoc | null>(null);
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
    // 3 fetches en paralelo a endpoints internos: futuros DLR, caución, MEP+CCL.
    try {
      const [fRes, cRes, mRes] = await Promise.all([
        fetch("/api/futuros-dlr", { cache: "no-store" }),
        fetch("/api/caucion", { cache: "no-store" }),
        fetch("/api/mep", { cache: "no-store" }),
      ]);
      if (fRes.ok) setFuturosDlr(await fRes.json());
      if (cRes.ok) setCaucion(await cRes.json());
      if (mRes.ok) setMepDoc(await mRes.json());
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
    if (mepDoc || caucion.length > 0) set.add("ARGY");
    for (const q of quotes) {
      const g = q.grupo || (q.type === "forex" ? "Monedas" : "Otros");
      set.add(g);
    }
    return Array.from(set).sort(
      (a, b) =>
        (FILTROS_ORDER.indexOf(a) === -1 ? 99 : FILTROS_ORDER.indexOf(a)) -
        (FILTROS_ORDER.indexOf(b) === -1 ? 99 : FILTROS_ORDER.indexOf(b)),
    );
  }, [quotes, futurosDlr, caucion, mepDoc]);

  useEffect(() => {
    if (!filtro && gruposPresentes.length > 0) {
      setFiltro(gruposPresentes[0]);
    }
  }, [filtro, gruposPresentes]);

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

  // ── Filas para ARGY ──
  const visiblesArgy = useMemo<ArgyRow[]>(() => {
    if (filtro !== "ARGY") return [];
    const rows: ArgyRow[] = [];
    if (mepDoc) {
      rows.push({ label: "DOLAR MEP", value: mepDoc.mep, unit: "$" });
      if (mepDoc.ccl !== null && mepDoc.ccl !== undefined) {
        rows.push({ label: "DOLAR CCL", value: mepDoc.ccl, unit: "$" });
      }
      if (mepDoc.canje !== null && mepDoc.canje !== undefined) {
        rows.push({ label: "CANJE", value: mepDoc.canje, unit: "%" });
      }
    }
    const cAR = caucion.find((c) => c.moneda === "ARS");
    const cUS = caucion.find((c) => c.moneda === "USD");
    if (cAR) {
      rows.push({
        label: "CAUCION ARS",
        value: cAR.tna_last ?? cAR.tna_closing,
        unit: "%",
        extra: `${cAR.plazo_dias}D`,
      });
    }
    if (cUS) {
      rows.push({
        label: "CAUCION USD",
        value: cUS.tna_last ?? cUS.tna_closing,
        unit: "%",
        extra: `${cUS.plazo_dias}D`,
      });
    }
    return rows;
  }, [filtro, mepDoc, caucion]);

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
          · poll {filtro === "FUTUROS ROFEX" || filtro === "ARGY" ? "15s" : "30s"}
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
                <th className="px-2 py-1 text-right">Vto</th>
                <th className="px-2 py-1 text-right">Días</th>
                <th className="px-2 py-1 text-right">Bid</th>
                <th className="px-2 py-1 text-right">Último</th>
                <th className="px-2 py-1 text-right">Offer</th>
                <th className="px-2 py-1 text-right">TNA Impl.</th>
              </tr>
            </thead>
            <tbody>
              {visiblesFuturosDlr.map((f) => (
                <tr key={f.ticker} className="border-b border-[#0e0e0e] hover:bg-[#0e0e0e]">
                  <td className="px-2 py-0.5 text-[#d0d0d0] font-semibold">{f.ticker}</td>
                  <td className="px-2 py-0.5 text-right text-[#888888] tabular-nums">
                    {fmtVencimiento(f.vencimiento)}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[#888888] tabular-nums">
                    {f.dias_a_vto}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[#00cc66] tabular-nums">
                    {fmtPrice(f.bid_price)}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[#d0d0d0] tabular-nums">
                    {fmtPrice(f.last_price)}
                  </td>
                  <td className="px-2 py-0.5 text-right text-[#ff3333] tabular-nums">
                    {fmtPrice(f.offer_price)}
                  </td>
                  <td
                    className="px-2 py-0.5 text-right tabular-nums font-semibold"
                    style={{ color: "#ffcc00" }}
                  >
                    {fmtTna(f.tasa_implicita_tna)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* ── Tabla ARGY (MEP, CCL, canje, caución) ── */}
        {visiblesArgy.length > 0 && (
          <table className="w-full text-[11px] font-mono">
            <thead className="sticky top-0 bg-[#080808] z-10 border-b border-[#1a1a1a]">
              <tr className="text-[9px] text-[#555555] uppercase tracking-wide">
                <th className="px-2 py-1 text-left">Concepto</th>
                <th className="px-2 py-1 text-right">Plazo</th>
                <th className="px-2 py-1 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {visiblesArgy.map((r) => {
                const isPct = r.unit === "%";
                const colorBase = isPct
                  ? r.label === "CANJE"
                    ? r.value !== null && r.value < 0
                      ? "#ff3333"
                      : "#00cc66"
                    : "#ffcc00"
                  : "#00cc66";
                return (
                  <tr key={r.label} className="border-b border-[#0e0e0e] hover:bg-[#0e0e0e]">
                    <td className="px-2 py-1 text-[#d0d0d0] font-semibold">{r.label}</td>
                    <td className="px-2 py-1 text-right text-[#888888] tabular-nums">
                      {r.extra ?? "—"}
                    </td>
                    <td
                      className="px-2 py-1 text-right tabular-nums font-semibold"
                      style={{ color: colorBase }}
                    >
                      {r.value === null
                        ? "—"
                        : isPct
                        ? `${r.value.toFixed(2)}%`
                        : `$${fmtPrice(r.value)}`}
                    </td>
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
