"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  desde: string | null;
  hasta: string | null;
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
  delta_valuacion: number | null;
  n_posiciones: number;
}

interface MensualResp {
  id_cuenta: string;
  meses: MensualRow[];
  n_meses: number;
}

interface Props {
  /** id_cuenta MVP — typicamente "805". */
  idCuenta: string;
}

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

function fmtMesAnio(s: string): string {
  // "YYYY-MM" → "Abr 2026"
  const [y, m] = s.split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
}

// ── Componente ────────────────────────────────────────────────────────────

export function ValuacionesView({ idCuenta }: Props) {
  const [serieResp, setSerieResp] = useState<SerieResp | null>(null);
  const [mensualResp, setMensualResp] = useState<MensualResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, m] = await Promise.all([
          fetch(`/api/valuaciones/${encodeURIComponent(idCuenta)}/serie`,
                { cache: "no-store" }).then((r) => {
            if (!r.ok) throw new Error(`serie HTTP ${r.status}`);
            return r.json() as Promise<SerieResp>;
          }),
          fetch(`/api/valuaciones/${encodeURIComponent(idCuenta)}/mensual`,
                { cache: "no-store" }).then((r) => {
            if (!r.ok) throw new Error(`mensual HTTP ${r.status}`);
            return r.json() as Promise<MensualResp>;
          }),
        ]);
        if (cancelled) return;
        setSerieResp(s);
        setMensualResp(m);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [idCuenta]);

  const serie = serieResp?.serie ?? [];
  const meses = mensualResp?.meses ?? [];
  const ultimo = serieResp?.ultimo ?? null;

  // KPI: variación entre primer y último día disponible.
  const variacionTotal = useMemo(() => {
    if (!serieResp?.primero || !serieResp?.ultimo) return null;
    const a = serieResp.primero.valuacion;
    const b = serieResp.ultimo.valuacion;
    if (a === 0) return null;
    return ((b - a) / Math.abs(a)) * 100;
  }, [serieResp]);

  // Color para deltas signados.
  const colorDelta = (n: number | null | undefined) =>
    n == null ? "#888" : n >= 0 ? "#00cc66" : "#ff3333";

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

  if (serie.length === 0 && meses.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#555555] text-sm p-6 text-center">
        Sin datos de valuación para cuenta [{idCuenta}].
        <br />
        <span className="text-[#444] text-xs">
          Asegurate que jobs/aum.py esté corriendo y haya snapshots en Valuaciones.AuM.
        </span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-3 gap-3 overflow-hidden">

      {/* KPIs row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
        <Kpi
          label="VALOR ACTUAL"
          value={ultimo ? fmtCompact(ultimo.valuacion) : "—"}
          sub={ultimo ? fmtFechaCorta(ultimo.fecha) : "—"}
          accent="#4a9eff"
        />
        <Kpi
          label="N POSICIONES"
          value={ultimo ? String(ultimo.n) : "—"}
        />
        <Kpi
          label="Δ DEL PERÍODO"
          value={
            variacionTotal != null
              ? (variacionTotal >= 0 ? "+" : "") + variacionTotal.toFixed(2) + "%"
              : "—"
          }
          accent={colorDelta(variacionTotal)}
          sub={
            serieResp?.primero
              ? `desde ${fmtFechaCorta(serieResp.primero.fecha)}`
              : undefined
          }
        />
        <Kpi
          label="DÍAS CON DATA"
          value={String(serie.length)}
        />
      </div>

      {/* Layout: chart top, mensual table bottom */}
      <div className="flex-1 min-h-0 grid grid-rows-[3fr_2fr] gap-3 overflow-hidden">

        {/* Chart panel */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
              Valuación diaria · cuenta [{idCuenta}]
            </span>
            {serie.length > 0 && (
              <span className="ml-3 text-[9px] text-[#555] font-mono">
                {fmtFechaCorta(serie[0].fecha)} → {fmtFechaCorta(serie[serie.length - 1].fecha)}
              </span>
            )}
          </div>
          <div className="flex-1 min-h-0 p-2">
            {serie.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[11px] text-[#555]">
                Sin serie diaria para esta cuenta.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={serie}
                  margin={{ top: 8, right: 12, bottom: 28, left: 8 }}
                >
                  <CartesianGrid stroke="#161616" vertical={false} />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fill: "#808080", fontSize: 10 }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    tickFormatter={fmtFechaCorta}
                    interval={Math.max(0, Math.floor(serie.length / 14))}
                    angle={-35}
                    textAnchor="end"
                    height={42}
                    minTickGap={4}
                  />
                  <YAxis
                    tick={{ fill: "#808080", fontSize: 10 }}
                    axisLine={{ stroke: "#2a2a2a" }}
                    tickLine={false}
                    tickFormatter={(v: number) => fmtCompact(v)}
                    width={64}
                  />
                  <Tooltip
                    cursor={{ fill: "#ffffff08" }}
                    contentStyle={{
                      background: "#0e0e0e",
                      border: "1px solid #2a2a2a",
                      fontSize: 11,
                      fontFamily: "JetBrains Mono, monospace",
                    }}
                    labelStyle={{ color: "#808080" }}
                    itemStyle={{ color: "#d0d0d0" }}
                    labelFormatter={(v) => fmtFechaCorta(String(v))}
                    formatter={(v) => [fmtCompact(Number(v)), "Valuación"]}
                  />
                  <Bar
                    dataKey="valuacion"
                    fill="#4a9eff"
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Monthly table */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
            <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
              Cierre mensual · cuenta [{idCuenta}]
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
                    <th className="px-3 py-1.5 text-left border-b border-[#1a1a1a]">Mes</th>
                    <th className="px-3 py-1.5 text-left border-b border-[#1a1a1a]">Cierre</th>
                    <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">Valuación</th>
                    <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">Δ valuación</th>
                    <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">Depósitos</th>
                    <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">Extracciones</th>
                    <th className="px-3 py-1.5 text-right border-b border-[#1a1a1a]">Flujo neto</th>
                  </tr>
                </thead>
                <tbody>
                  {meses.map((m) => (
                    <tr key={m.mes} className="border-t border-[#111] hover:bg-[#0f0f0f]">
                      <td className="px-3 py-1 text-[#ff9900] font-semibold">{fmtMesAnio(m.mes)}</td>
                      <td className="px-3 py-1 text-[#888]">{fmtFechaCorta(m.ultimo_dia)}</td>
                      <td className="px-3 py-1 text-right text-[#d0d0d0] font-semibold">
                        {fmtCompact(m.valuacion_cierre)}
                      </td>
                      <td
                        className="px-3 py-1 text-right"
                        style={{ color: colorDelta(m.delta_valuacion) }}
                      >
                        {m.delta_valuacion != null ? fmtSigned(m.delta_valuacion) : "—"}
                      </td>
                      <td className="px-3 py-1 text-right text-[#888]">
                        {m.depositos !== 0 ? fmtCompact(m.depositos) : "—"}
                      </td>
                      <td className="px-3 py-1 text-right text-[#888]">
                        {m.extracciones !== 0 ? fmtCompact(m.extracciones) : "—"}
                      </td>
                      <td
                        className="px-3 py-1 text-right font-semibold"
                        style={{ color: colorDelta(m.flujo_neto) }}
                      >
                        {m.flujo_neto !== 0 ? fmtSigned(m.flujo_neto) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* Footnote */}
      <div className="text-[9px] text-[#555] shrink-0">
        Cierre = último fecha_snapshot del mes en Valuaciones.AuM (no
        necesariamente el día 30/31). Flujos = depósitos + transferencias −
        extracciones de CashFlow.NegocioMovimientos. Δ valuación =
        cierre actual − cierre del mes anterior (incluye flujos + performance).
      </div>
    </div>
  );
}

function Kpi({
  label, value, sub, accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2">
      <div className="text-[9px] text-[#555] uppercase tracking-wider mb-1">{label}</div>
      <div
        className="text-[18px] font-mono font-semibold tabular-nums leading-tight"
        style={accent ? { color: accent } : { color: "#d0d0d0" }}
      >
        {value}
      </div>
      {sub && <div className="text-[9px] text-[#666] mt-0.5">{sub}</div>}
    </div>
  );
}
