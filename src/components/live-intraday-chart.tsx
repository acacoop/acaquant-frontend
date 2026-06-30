"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Chart LIVE intradía — NUESTRO feed (mercado.cedears_time_sales por minuto, vía
 * /api/scanner/cedears/intraday). Solo la rueda de hoy; se arma desde el primer
 * trade. Autocontenido: recibe `ticker` y se refetcha/repolea solo (3s).
 *
 * Extraído de ticker-chart-panel.tsx para reusarlo en la vista TRADING.
 */
export function LiveIntradayChart({ ticker }: { ticker: string }) {
  const [data, setData] = useState<{ t: string; c: number }[]>([]);

  useEffect(() => {
    let alive = true;
    const fetchSerie = async () => {
      try {
        const r = await fetch(
          `/api/scanner/cedears/intraday?ticker=${encodeURIComponent(ticker)}`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setData(Array.isArray(j) ? j : []);
      } catch {
        /* transitorio */
      }
    };
    fetchSerie();
    const id = setInterval(fetchSerie, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ticker]);

  const fmtHora = (iso: string) =>
    new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const fmtPx = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

  if (data.length === 0) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center px-3">
        Sin operaciones en la rueda de hoy todavía. El chart LIVE se arma con nuestro
        feed intradía desde el primer trade.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id="cv-live-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--t-accent)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--t-accent)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border)" />
        <XAxis
          dataKey="t"
          tickFormatter={fmtHora}
          tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
          minTickGap={32}
        />
        <YAxis
          domain={["auto", "auto"]}
          tickFormatter={(v) => fmtPx(v as number)}
          tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
          width={56}
        />
        <Tooltip
          contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 10 }}
          labelFormatter={(l) => fmtHora(String(l))}
          formatter={(v) => [fmtPx(Number(v)), "Precio"]}
        />
        <Area
          type="monotone"
          dataKey="c"
          stroke="var(--t-accent)"
          strokeWidth={1.5}
          fill="url(#cv-live-grad)"
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
