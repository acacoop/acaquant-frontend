"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * RETORNOS — retorno DIARIO del subyacente USD del ticker elegido, en el tiempo.
 * Eje Y: % del día. Eje X: fecha.
 *
 * Barras y no línea: el retorno diario oscila alrededor de cero y lo que se
 * quiere ver son los sacudones (magnitud y signo de cada día). Una línea
 * uniendo puntos que cruzan el cero todo el tiempo sugiere una continuidad que
 * no existe.
 *
 * La serie sale de `GET /api/scanner/returns/{ticker}` (campo `serie`), la
 * misma que alimenta el histograma — mismos números, acá con su fecha.
 */

type Punto = { fecha: string; ret_pct: number };

const VENTANAS: { label: string; dias: number | null }[] = [
  { label: "1M", dias: 21 },
  { label: "3M", dias: 63 },
  { label: "6M", dias: 126 },
  { label: "1A", dias: 252 },
  { label: "TODO", dias: null },
];

const VERDE = "#3fb950";
const ROJO = "#f85149";

function fmtFecha(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function RetornosChart({ ticker }: { ticker: string | null }) {
  const [serie, setSerie] = useState<Punto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ventana, setVentana] = useState<number | null>(252);

  useEffect(() => {
    if (!ticker) {
      setSerie([]);
      return;
    }
    let cancelado = false;
    setLoading(true);
    setError(null);
    fetch(`/api/scanner/returns/${encodeURIComponent(ticker)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { serie?: Punto[] }) => {
        if (!cancelado) setSerie(d.serie || []);
      })
      .catch((e) => {
        if (!cancelado) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [ticker]);

  // La ventana recorta los ÚLTIMOS N días hábiles (la serie viene ordenada).
  const datos = useMemo(
    () => (ventana === null ? serie : serie.slice(-ventana)),
    [serie, ventana],
  );

  // Resumen del período: lo que un gráfico de retornos diarios NO deja leer de
  // un vistazo (si el papel ganó o perdió) se dice en números, al lado.
  const resumen = useMemo(() => {
    if (!datos.length) return null;
    const rets = datos.map((p) => p.ret_pct);
    const positivos = rets.filter((r) => r > 0).length;
    // acumulado = producto de (1+r), no la suma: sumar retornos diarios
    // sobrestima siempre (no es lo mismo -50% y +50% que volver a cero)
    const acum = (rets.reduce((a, r) => a * (1 + r / 100), 1) - 1) * 100;
    const mejor = datos.reduce((a, b) => (b.ret_pct > a.ret_pct ? b : a));
    const peor = datos.reduce((a, b) => (b.ret_pct < a.ret_pct ? b : a));
    return { n: rets.length, positivos, acum, mejor, peor };
  }, [datos]);

  if (!ticker) {
    return (
      <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">
        Elegí un ticker de la tabla
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 mb-1 shrink-0 flex-wrap">
        {VENTANAS.map((v) => (
          <button
            key={v.label}
            onClick={() => setVentana(v.dias)}
            className={`px-1.5 py-0.5 text-[9px] font-semibold tracking-wide border transition-colors ${
              ventana === v.dias
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}
          >
            {v.label}
          </button>
        ))}
        {resumen && (
          <span className="ml-auto text-[9px] text-[var(--t-text-muted)] font-mono">
            {resumen.n} ruedas · {resumen.positivos} en verde ·{" "}
            <span style={{ color: resumen.acum >= 0 ? VERDE : ROJO }}>
              {resumen.acum >= 0 ? "+" : ""}
              {resumen.acum.toFixed(1)}% acum.
            </span>
          </span>
        )}
      </div>

      <div className="flex-1 min-h-0">
        {loading && !datos.length ? (
          <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">
            cargando…
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-negative,#f85149)]">
            no pude traer los retornos ({error})
          </div>
        ) : !datos.length ? (
          <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-dim)]">
            sin serie de precios para {ticker}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={datos} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="var(--t-border-2)" vertical={false} />
              <XAxis
                dataKey="fecha"
                tickFormatter={fmtFecha}
                tick={{ fontSize: 9, fill: "var(--t-text-dim)" }}
                stroke="var(--t-border-2)"
                minTickGap={28}
              />
              <YAxis
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 9, fill: "var(--t-text-dim)" }}
                stroke="var(--t-border-2)"
                width={38}
              />
              <ReferenceLine y={0} stroke="var(--t-border)" />
              <Tooltip
                cursor={{ fill: "var(--t-border-2)", opacity: 0.3 }}
                contentStyle={{
                  background: "var(--t-panel)",
                  border: "1px solid var(--t-border-2)",
                  fontSize: 10,
                }}
                formatter={(v) => {
                  const n = Number(v);
                  return [`${n >= 0 ? "+" : ""}${n.toFixed(2)}%`, "retorno"];
                }}
              />
              <Bar dataKey="ret_pct" isAnimationActive={false}>
                {/* color por signo: verde arriba de cero, rojo abajo */}
                {datos.map((p) => (
                  <Cell key={p.fecha} fill={p.ret_pct >= 0 ? VERDE : ROJO} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
