"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Volumen intradía del CEDEAR — barras por minuto + línea ACUMULADA del día.
 * Mismo feed que el chart de precio (/api/scanner/cedears/intraday, que trae `vol`
 * por minuto). Eje izquierdo = volumen del minuto (barras), derecho = acumulado.
 * Autocontenido: recibe `ticker`, repolea solo (3s).
 */
export function LiveVolumeChart({ ticker }: { ticker: string }) {
  const [data, setData] = useState<{ t: string; vol: number; cum: number }[]>([]);

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
        if (!Array.isArray(j)) return;
        let acc = 0;
        const out = (j as { t: string; vol: number | null }[]).map((c) => {
          acc += c.vol ?? 0;
          return { t: c.t, vol: c.vol ?? 0, cum: acc };
        });
        if (alive) setData(out);
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
  const fmtVol = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

  if (data.length === 0) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center px-3">
        Sin volumen en la rueda de hoy todavía.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border)" />
        <XAxis
          dataKey="t"
          tickFormatter={fmtHora}
          tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
          minTickGap={32}
        />
        <YAxis
          yAxisId="bar"
          tickFormatter={(v) => fmtVol(v as number)}
          tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
          width={44}
        />
        <YAxis
          yAxisId="cum"
          orientation="right"
          tickFormatter={(v) => fmtVol(v as number)}
          tick={{ fontSize: 9, fill: "var(--t-text-muted)" }}
          width={50}
        />
        <Tooltip
          contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border)", fontSize: 10 }}
          labelFormatter={(l) => fmtHora(String(l))}
          formatter={(v, n) => [fmtVol(Number(v)), n === "cum" ? "Acumulado" : "Volumen min."]}
        />
        <Bar yAxisId="bar" dataKey="vol" fill="var(--t-accent)" isAnimationActive={false} />
        <Line
          yAxisId="cum"
          type="monotone"
          dataKey="cum"
          stroke="var(--t-pos)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
