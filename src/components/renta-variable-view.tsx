"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

interface Quote {
  symbol: string;
  type: "stock" | "forex";
  grupo?: string;
  last: number | null;
  prev_close: number | null;
  pct_day: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  updated_at?: string;
}

interface CandleRow {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface Profile {
  name?: string;
  ticker?: string;
  country?: string;
  currency?: string;
  exchange?: string;
  finnhubIndustry?: string;
  marketCapitalization?: number;
  logo?: string;
  weburl?: string;
}

const POLL_MS = 60_000;
const RESOLUCIONES = [
  { label: "1M", days: 30,  resolution: "D" },
  { label: "3M", days: 90,  resolution: "D" },
  { label: "1Y", days: 365, resolution: "D" },
  { label: "5Y", days: 365 * 5, resolution: "W" },
];

function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  if (Math.abs(v) >= 10) return v.toFixed(2);
  return v.toFixed(3);
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function fmtMarketCap(v: number | undefined): string {
  if (!v) return "—";
  // Finnhub devuelve en millones USD
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}T`;
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(1)}B`;
  return `$${v.toFixed(0)}M`;
}

export function RentaVariableView() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQuotes = useCallback(async () => {
    try {
      const res = await fetch("/api/market/quotes", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Quote[] = await res.json();
      setQuotes(data.filter((q) => q.type === "stock"));
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

  const groups = useMemo(() => {
    const g: Record<string, Quote[]> = {};
    for (const q of quotes) {
      const key = q.grupo || "Otros";
      if (!g[key]) g[key] = [];
      g[key].push(q);
    }
    Object.values(g).forEach((rows) => rows.sort((a, b) => a.symbol.localeCompare(b.symbol)));
    return g;
  }, [quotes]);

  const groupOrder = ["ADR Argentina", "ADR LATAM", "Índices", "Regiones", "Big Tech", "Commodities"];
  const entries = Object.entries(groups).sort(
    ([a], [b]) =>
      (groupOrder.indexOf(a) === -1 ? 99 : groupOrder.indexOf(a)) -
      (groupOrder.indexOf(b) === -1 ? 99 : groupOrder.indexOf(b)),
  );

  return (
    <div className="h-full min-h-0 flex flex-col p-3">
      <div className="flex-1 min-h-0 grid grid-cols-[45%_55%] gap-3">
        {/* Tabla */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col min-h-0 overflow-hidden">
          <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0 flex items-center">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
              Renta Variable
            </span>
            <span className="ml-auto text-[9px] text-[#555555]">{quotes.length} tickers · poll 60s</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {error && <div className="px-3 py-2 text-[10px] text-[#ff3333]">Error: {error}</div>}
            {!loading && quotes.length === 0 && !error && (
              <div className="px-3 py-6 text-[11px] text-[#555555] text-center font-mono">
                Sin data. Correr{" "}
                <code className="text-[#ff9900]">python -m jobs.market_quotes --extra</code>.
              </div>
            )}
            {entries.map(([grupo, rows]) => (
              <div key={grupo} className="border-b border-[#111111]">
                <div className="px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#666666] bg-[#0a0a0a] sticky top-0 z-10">
                  {grupo}
                </div>
                <table className="w-full text-[10px] font-mono">
                  <tbody>
                    {rows.map((q) => {
                      const isSel = selected === q.symbol;
                      const up = (q.pct_day ?? 0) >= 0;
                      return (
                        <tr
                          key={q.symbol}
                          onClick={() => setSelected(q.symbol)}
                          className={`border-b border-[#0e0e0e] cursor-pointer ${
                            isSel ? "bg-[#ff9900]/10" : "hover:bg-[#0e0e0e]"
                          }`}
                        >
                          <td className="px-2 py-0.5 text-[#d0d0d0] font-semibold w-[70px]">
                            {q.symbol}
                          </td>
                          <td className="px-2 py-0.5 text-right text-[#d0d0d0] tabular-nums w-[70px]">
                            {fmtPrice(q.last)}
                          </td>
                          <td
                            className="px-2 py-0.5 text-right tabular-nums w-[64px]"
                            style={{ color: up ? "#00cc66" : "#ff3333" }}
                          >
                            {fmtPct(q.pct_day)}
                          </td>
                          <td className="px-2 py-0.5 text-right text-[#666666] tabular-nums w-[60px]">
                            {fmtPrice(q.high)}
                          </td>
                          <td className="px-2 py-0.5 text-right text-[#666666] tabular-nums w-[60px]">
                            {fmtPrice(q.low)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>

        {/* Panel derecho: chart + profile */}
        <div className="min-h-0">
          {selected ? (
            <TickerDetail symbol={selected} />
          ) : (
            <div className="h-full border border-[#1a1a1a] bg-[#080808] flex items-center justify-center text-[#555555] text-xs font-mono text-center px-6">
              Clickeá un ticker para ver chart + profile.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TickerDetail({ symbol }: { symbol: string }) {
  const [resIdx, setResIdx] = useState(2); // 1Y default
  const [candles, setCandles] = useState<CandleRow[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const opt = RESOLUCIONES[resIdx];
    const hasta = new Date();
    const desde = new Date();
    desde.setDate(desde.getDate() - opt.days);
    const desdeISO = desde.toISOString().slice(0, 10);
    const hastaISO = hasta.toISOString().slice(0, 10);

    let cancelled = false;
    setLoading(true);

    fetch(
      `/api/market/candle?symbol=${encodeURIComponent(symbol)}&resolution=${opt.resolution}&desde=${desdeISO}&hasta=${hastaISO}`,
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) {
          let detail = `HTTP ${r.status}`;
          try {
            const body = await r.json();
            const msg = body?.detail ?? body?.error;
            if (msg) detail = typeof msg === "string" ? msg : JSON.stringify(msg);
          } catch {
            /* ignore */
          }
          throw new Error(detail);
        }
        return r.json();
      })
      .then((candleData) => {
        if (cancelled) return;
        const rows = Array.isArray(candleData?.candles) ? candleData.candles : [];
        setCandles(rows);
        setError(rows.length === 0 ? `Sin data (status: ${candleData?.status ?? "?"})` : null);
      })
      .catch((e) => {
        console.error("candle fetch failed:", e);
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // profile solo la primera vez por símbolo (no por cambio de resolution)
    fetch(`/api/market/profile?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((p: Profile) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [symbol, resIdx]);

  return (
    <div className="h-full flex flex-col min-h-0 border border-[#1a1a1a] bg-[#080808]">
      {/* Header */}
      <div className="px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
          {symbol}
        </span>
        {profile?.name && (
          <span className="text-[10px] text-[#d0d0d0] truncate">{profile.name}</span>
        )}
        <span className="ml-auto flex gap-1">
          {RESOLUCIONES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setResIdx(i)}
              className={`px-1.5 py-0.5 text-[9px] font-mono border uppercase tracking-wide ${
                i === resIdx
                  ? "bg-[#ff9900] text-black border-[#ff9900]"
                  : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </span>
      </div>

      {/* Profile */}
      {profile && (profile.finnhubIndustry || profile.marketCapitalization) && (
        <div className="px-3 py-1.5 border-b border-[#1a1a1a] text-[10px] text-[#888888] font-mono flex flex-wrap gap-3">
          {profile.finnhubIndustry && <span>{profile.finnhubIndustry}</span>}
          {profile.exchange && <span>· {profile.exchange}</span>}
          {profile.marketCapitalization && <span>· Mkt cap {fmtMarketCap(profile.marketCapitalization)}</span>}
          {profile.country && <span>· {profile.country}</span>}
          {profile.weburl && (
            <a
              href={profile.weburl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#ff9900] hover:underline ml-auto"
            >
              web ↗
            </a>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0 p-2">
        {loading && <div className="text-[11px] text-[#555555] font-mono">Cargando chart…</div>}
        {error && <div className="text-[11px] text-[#ff3333] font-mono">Error: {error}</div>}
        {!loading && !error && candles.length === 0 && (
          <div className="text-[11px] text-[#555555] font-mono text-center pt-8">
            Sin data histórica para este ticker (puede ser que Finnhub free no lo cubra).
          </div>
        )}
        {!loading && !error && candles.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={candles} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid stroke="#1a1a1a" strokeDasharray="1 3" />
              <XAxis
                dataKey="t"
                tick={{ fill: "#555555", fontSize: 9 }}
                axisLine={{ stroke: "#2a2a2a" }}
                tickLine={false}
                tickFormatter={(v: string) => {
                  const d = new Date(v);
                  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
                }}
              />
              <YAxis
                tick={{ fill: "#555555", fontSize: 9 }}
                axisLine={{ stroke: "#2a2a2a" }}
                tickLine={false}
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v: number) => v.toFixed(v >= 100 ? 0 : 2)}
              />
              <Tooltip
                contentStyle={{ background: "#0e0e0e", border: "1px solid #2a2a2a", fontSize: 10 }}
                labelFormatter={(v) => new Date(v as string).toLocaleDateString("es-AR")}
                formatter={(v) => [fmtPrice(Number(v)), "Cierre"]}
              />
              <Line
                type="monotone"
                dataKey="c"
                stroke="#ff9900"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
