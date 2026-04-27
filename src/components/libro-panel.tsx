"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  LineData,
  LineSeries,
  HistogramData,
  HistogramSeries,
  Time,
  IPriceLine,
  LineStyle,
} from "lightweight-charts";
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

  const vwap = useMemo(() => {
    const doc = data.find((r) => r.instrumento === effectiveSelected);
    return doc?.metrics?.vwap;
  }, [data, effectiveSelected]);

  const { todayTrades, sessionLabel } = useMemo(() => {
    if (trades.length === 0) return { todayTrades: [], sessionLabel: "" };

    const sorted = [...trades].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const today = sorted.filter(
      (t) => new Date(t.timestamp).getTime() >= startOfDay
    );
    if (today.length > 0) return { todayTrades: today, sessionLabel: "HOY" };

    const lastTs = new Date(sorted[sorted.length - 1].timestamp);
    const lastDayStart = new Date(
      lastTs.getFullYear(),
      lastTs.getMonth(),
      lastTs.getDate()
    ).getTime();
    const lastDayEnd = lastDayStart + 86_400_000;
    const lastSession = sorted.filter((t) => {
      const ts = new Date(t.timestamp).getTime();
      return ts >= lastDayStart && ts < lastDayEnd;
    });
    const label = `${String(lastTs.getDate()).padStart(2, "0")}/${String(
      lastTs.getMonth() + 1
    ).padStart(2, "0")}`;
    return { todayTrades: lastSession, sessionLabel: label };
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
        <span className="text-[10px] text-[#555555] tracking-wide">TICKER</span>
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
            className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#ff9900] text-[11px] px-2 py-0.5 font-mono focus:border-[#ff9900] outline-none w-[140px]"
          />
          {open && filtered.length > 0 && (
            <div
              ref={dropRef}
              className="absolute top-full left-0 mt-px z-50 bg-[#0e0e0e] border border-[#2a2a2a] max-h-[200px] overflow-y-auto min-w-full"
            >
              {filtered.map((t) => (
                <div
                  key={t}
                  onMouseDown={() => pickTicker(t)}
                  className={`px-2 py-0.5 text-[11px] font-mono cursor-pointer hover:bg-[#ff9900]/10 ${
                    t === effectiveSelected ? "text-[#ff9900]" : "text-[#d0d0d0]"
                  }`}
                >
                  {shortTicker(t)}
                </div>
              ))}
            </div>
          )}
        </div>
        {loading && (
          <span className="text-[10px] text-[#555555]">cargando…</span>
        )}
        <span className="ml-auto text-[10px] text-[#555555]">
          {todayTrades.length} trades {sessionLabel.toLowerCase()}
        </span>
      </div>

      {/* Side-by-side siempre. El panel Libro vive dentro de RENTA FIJA,
          que es ~50% horizontal × ~50% vertical de la ventana — espacio
          chico, hay que aprovecharlo. Tape angosto (180px) para dejarle
          la mayor parte al chart, y el chart con fontSize chico ya entra.
          flex-1 min-h-0 = llena toda la altura del Panel padre. */}
      <div className="flex-1 min-h-0">
        <div className="grid grid-cols-[1fr_180px] gap-1 h-full">
          <div className="min-w-0 min-h-0 border border-[#1a1a1a] bg-[#0a0a0a] relative">
            {todayTrades.length === 0 && !loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-[#555555] text-[10px]">
                SIN TRADES
              </div>
            ) : (
              <LastMinutesChart
                key={effectiveSelected || "none"}
                trades={todayTrades}
                vwap={vwap}
              />
            )}
          </div>
          <div className="min-h-0 border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden flex flex-col">
            <div className="flex items-center px-2 py-1 border-b border-[#1a1a1a] bg-[#ff9900]/10">
              <span className="text-[10px] text-[#ff9900] tracking-wide font-semibold">
                TIME &amp; SALES
              </span>
              {sessionLabel && sessionLabel !== "HOY" && (
                <span className="ml-auto text-[9px] text-[#808080]">
                  {sessionLabel}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              <TimeSalesTape trades={tapeTrades} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LastMinutesChart({
  trades,
  vwap,
}: {
  trades: Trade[];
  vwap?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const vwapLineRef = useRef<IPriceLine | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0a0a" },
        textColor: "#808080",
        // fontSize 9 (antes 10): el panel es chico, las labels del eje X
        // y las del price scale derecho tienen que entrar sí o sí.
        fontSize: 9,
        fontFamily: "JetBrains Mono, monospace",
      },
      grid: {
        vertLines: { color: "#1a1a1a" },
        horzLines: { color: "#1a1a1a" },
      },
      rightPriceScale: {
        borderColor: "#2a2a2a",
        // Margins chicos para que la price scale no le coma ancho al chart.
        scaleMargins: { top: 0.05, bottom: 0.2 },
      },
      timeScale: {
        borderColor: "#2a2a2a",
        timeVisible: true,
        secondsVisible: false,
        // Más densidad de labels antes de ocultar — aprovecha el espacio.
        minBarSpacing: 2,
      },
      crosshair: {
        vertLine: { color: "#ff9900", width: 1, style: 2 },
        horzLine: { color: "#ff9900", width: 1, style: 2 },
      },
      autoSize: true,
    });

    const series = chart.addSeries(LineSeries, {
      color: "#ff9900",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: "#ff9900",
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("volume").applyOptions({
      // 0.88 (antes 0.8): el volumen ocupa solo el 12% inferior del chart
      // y el precio se queda con el 88%. En un Panel chico la línea de
      // precio necesita la mayor parte del espacio vertical posible.
      scaleMargins: { top: 0.88, bottom: 0 },
    });

    chartRef.current = chart;
    seriesRef.current = series;
    volumeSeriesRef.current = volumeSeries;

    hasLoadedRef.current = false;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volumeSeriesRef.current = null;
      vwapLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!series) return;

    const priceMap = new Map<number, number>();
    const volMap = new Map<number, { size: number; side?: string }>();
    for (const t of trades) {
      const ts = Math.floor(new Date(t.timestamp).getTime() / 1000);
      priceMap.set(ts, t.price);
      const prev = volMap.get(ts);
      volMap.set(ts, {
        size: (prev?.size || 0) + (t.size || 0),
        side: t.side || prev?.side,
      });
    }
    const data: LineData[] = Array.from(priceMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as Time, value }));

    series.setData(data);

    if (volumeSeries) {
      const volData: HistogramData[] = Array.from(volMap.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([time, v]) => {
          const side = (v.side || "").toUpperCase();
          const color =
            side === "BUY"
              ? "#00cc66"
              : side === "SELL"
              ? "#ff3333"
              : "#808080";
          return { time: time as Time, value: v.size, color };
        });
      volumeSeries.setData(volData);
    }

    if (vwapLineRef.current) {
      series.removePriceLine(vwapLineRef.current);
      vwapLineRef.current = null;
    }
    if (vwap && vwap > 0) {
      vwapLineRef.current = series.createPriceLine({
        price: vwap,
        color: "#00cc66",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "VWAP",
      });
    }

    if (data.length > 0 && !hasLoadedRef.current) {
      chartRef.current?.timeScale().fitContent();
      hasLoadedRef.current = true;
    }
  }, [trades, vwap]);

  return <div ref={containerRef} className="w-full h-full" />;
}

