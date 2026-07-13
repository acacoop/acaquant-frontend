"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { VWAP_COLOR, type PivotLevels } from "@/lib/types-trading";

// Niveles a dibujar como líneas horizontales (R verde, S rojo, PP gris).
const NIVELES: { k: keyof PivotLevels; label: string; color: string }[] = [
  { k: "r3", label: "R3", color: "var(--t-pos)" },
  { k: "r2", label: "R2", color: "var(--t-pos)" },
  { k: "r1", label: "R1", color: "var(--t-pos)" },
  { k: "pp", label: "PP", color: "var(--t-text-muted)" },
  { k: "s1", label: "S1", color: "var(--t-neg)" },
  { k: "s2", label: "S2", color: "var(--t-neg)" },
  { k: "s3", label: "S3", color: "var(--t-neg)" },
];

/**
 * Chart LIVE intradía — NUESTRO feed por minuto, vía /api/trading/intraday (el
 * backend resuelve la fuente por ticker: CEDEAR → cedears_time_sales; bono →
 * mercado.timesales). Solo la rueda de hoy; se arma desde el primer trade.
 * Autocontenido: recibe `ticker` y se refetcha/repolea solo (3s).
 *
 * VWAP: línea horizontal en el valor REAL del snapshot (prop `vwap`, el mismo que
 * la card). Se mueve en cada poll → "va cambiando" durante la rueda. Sólida y
 * verde claro para no confundirla con los niveles R (punteados).
 *
 * Extraído de ticker-chart-panel.tsx para reusarlo en la vista TRADING.
 */
export function LiveIntradayChart({
  ticker,
  pivots,
  vwap,
}: {
  ticker: string;
  pivots?: PivotLevels | null;
  vwap?: number | null;
}) {
  const [data, setData] = useState<{ t: string; c: number }[]>([]);

  useEffect(() => {
    let alive = true;
    const fetchSerie = async () => {
      try {
        const r = await fetch(
          `/api/trading/intraday?ticker=${encodeURIComponent(ticker)}`,
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

  const hayVwap = vwap != null && Number.isFinite(vwap);

  // Dominio Y centrado en el MOVIMIENTO del precio (con colchón), no en los
  // pivots/VWAP lejanos: para un bono que se mueve centavos, dejar que el VWAP
  // estire el eje (extendDomain) aplastaba la serie contra el borde. Los niveles
  // fuera de este rango se recortan (ifOverflow="hidden").
  const closes = data.map((d) => d.c).filter((n) => Number.isFinite(n));
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const span = hi - lo;
  const pad = span > 0 ? span * 0.2 : Math.max(Math.abs(hi) * 0.001, 0.01);
  const yDomain: [number, number] = [lo - pad, hi + pad];

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
          domain={yDomain}
          allowDataOverflow
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
        {/* VWAP real (snapshot) — línea sólida verde claro, se mueve con cada poll. */}
        {hayVwap && (
          <ReferenceLine
            y={vwap as number}
            stroke={VWAP_COLOR}
            strokeWidth={1.5}
            ifOverflow="hidden"
            label={{ value: "VWAP", position: "right", fontSize: 8, fill: VWAP_COLOR }}
          />
        )}
        {/* Pivots como líneas horizontales. ifOverflow="hidden" → si caen fuera
            del rango del precio, se recortan (NO estiran el eje). */}
        {pivots &&
          NIVELES.map((n) => {
            const y = pivots[n.k];
            if (y == null || !Number.isFinite(y)) return null;
            return (
              <ReferenceLine
                key={n.k}
                y={y}
                stroke={n.color}
                strokeDasharray="4 3"
                strokeWidth={1}
                ifOverflow="hidden"
                label={{ value: n.label, position: "right", fontSize: 8, fill: n.color }}
              />
            );
          })}
      </AreaChart>
    </ResponsiveContainer>
  );
}
