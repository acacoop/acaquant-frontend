"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────

interface SeriePoint {
  fecha: string;
  valuacion: number;
  n: number;
}

interface SerieResp {
  id_cuenta: string;
  serie: SeriePoint[];
  ultimo: SeriePoint | null;
  primero: SeriePoint | null;
}

interface MensualRow {
  mes: string;             // "YYYY-MM"
  ultimo_dia: string;      // "YYYY-MM-DD"
  valuacion_cierre: number;
  depositos: number;
  extracciones: number;
  flujo_neto: number;
  delta_bruto: number | null;
  delta_real: number | null;
  n_posiciones: number;
}

interface MensualResp {
  id_cuenta: string;
  meses: MensualRow[];
  n_meses: number;
}

interface Posicion {
  ticker: string;
  tipo: string | null;
  cantidad: number;
  precio: number;
  valuacion: number;
  share: number | null;
}

interface PosicionesResp {
  id_cuenta: string;
  fecha: string | null;
  posiciones: Posicion[];
  total: number;
  n: number;
}

interface Props { idCuenta: string }

// ── Helpers ───────────────────────────────────────────────────────────────

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmtCompact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e12) return sign + "$" + (abs / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return sign + "$" + (abs / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return sign + "$" + (abs / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return sign + "$" + (abs / 1e3).toFixed(1) + "K";
  return sign + "$" + abs.toFixed(0);
}

function fmtSigned(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return (n >= 0 ? "+" : "") + fmtCompact(n);
}

function fmtFechaCorta(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y.slice(-2)}`;
}

function fmtMesCorto(s: string): string {
  // "YYYY-MM" o "YYYY-MM-DD" → "Abr 26"
  const [y, m] = s.split("-").map(Number);
  return `${MESES[m - 1]} ${String(y).slice(-2)}`;
}

function fmtMesAnio(s: string): string {
  const [y, m] = s.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

function fmtQty(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

// Escala "nice" para Y-axis: no forzar 0, redondear a valores limpios
// alrededor del rango real. Mismo helper que aum-view.tsx.
function niceScale(
  min: number,
  max: number,
  maxTicks = 5,
): { min: number; max: number; ticks: number[] } {
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) {
    const d = Math.abs(min) || 1;
    return { min: min - d, max: max + d, ticks: [min - d, min, min + d] };
  }
  const range = max - min;
  const roughStep = range / Math.max(1, maxTicks - 1);
  const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / pow10;
  const niceStep =
    normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  const step = niceStep * pow10;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step / 2; t += step)
    ticks.push(+t.toFixed(10));
  return { min: niceMin, max: niceMax, ticks };
}

// ── Componente ────────────────────────────────────────────────────────────

export function ValuacionesView({ idCuenta }: Props) {
  const [serieResp, setSerieResp] = useState<SerieResp | null>(null);
  const [mensualResp, setMensualResp] = useState<MensualResp | null>(null);
  const [posResp, setPosResp] = useState<PosicionesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const base = `/api/valuaciones/${encodeURIComponent(idCuenta)}`;
        const [s, m, p] = await Promise.all([
          fetch(`${base}/serie`,                { cache: "no-store" }).then((r) => {
            if (!r.ok) throw new Error(`serie HTTP ${r.status}`);
            return r.json() as Promise<SerieResp>;
          }),
          fetch(`${base}/mensual`,              { cache: "no-store" }).then((r) => {
            if (!r.ok) throw new Error(`mensual HTTP ${r.status}`);
            return r.json() as Promise<MensualResp>;
          }),
          fetch(`${base}/posiciones-actuales`,  { cache: "no-store" }).then((r) => {
            if (!r.ok) throw new Error(`pos HTTP ${r.status}`);
            return r.json() as Promise<PosicionesResp>;
          }),
        ]);
        if (cancelled) return;
        setSerieResp(s);
        setMensualResp(m);
        setPosResp(p);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [idCuenta]);

  // Datos del chart: mensual (ascendente). El último mes se actualiza con el
  // ultimo fecha_snapshot disponible (ya está en valuacion_cierre del último
  // doc del mes — backend hace $last). El user quiere ver el valor "live" del
  // mes actual, lo cual ya está cubierto.
  type ChartPoint = { mes: string; valuacion: number; ultimo: string };
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!mensualResp) return [];
    // El backend devuelve descendente; reversa para chart cronológico.
    return mensualResp.meses
      .slice()
      .reverse()
      .map((r) => ({
        mes:       r.mes,
        valuacion: r.valuacion_cierre,
        ultimo:    r.ultimo_dia,
      }));
  }, [mensualResp]);

  // Y-axis scale: niceScale sobre los valores reales, no fuerza 0.
  // Si el portfolio fluctúa entre 25M y 35M, el chart muestra ese rango,
  // no 0-35M (donde la variación se aplana).
  const yScale = useMemo(() => {
    if (chartData.length < 2) {
      return { min: 0, max: 1, ticks: [0, 1] };
    }
    const vals = chartData.map((d) => d.valuacion);
    return niceScale(Math.min(...vals), Math.max(...vals), 5);
  }, [chartData]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[#555555] text-sm">
        Cargando valuaciones…
      </div>
    );
  }
  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-[#ff3333] text-sm p-4">
        Error: {error}
      </div>
    );
  }

  const meses = mensualResp?.meses ?? [];
  const posiciones = posResp?.posiciones ?? [];
  const totalPos = posResp?.total ?? 0;
  const ultimoSnap = posResp?.fecha;

  if (chartData.length === 0 && meses.length === 0 && posiciones.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#555] text-sm p-6 text-center">
        Sin datos de valuación para cuenta [{idCuenta}].
        <br />
        <span className="text-[#444] text-xs">
          Asegurate que jobs/aum.py haya generado snapshots en Valuaciones.AuM.
        </span>
      </div>
    );
  }

  const colorDelta = (n: number | null | undefined) =>
    n == null ? "#888" : n >= 0 ? "#00cc66" : "#ff3333";

  return (
    <div className="h-full grid grid-cols-[1fr_1.2fr] gap-3 p-3 overflow-hidden">

      {/* COLUMNA IZQUIERDA: chart arriba + tabla mensual abajo */}
      <div className="min-h-0 grid grid-rows-[3fr_2fr] gap-3 overflow-hidden">

        {/* Chart panel */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
              Evolución mensual · cuenta [{idCuenta}]
            </span>
            {chartData.length > 0 && (
              <span className="ml-3 text-[9px] text-[#555] font-mono">
                {fmtMesCorto(chartData[0].mes)} → {fmtMesCorto(chartData[chartData.length - 1].mes)}
              </span>
            )}
            {serieResp?.ultimo && (
              <span className="ml-auto text-[10px] text-[#888] font-mono">
                Último: <span className="text-[#4a9eff] font-semibold">{fmtCompact(serieResp.ultimo.valuacion)}</span> ({fmtFechaCorta(serieResp.ultimo.fecha)})
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 p-2">
            {chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[11px] text-[#555]">
                Sin meses con data.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 12, bottom: 24, left: 8 }}
                >
                  <defs>
                    <linearGradient id="grad-val" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4a9eff" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#4a9eff" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#161616" vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tick={{ fill: "#808080", fontSize: 10 }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    tickFormatter={(v: string) => fmtMesCorto(v)}
                    angle={-30}
                    textAnchor="end"
                    height={38}
                  />
                  <YAxis
                    domain={[yScale.min, yScale.max]}
                    ticks={yScale.ticks}
                    tick={{ fill: "#808080", fontSize: 10 }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    tickFormatter={(v: number) => fmtCompact(v)}
                    width={64}
                  />
                  <Tooltip
                    cursor={{ stroke: "#ffffff20" }}
                    contentStyle={{
                      background: "#0e0e0e",
                      border: "1px solid #2a2a2a",
                      fontSize: 11,
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                    labelStyle={{ color: "#808080" }}
                    itemStyle={{ color: "#d0d0d0" }}
                    labelFormatter={(v) => fmtMesAnio(String(v))}
                    formatter={(v) => [fmtCompact(Number(v)), "Cierre"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="valuacion"
                    stroke="#4a9eff"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#4a9eff" }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tabla mensual compacta */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
              Mensual
            </span>
            <span className="ml-auto text-[10px] text-[#888] font-mono">
              {meses.length} mes{meses.length !== 1 ? "es" : ""}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {meses.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[11px] text-[#555]">
                Sin datos mensuales.
              </div>
            ) : (
              <table className="w-full text-[11px] font-mono tabular-nums">
                <thead className="sticky top-0 bg-[#0f0f0f] z-10 text-[9px] uppercase tracking-widest text-[#666]">
                  <tr>
                    <th className="px-2 py-1 text-left border-b border-[#1a1a1a]">Mes</th>
                    <th className="px-2 py-1 text-right border-b border-[#1a1a1a]">Cierre</th>
                    <th
                      className="px-2 py-1 text-right border-b border-[#1a1a1a]"
                      title="Depósitos − extracciones del mes"
                    >Flujo neto</th>
                    <th
                      className="px-2 py-1 text-right border-b border-[#1a1a1a]"
                      title="Δ valuación REAL = (cierre_t − cierre_t−1) − flujo_neto. Aísla performance de inversiones."
                    >Δ valor</th>
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m) => (
                    <tr key={m.mes} className="border-t border-[#111] hover:bg-[#0f0f0f]">
                      <td className="px-2 py-1 text-[#ff9900] font-semibold">{fmtMesCorto(m.mes)}</td>
                      <td className="px-2 py-1 text-right text-[#d0d0d0] font-semibold">
                        {fmtCompact(m.valuacion_cierre)}
                      </td>
                      <td
                        className="px-2 py-1 text-right"
                        style={{ color: m.flujo_neto !== 0 ? colorDelta(m.flujo_neto) : "#666" }}
                      >
                        {m.flujo_neto !== 0 ? fmtSigned(m.flujo_neto) : "—"}
                      </td>
                      <td
                        className="px-2 py-1 text-right font-semibold"
                        style={{ color: colorDelta(m.delta_real) }}
                      >
                        {m.delta_real != null ? fmtSigned(m.delta_real) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* COLUMNA DERECHA: posición actual */}
      <div className="min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
        <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
          <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
            Posición actual
          </span>
          {ultimoSnap && (
            <span className="ml-2 text-[9px] text-[#555] font-mono">
              {fmtFechaCorta(ultimoSnap)}
            </span>
          )}
          <span className="ml-auto text-[10px] text-[#888] font-mono">
            {posiciones.length} · <span className="text-[#4a9eff] font-semibold">{fmtCompact(totalPos)}</span>
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {posiciones.length === 0 ? (
            <div className="h-full flex items-center justify-center text-[11px] text-[#555]">
              Sin posiciones activas.
            </div>
          ) : (
            <table className="w-full text-[11px] font-mono tabular-nums">
              <thead className="sticky top-0 bg-[#0f0f0f] z-10 text-[9px] uppercase tracking-widest text-[#666]">
                <tr>
                  <th className="px-2 py-1 text-left border-b border-[#1a1a1a]">Ticker</th>
                  <th className="px-2 py-1 text-right border-b border-[#1a1a1a]">Cant.</th>
                  <th className="px-2 py-1 text-right border-b border-[#1a1a1a]">Precio</th>
                  <th className="px-2 py-1 text-right border-b border-[#1a1a1a]">Valuación</th>
                  <th className="px-2 py-1 text-right border-b border-[#1a1a1a]">%</th>
                </tr>
              </thead>
              <tbody>
                {posiciones.map((p) => (
                  <tr key={p.ticker} className="border-t border-[#111] hover:bg-[#0f0f0f]">
                    <td className="px-2 py-1 text-[#ff9900] font-semibold">{p.ticker}</td>
                    <td className="px-2 py-1 text-right text-[#d0d0d0]">{fmtQty(p.cantidad)}</td>
                    <td className="px-2 py-1 text-right text-[#888]">{fmtPrice(p.precio)}</td>
                    <td
                      className="px-2 py-1 text-right font-semibold"
                      style={{ color: p.valuacion >= 0 ? "#d0d0d0" : "#ff3333" }}
                    >
                      {fmtCompact(p.valuacion)}
                    </td>
                    <td className="px-2 py-1 text-right text-[#888]">
                      {p.share != null ? p.share.toFixed(1) + "%" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
}