function TimeSalesTape({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <div className="px-2 py-4 text-center text-[#555555] text-[10px]">
        SIN TRADES HOY
      </div>
    );
  }

  return (
    <table className="w-full text-[10px] font-mono">
      <thead className="sticky top-0 bg-[#0a0a0a] z-10">
        <tr className="border-b border-[#1a1a1a]">
          <th className="text-left px-1.5 py-0.5 text-[#555555] font-normal">
            HORA
          </th>
          <th className="text-right px-1.5 py-0.5 text-[#555555] font-normal">
            PRECIO
          </th>
          <th className="text-right px-1.5 py-0.5 text-[#555555] font-normal">
            VN
          </th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t, i) => {
          const side = (t.side || "").toUpperCase();
          const color =
            side === "BUY"
              ? "text-[#00cc66]"
              : side === "SELL"
              ? "text-[#ff3333]"
              : "text-[#d0d0d0]";
          const d = new Date(t.timestamp);
          const hora = `${String(d.getHours()).padStart(2, "0")}:${String(
            d.getMinutes()
          ).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
          return (
            <tr
              key={`${t.timestamp}-${i}`}
              className="border-b border-[#111111] hover:bg-[#ff9900]/5"
            >
              <td className="px-1.5 py-0.5 text-[#808080]">{hora}</td>
              <td className={`px-1.5 py-0.5 text-right font-semibold ${color}`}>
                {fmtNum(t.price)}
              </td>
              <td className="px-1.5 py-0.5 text-right text-[#808080]">
                {fmtNum(t.size)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
