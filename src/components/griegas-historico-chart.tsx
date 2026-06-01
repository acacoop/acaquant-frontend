"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useViewportKey } from "@/lib/use-viewport-key";

interface GriegaDoc {
  fecha: string;        // "YYYY-MM-DD"
  delta?: number;
  gamma?: number;
  vega?: number;
  theta?: number;
  iv?: number;
  last?: number;
  spot?: number;
  tipo?: string;
  strike?: number;
}

// Griegas seleccionables. `iv` se muestra como % (×100); el resto en su unidad.
type GriegaKey = "delta" | "gamma" | "vega" | "theta" | "iv";
const GRIEGAS: { key: GriegaKey; label: string; pct?: boolean }[] = [
  { key: "delta", label: "Δ Delta" },
  { key: "gamma", label: "Γ Gamma" },
  { key: "vega", label: "V Vega" },
  { key: "theta", label: "Θ Theta" },
  { key: "iv", label: "IV", pct: true },
];

/**
 * Evolución diaria de las griegas de un contrato (Opciones.DataHistorica).
 * Un solo chart con selector de griega: eje X = tiempo (rollup diario), eje Y
 * = valor de la griega elegida. Linkeado al contrato seleccionado en OPCIONES
 * GGAL. Usa índice como eje X (con labels de fecha) para no abrir huecos en
 * fines de semana — mismo criterio que el resto de los charts del módulo.
 */
export function GriegasHistoricoChart({ instrumento }: { instrumento: string }) {
  const vpKey = useViewportKey();
  const [data, setData] = useState<GriegaDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [griega, setGriega] = useState<GriegaKey>("delta");

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError(null);
    fetch(
      "/api/cotizaciones/griegas/opciones?instrumento=" +
        encodeURIComponent(instrumento),
      { cache: "no-store" },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as GriegaDoc[];
      })
      .then((rows) => {
        if (cancelled) return;
        setData(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e.message || e));
        setData([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [instrumento]);

  const cfg = GRIEGAS.find((g) => g.key === griega)!;

  const serie = useMemo(
    () =>
      data.map((p, idx) => {
        const raw = p[griega];
        const v = typeof raw === "number" ? (cfg.pct ? raw * 100 : raw) : null;
        return { idx, fecha: p.fecha, v, last: p.last, spot: p.spot };
      }),
    [data, griega, cfg.pct],
  );

  const stats = useMemo(() => {
    const vals = serie.map((p) => p.v).filter((v): v is number => v != null);
    if (!vals.length) return null;
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      ultimo: vals[vals.length - 1],
    };
  }, [serie]);

  // Dominio Y ajustado al rango real con padding 12% (no forzar 0). Sin esto
  // recharts arranca en 0 y, si los valores rondan p.ej. 8, la línea queda
  // pegada arriba. Funciona también para griegas negativas (delta de puts,
  // theta) y para rangos chiquitos (gamma ~0.0003).
  const yDomain = useMemo<[number, number] | ["auto", "auto"]>(() => {
    if (!stats) return ["auto", "auto"];
    const { min, max } = stats;
    if (min === max) {
      const d = Math.abs(min) || 1;
      return [min - d, max + d];
    }
    const pad = (max - min) * 0.12;
    return [min - pad, max + pad];
  }, [stats]);

  const xTicks = useMemo<number[]>(() => {
    // Un tick por fecha (la data ya es diaria, así que ~1 por punto, pero
    // mantenemos el patrón por consistencia).
    return serie.map((p) => p.idx);
  }, [serie]);

  const fmtVal = (v: number) =>
    cfg.pct
      ? `${v.toFixed(1)}%`
      : v.toLocaleString("es-AR", { maximumFractionDigits: 4 });
  const fmtTickFecha = (idx: number) => {
    const p = serie[idx];
    if (!p) return "";
    const [, m, d] = p.fecha.split("-");
    return `${d}/${m}`;
  };

  if (loading) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
        Cargando griegas de {instrumento}…
      </p>
    );
  }
  if (error) {
    return <p className="text-[var(--t-neg)] text-xs py-4 text-center">Error: {error}</p>;
  }
  if (!serie.length) {
    return (
      <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
        Sin histórico diario para {instrumento}.
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Selector de griega + stats */}
      <div className="flex items-center gap-1 px-2 pb-1 shrink-0 flex-wrap">
        {GRIEGAS.map((g) => (
          <button
            key={g.key}
            onClick={() => setGriega(g.key)}
            className={`text-[9px] px-1.5 py-0.5 border transition-colors ${
              griega === g.key
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}
          >
            {g.label}
          </button>
        ))}
        {stats && (
          <span className="ml-auto text-[9px] text-[var(--t-text-dim)] flex items-center gap-2">
            <span>
              MÍN <span className="text-[var(--t-text)] font-semibold">{fmtVal(stats.min)}</span>
            </span>
            <span>
              MÁX <span className="text-[var(--t-text)] font-semibold">{fmtVal(stats.max)}</span>
            </span>
            <span>
              ÚLT <span className="text-[var(--t-accent)] font-semibold">{fmtVal(stats.ultimo)}</span>
            </span>
          </span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer key={vpKey} width="100%" height="100%">
          <LineChart data={serie} margin={{ top: 4, right: 12, bottom: 20, left: 4 }}>
            <CartesianGrid stroke="var(--t-border)" vertical={false} />
            <XAxis
              dataKey="idx"
              type="number"
              domain={[0, Math.max(0, serie.length - 1)]}
              ticks={xTicks}
              tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
              axisLine={{ stroke: "var(--t-border-2)" }}
              tickLine={false}
              tickFormatter={(idx: number) => fmtTickFecha(Number(idx))}
              minTickGap={24}
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: "var(--t-text-dim)", fontSize: 9 }}
              axisLine={{ stroke: "var(--t-border-2)" }}
              tickLine={false}
              tickFormatter={(v: number) => fmtVal(Number(v))}
              tickCount={6}
              width={56}
            />
            <Tooltip
              contentStyle={{
                background: "#0e0e0e",
                border: "1px solid #2a2a2a",
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
              }}
              labelFormatter={(idx) => {
                const p = serie[Number(idx)];
                return p ? p.fecha : "";
              }}
              formatter={(value) => [fmtVal(Number(value)), cfg.label]}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke="#4a9eff"
              strokeWidth={1.4}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
            <Brush
              dataKey="idx"
              height={16}
              stroke="#4a9eff"
              fill="#0a0a0a"
              travellerWidth={8}
              tickFormatter={(idx: number) => fmtTickFecha(Number(idx))}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
