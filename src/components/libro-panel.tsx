"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  LineData,
  LineSeries,
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
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected && tickers.length > 0) setSelected(tickers[0]);
  }, [tickers, selected]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;

    async function fetchTrades() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/trades?instrumento=${encodeURIComponent(selected!)}`,
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
  }, [selected]);

  const vwap = useMemo(() => {
    const doc = data.find((r) => r.instrumento === selected);
    return doc?.metrics?.vwap;
  }, [data, selected]);

  const todayTrades = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    return trades
      .filter((t) => new Date(t.timestamp).getTime() >= startOfDay)
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
  }, [trades]);

  const tapeTrades = useMemo(() => {
    return [...todayTrades].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [todayTrades]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-[10px] text-[#555555] tracking-wide">TICKER</span>
        <select
          value={selected || ""}
          onChange={(e) => setSelected(e.target.value)}
          className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#ff9900] text-[11px] px-2 py-0.5 font-mono focus:border-[#ff9900] outline-none"
        >
          {tickers.map((t) => (
            <option key={t} value={t}>
              {shortTicker(t)}
            </option>
          ))}
        </select>
        {loading && (
          <span className="text-[10px] text-[#555555]">cargando…</span>
        )}
        <span className="ml-auto text-[10px] text-[#555555]">
          {todayTrades.length} trades hoy
        </span>
      </div>

      <div className="grid grid-cols-[1fr_220px] gap-2 h-[348px]">
        <div className="min-w-0 border border-[#1a1a1a] bg-[#0a0a0a]">
          <LastMinutesChart trades={todayTrades} vwap={vwap} />
        </div>
        <div className="border border-[#1a1a1a] bg-[#0a0a0a] overflow-hidden flex flex-col">
          <div className="px-2 py-1 border-b border-[#1a1a1a] bg-[#ff9900]/10 text-[10px] text-[#ff9900] tracking-wide font-semibold">
            TIME &amp; SALES
          </div>
          <div className="flex-1 overflow-y-auto">
            <TimeSalesTape trades={tapeTrades} />
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
  const vwapLineRef = useRef<IPriceLine | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0a0a" },
        textColor: "#808080",
        fontSize: 10,
        fontFamily: "JetBrains Mono, monospace",
      },
      grid: {
        vertLines: { color: "#1a1a1a" },
        horzLines: { color: "#1a1a1a" },
      },
      rightPriceScale: { borderColor: "#2a2a2a" },
      timeScale: {
        borderColor: "#2a2a2a",
        timeVisible: true,
        secondsVisible: false,
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

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      vwapLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const seen = new Map<number, number>();
    for (const t of trades) {
      const ts = Math.floor(new Date(t.timestamp).getTime() / 1000);
      seen.set(ts, t.price);
    }
    const data: LineData[] = Array.from(seen.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time: time as Time, value }));

    series.setData(data);

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

    if (data.length > 0) chartRef.current?.timeScale().fitContent();
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
