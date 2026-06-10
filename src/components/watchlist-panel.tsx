"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Quote } from "@/lib/types";

const POLL_MS = 30_000;
const POLL_LOCAL_MS = 5_000;   // ARGY + futuros DLR refrescan cada 5s (live)

// Default cuando el filtro cambia y el ticker actual no aplica más
// (ej: estabas viendo curva DLR y volvés a General). MERVAL siempre vive
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

// Hora de última actualización (HH:MM:SS local) a partir de un ISO.
function fmtAct(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

function PctCell({ v }: { v: number | null | undefined }) {
  if (v === null || v === undefined) {
    return <td className="px-2 py-0.5 text-right text-[var(--t-text-muted)] tabular-nums">—</td>;
  }
  const color = v >= 0 ? "var(--t-pos)" : "var(--t-neg)";
  return (
    <td className="px-2 py-0.5 text-right tabular-nums" style={{ color }}>
      {fmtPct(v)}
    </td>
  );
}

// ── Tipos derivados de los endpoints ──

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

// Fila normalizada para la vista GENERAL (ARGY + Índices + Futuros + US Treasury).
interface GenRow {
  name: string;
  valueStr: string;
  valueColor: string;
  pct_day: number | null;
  ret_7d: number | null;
  ret_mtd: number | null;
  ret_ytd: number | null;
  ts: string | null;
  selectKey: string;
  clickable: boolean;
}

// GENERAL consolida estos sub-grupos (en este orden, con separadores). ARGY va
// primero (lo local). FUTUROS ROFEX queda como tab aparte (no entra acá).
const SUBGRUPOS_GLOBALES = ["Índices", "Futuros", "US Treasury"];

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
    // 2 fetches en paralelo: futuros DLR + ARGY (métricas con returns).
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

  // ── Filtros: solo 2 tabs ahora (General + FUTUROS ROFEX) ──
  const gruposPresentes = useMemo(() => {
    const out: string[] = [];
    if (argy.length > 0 || quotes.length > 0) out.push("General");
    if (futurosDlr.length > 0) out.push("FUTUROS ROFEX");
    return out;
  }, [quotes, futurosDlr, argy]);

  useEffect(() => {
    if (!filtro && gruposPresentes.length > 0) {
      // Default = FUTUROS ROFEX si está (pedido de la mesa); si no, General.
      setFiltro(gruposPresentes.includes("FUTUROS ROFEX") ? "FUTUROS ROFEX" : gruposPresentes[0]);
    }
  }, [filtro, gruposPresentes]);

  // Sincronización chart ↔ filtro: entrando a FUTUROS ROFEX linkea la curva DLR;
  // saliendo a General, si veníamos de la curva, volvemos a MERVAL.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    const sel = selectedRef.current;
    if (!onSelect || !filtro) return;
    const esDlr = (s: string | null | undefined) =>
      !!s && (s.startsWith("DLR/") || s === "FUTUROS ROFEX");
    if (filtro === "FUTUROS ROFEX") {
      if (!esDlr(sel)) onSelect("FUTUROS ROFEX");
      return;
    }
    if (esDlr(sel)) onSelect(DEFAULT_TICKER_AL_SALIR_DE_DLR);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  // ── GENERAL: sub-grupos normalizados con separadores ──
  const generalGrupos = useMemo<{ label: string; rows: GenRow[] }[]>(() => {
    if (filtro !== "General") return [];
    const grupos: { label: string; rows: GenRow[] }[] = [];

    // 1) ARGY (lo local: MEP, CCL, canje, cauciones, riesgo, oficial).
    if (argy.length > 0) {
      grupos.push({
        label: "Argentina",
        rows: argy.map((r): GenRow => {
          const isPct = r.unit === "%";
          const valueColor = isPct
            ? r.label === "CANJE"
              ? r.value !== null && r.value < 0 ? "var(--t-neg)" : "var(--t-pos)"
              : "#ffcc00"
            : "var(--t-pos)";
          const valueStr = r.value === null
            ? "—"
            : isPct
              ? `${r.value.toFixed(2)}%`
              : r.label === "DOLAR OFICIAL"
                ? `$${fmtPriceDlr(r.value)}`
                : `$${fmtPrice(r.value)}`;
          return {
            name: r.label + (r.plazo_dias ? ` ${r.plazo_dias}D` : ""),
            valueStr,
            valueColor,
            pct_day: r.ret_day,
            ret_7d: r.ret_7d,
            ret_mtd: r.ret_mtd,
            ret_ytd: r.ret_ytd,
            ts: r.ts,
            selectKey: r.label,
            clickable: false,
          };
        }),
      });
    }

    // 2) Índices / Futuros / US Treasury (Market.Quotes).
    for (const g of SUBGRUPOS_GLOBALES) {
      const rows = quotes
        .filter((q) => (q.grupo || (q.type === "forex" ? "Monedas" : "Otros")) === g)
        .slice()
        .sort((a, b) => a.symbol.localeCompare(b.symbol))
        .map((q): GenRow => ({
          name: q.symbol,
          valueStr: fmtPrice(q.last),
          valueColor: "var(--t-text)",
          pct_day: q.pct_day,
          ret_7d: q.ret_7d,
          ret_mtd: q.ret_mtd,
          ret_ytd: q.ret_ytd,
          ts: (q as Quote & { updated_at?: string }).updated_at ?? null,
          selectKey: q.symbol,
          clickable: !!onSelect,
        }));
      if (rows.length > 0) grupos.push({ label: g, rows });
    }

    return grupos;
  }, [filtro, argy, quotes, onSelect]);

  // ── FUTUROS ROFEX (sin cambios) ──
  const visiblesFuturosDlr = useMemo(() => {
    if (filtro !== "FUTUROS ROFEX") return [];
    return [...futurosDlr].sort((a, b) => a.vencimiento.localeCompare(b.vencimiento));
  }, [filtro, futurosDlr]);

  const totalGeneral = generalGrupos.reduce((a, g) => a + g.rows.length, 0);
  const totalVisibles = totalGeneral + visiblesFuturosDlr.length;

  return (
    <div className="h-full flex flex-col min-h-0 border border-[var(--t-border)] bg-[var(--t-panel)]">
      <div className="px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 shrink-0 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-wide uppercase">
          Watchlist
        </span>
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: loading ? "#ff9900" : "var(--t-pos)" }}
        />
        <span className="text-[9px] text-[var(--t-text-muted)] tracking-wide uppercase">
          {lastFetch
            ? `${lastFetch.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
            : "—"}
        </span>
        <span className="text-[9px] text-[var(--t-text-muted)]">
          · poll {filtro === "FUTUROS ROFEX" ? "5s" : "5s/30s"}
        </span>
        <span className="ml-auto text-[9px] text-[var(--t-text-muted)]">{totalVisibles}</span>
      </div>

      {/* Chips de filtro */}
      <div className="px-2 py-1.5 border-b border-[var(--t-border)] flex flex-wrap items-center gap-1 shrink-0">
        {gruposPresentes.map((g) => (
          <button
            key={g}
            onClick={() => setFiltro(g)}
            className={`px-2 py-0.5 text-[9px] font-mono border uppercase tracking-wide ${
              filtro === g
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {error && (
          <div className="px-3 py-2 text-[10px] text-[var(--t-neg)] font-mono">Error: {error}</div>
        )}

        {!loading && totalVisibles === 0 && !error && (
          <div className="px-3 py-6 text-[11px] text-[var(--t-text-muted)] text-center font-mono">
            Sin tickers en este filtro.
          </div>
        )}

        {/* ── GENERAL: ARGY + Índices + Futuros + US Treasury con separadores ── */}
        {filtro === "General" && totalGeneral > 0 && (
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10 border-b border-[var(--t-border)]">
              <tr className="text-[9px] text-[var(--t-text-muted)] uppercase tracking-wide">
                <th className="px-2 py-1 text-left">Símbolo</th>
                <th className="px-2 py-1 text-right">Último</th>
                <th className="px-2 py-1 text-right">%Día</th>
                <th className="px-2 py-1 text-right">%7d</th>
                <th className="px-2 py-1 text-right">%MTD</th>
                <th className="px-2 py-1 text-right">%YTD</th>
                <th className="px-2 py-1 text-right">Act</th>
              </tr>
            </thead>
            <tbody>
              {generalGrupos.map((grupo) => (
                <GeneralGrupo
                  key={grupo.label}
                  label={grupo.label}
                  rows={grupo.rows}
                  selected={selected}
                  onSelect={onSelect}
                />
              ))}
            </tbody>
          </table>
        )}

        {/* ── FUTUROS ROFEX (DLR outrights con tasa implícita) — sin cambios ── */}
        {visiblesFuturosDlr.length > 0 && (
          <table className="w-full text-[10px] font-mono">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10 border-b border-[var(--t-border)]">
              <tr className="text-[9px] text-[var(--t-text-muted)] uppercase tracking-wide">
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
                const directo =
                  f.last_price && f.spot_referencia && f.spot_referencia > 0
                    ? (f.last_price / f.spot_referencia - 1) * 100
                    : null;
                const anterior = idx > 0 ? visiblesFuturosDlr[idx - 1] : null;
                const deva =
                  f.last_price && anterior?.last_price && anterior.last_price > 0
                    ? (f.last_price / anterior.last_price - 1) * 100
                    : null;
                const isSel = selected === f.ticker;
                const clickable = !!onSelect;
                return (
                  <tr
                    key={f.ticker}
                    onClick={clickable ? () => onSelect!(f.ticker) : undefined}
                    className={`border-b border-[var(--t-border)] ${
                      isSel
                        ? "bg-[var(--t-accent)]/15"
                        : clickable
                        ? "hover:bg-[var(--t-surface)] cursor-pointer"
                        : "hover:bg-[var(--t-surface)]"
                    }`}
                  >
                    <td className="px-2 py-0.5 text-[var(--t-text)] font-semibold">{f.ticker}</td>
                    <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)] tabular-nums">
                      {f.dias_a_vto}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[var(--t-text)] tabular-nums">
                      {fmtPriceDlr(f.last_price)}
                    </td>
                    <td className="px-2 py-0.5 text-right text-[var(--t-text-dim)] tabular-nums">
                      {fmtPriceDlr(f.spot_referencia)}
                    </td>
                    <PctCell v={directo} />
                    <PctCell v={deva} />
                    <td className="px-2 py-0.5 text-right tabular-nums" style={{ color: "var(--t-pos)" }}>
                      {fmtTna(f.tasa_implicita_tna_bid)}
                    </td>
                    <td
                      className="px-2 py-0.5 text-right tabular-nums font-semibold"
                      style={{ color: "#ffcc00" }}
                    >
                      {fmtTna(f.tasa_implicita_tna)}
                    </td>
                    <td className="px-2 py-0.5 text-right tabular-nums" style={{ color: "var(--t-neg)" }}>
                      {fmtTna(f.tasa_implicita_tna_offer)}
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

// Un sub-grupo de la vista GENERAL: fila separadora con el nombre + sus filas.
function GeneralGrupo({
  label, rows, selected, onSelect,
}: {
  label: string;
  rows: GenRow[];
  selected?: string | null;
  onSelect?: (symbol: string) => void;
}) {
  return (
    <>
      <tr className="bg-[var(--t-surface-2)] border-y border-[var(--t-border-2)]">
        <td colSpan={7} className="px-2 py-0.5 text-[8px] uppercase tracking-widest text-[var(--t-accent)] font-semibold">
          {label}
        </td>
      </tr>
      {rows.map((r) => {
        const isSel = selected === r.selectKey;
        const clickable = r.clickable && !!onSelect;
        return (
          <tr
            key={`${label}-${r.name}`}
            onClick={clickable ? () => onSelect!(r.selectKey) : undefined}
            className={`border-b border-[var(--t-border)] ${
              isSel
                ? "bg-[var(--t-accent)]/15"
                : clickable
                ? "hover:bg-[var(--t-surface)] cursor-pointer"
                : "hover:bg-[var(--t-surface)]"
            }`}
          >
            <td className="px-2 py-0.5 text-[var(--t-text)] font-semibold">{r.name}</td>
            <td className="px-2 py-0.5 text-right tabular-nums font-semibold" style={{ color: r.valueColor }}>
              {r.valueStr}
            </td>
            <PctCell v={r.pct_day} />
            <PctCell v={r.ret_7d} />
            <PctCell v={r.ret_mtd} />
            <PctCell v={r.ret_ytd} />
            <td className="px-2 py-0.5 text-right text-[var(--t-text-muted)] tabular-nums">{fmtAct(r.ts)}</td>
          </tr>
        );
      })}
    </>
  );
}
