"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface SeriePoint {
  fecha: string;
  total: number;
  por_emisor: Record<string, number>;
}

interface SnapshotRow {
  unidad: string;
  emisor: string;
  ticker: string;
  cuenta: string;
  id_cuenta: string;
  valuacion: number;
  cantidad: number;
}

const BRAND_BLUE = "#094293";

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtFull(n: number): string {
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtFecha(k: string): string {
  const [y, m, d] = k.split("-");
  return `${d}/${m}/${y.slice(-2)}`;
}

function niceScale(
  min: number,
  max: number,
  maxTicks = 5
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

export function AumView() {
  const [loadingSerie, setLoadingSerie] = useState(true);
  const [serieErr, setSerieErr] = useState<string | null>(null);
  const [serie, setSerie] = useState<SeriePoint[]>([]);

  const [loadingSnap, setLoadingSnap] = useState(false);
  const [snapErr, setSnapErr] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotRow[]>([]);
  const [fechaSel, setFechaSel] = useState<string>("");
  const [emisorSel, setEmisorSel] = useState<string | null>(null);

  // desde: últimos 9 meses, hasta: hoy
  const desdeInit = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 9);
    return d.toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingSerie(true);
        const res = await fetch(
          `/api/aum-fci/serie?desde=${desdeInit}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const arr: SeriePoint[] = Array.isArray(json.serie) ? json.serie : [];
        setSerie(arr);
        if (arr.length && !fechaSel) setFechaSel(arr[arr.length - 1].fecha);
        setSerieErr(null);
      } catch (e) {
        if (!cancelled) setSerieErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoadingSerie(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [desdeInit, fechaSel]);

  useEffect(() => {
    if (!fechaSel) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingSnap(true);
        setEmisorSel(null);
        const res = await fetch(
          `/api/aum-fci/snapshot?fecha=${fechaSel}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setSnapshot(Array.isArray(json.docs) ? json.docs : []);
        setSnapErr(null);
      } catch (e) {
        if (!cancelled) setSnapErr(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoadingSnap(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fechaSel]);

  const fechasAll = useMemo(() => serie.map((s) => s.fecha), [serie]);
  const [rangoIdx, setRangoIdx] = useState<[number, number] | null>(null);
  useEffect(() => {
    if (fechasAll.length && !rangoIdx)
      setRangoIdx([0, fechasAll.length - 1]);
  }, [fechasAll, rangoIdx]);

  const chartData = useMemo(() => {
    if (!rangoIdx) return serie;
    return serie.slice(rangoIdx[0], rangoIdx[1] + 1);
  }, [serie, rangoIdx]);

  const ultimo = serie.length ? serie[serie.length - 1] : null;

  // snapshot: total, por emisor, por ticker/cuenta
  const snapshotTotal = useMemo(
    () => snapshot.reduce((s, r) => s + r.valuacion, 0),
    [snapshot]
  );

  const porEmisor = useMemo(() => {
    const agg: Record<string, number> = {};
    for (const r of snapshot) agg[r.emisor] = (agg[r.emisor] || 0) + r.valuacion;
    return Object.entries(agg)
      .map(([emisor, val]) => ({
        emisor,
        valuacion: val,
        share: snapshotTotal ? (val / snapshotTotal) * 100 : 0,
      }))
      .sort((a, b) => b.valuacion - a.valuacion);
  }, [snapshot, snapshotTotal]);

  const detalleEmisor = useMemo(() => {
    if (!emisorSel) return [];
    const sub = snapshot.filter((r) => r.emisor === emisorSel);
    const porTicker: Record<
      string,
      { ticker: string; valuacion: number; cuentas: Record<string, number> }
    > = {};
    for (const r of sub) {
      if (!porTicker[r.ticker])
        porTicker[r.ticker] = { ticker: r.ticker, valuacion: 0, cuentas: {} };
      porTicker[r.ticker].valuacion += r.valuacion;
      porTicker[r.ticker].cuentas[r.cuenta] =
        (porTicker[r.ticker].cuentas[r.cuenta] || 0) + r.valuacion;
    }
    return Object.values(porTicker)
      .map((t) => ({
        ticker: t.ticker,
        valuacion: t.valuacion,
        cuentas: Object.entries(t.cuentas)
          .map(([cuenta, val]) => ({ cuenta, valuacion: val }))
          .sort((a, b) => b.valuacion - a.valuacion),
      }))
      .sort((a, b) => b.valuacion - a.valuacion);
  }, [snapshot, emisorSel]);

  if (loadingSerie) {
    return (
      <div className="h-full flex items-center justify-center text-[#555555] text-sm">
        Cargando…
      </div>
    );
  }
  if (serieErr) {
    return (
      <div className="h-full flex items-center justify-center text-[#ff3333] text-sm">
        Error: {serieErr}
      </div>
    );
  }
  if (serie.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#555555] text-sm">
        Sin datos FCI.
      </div>
    );
  }

  const vals = chartData.map((d) => d.total);
  const yScale =
    vals.length > 1
      ? niceScale(Math.min(...vals), Math.max(...vals), 4)
      : { min: 0, max: Math.max(1, vals[0] || 1), ticks: [0, vals[0] || 1] };

  return (
    <div className="h-full min-h-0 p-3 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 h-full min-h-0">
        {/* COLUMNA IZQUIERDA — evolución + stats */}
        <div className="min-h-0 grid grid-rows-[auto_auto_1fr] gap-3">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <Kpi
              label="TOTAL FCI (HOY)"
              value={fmtCompact(ultimo?.total || 0)}
              accent={BRAND_BLUE}
            />
            <Kpi
              label="SOC. GERENTES"
              value={String(Object.keys(ultimo?.por_emisor || {}).length)}
            />
            <Kpi
              label="SNAPSHOTS"
              value={String(serie.length)}
              sub={`desde ${fmtFecha(serie[0].fecha)}`}
            />
          </div>

          {/* Chart evolución */}
          <div className="border border-[#1a1a1a] bg-[#080808]">
            <PanelHeader
              title="EVOLUCIÓN FCI"
              sub={
                chartData.length
                  ? `${fmtFecha(chartData[0].fecha)} → ${fmtFecha(
                      chartData[chartData.length - 1].fecha
                    )}`
                  : ""
              }
            />
            <div className="p-2">
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 4, right: 10, bottom: 22, left: 0 }}
                  >
                    <defs>
                      <linearGradient id="grad-fci" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={BRAND_BLUE}
                          stopOpacity={0.5}
                        />
                        <stop
                          offset="100%"
                          stopColor={BRAND_BLUE}
                          stopOpacity={0.03}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="fecha"
                      tick={{ fill: "#808080", fontSize: 9 }}
                      axisLine={{ stroke: "#2a2a2a" }}
                      tickLine={false}
                      tickFormatter={(v: string) => fmtFecha(v)}
                      interval={Math.max(0, Math.floor(chartData.length / 8))}
                      angle={-35}
                      textAnchor="end"
                      height={28}
                    />
                    <YAxis
                      domain={[yScale.min, yScale.max]}
                      ticks={yScale.ticks}
                      tick={{ fill: "#808080", fontSize: 9 }}
                      axisLine={{ stroke: "#2a2a2a" }}
                      tickLine={false}
                      tickFormatter={(v: number) => fmtCompact(v)}
                      width={55}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0e0e0e",
                        border: "1px solid #2a2a2a",
                        fontSize: 11,
                        fontFamily: "JetBrains Mono, monospace",
                      }}
                      labelStyle={{ color: "#808080" }}
                      labelFormatter={(v) => fmtFecha(String(v))}
                      formatter={(v) => [fmtCompact(Number(v)), "Total FCI"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke={BRAND_BLUE}
                      strokeWidth={2}
                      fill="url(#grad-fci)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {fechasAll.length > 1 && rangoIdx && (
                <div className="px-2 pt-1 pb-0 flex items-center gap-2 text-[10px] text-[#888888]">
                  <span className="min-w-[70px]">
                    {fmtFecha(fechasAll[rangoIdx[0]])}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={fechasAll.length - 1}
                    value={rangoIdx[0]}
                    onChange={(e) => {
                      const v = Math.min(
                        parseInt(e.target.value),
                        rangoIdx[1] - 1
                      );
                      setRangoIdx([v, rangoIdx[1]]);
                    }}
                    className="flex-1 accent-[#ff9900]"
                  />
                  <input
                    type="range"
                    min={0}
                    max={fechasAll.length - 1}
                    value={rangoIdx[1]}
                    onChange={(e) => {
                      const v = Math.max(
                        parseInt(e.target.value),
                        rangoIdx[0] + 1
                      );
                      setRangoIdx([rangoIdx[0], v]);
                    }}
                    className="flex-1 accent-[#ff9900]"
                  />
                  <span className="min-w-[70px] text-right">
                    {fmtFecha(fechasAll[rangoIdx[1]])}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Leaderboard por emisor del snapshot */}
          <div className="border border-[#1a1a1a] bg-[#080808] overflow-hidden flex flex-col min-h-0">
            <PanelHeader
              title={`POR SOC. GERENTE · ${fmtFecha(fechaSel)}`}
              sub={`${porEmisor.length} emisores`}
            />
            <div className="flex-1 min-h-0 overflow-y-auto">
              {loadingSnap ? (
                <div className="py-6 text-center text-[#555555] text-[11px]">
                  Cargando snapshot…
                </div>
              ) : snapshot.length === 0 ? (
                <div className="py-6 text-center text-[#555555] text-[11px]">
                  Sin datos para esta fecha.
                </div>
              ) : (
                <table className="w-full text-[11px] font-mono">
                  <thead className="sticky top-0 bg-[#080808] z-10">
                    <tr>
                      <th className="!px-2 !py-1 text-left">EMISOR</th>
                      <th className="!px-2 !py-1 text-right">VALUACIÓN</th>
                      <th className="!px-2 !py-1 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porEmisor.map((r) => {
                      const active = emisorSel === r.emisor;
                      return (
                        <tr
                          key={r.emisor}
                          onClick={() =>
                            setEmisorSel(active ? null : r.emisor)
                          }
                          className={`cursor-pointer border-b border-[#111111] transition-colors ${
                            active
                              ? "bg-[#ff9900]/10 text-[#ff9900]"
                              : "hover:bg-[#ff9900]/5"
                          }`}
                        >
                          <td className="!px-2 !py-1 text-[#d0d0d0]">
                            {r.emisor}
                          </td>
                          <td className="!px-2 !py-1 text-right">
                            {fmtCompact(r.valuacion)}
                          </td>
                          <td className="!px-2 !py-1 text-right text-[#888888]">
                            {r.share.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA — snapshot date picker + drill-down */}
        <div className="min-h-0 grid grid-rows-[auto_1fr] gap-3">
          <div className="border border-[#1a1a1a] bg-[#080808]">
            <PanelHeader title="SNAPSHOT" sub={fmtFecha(fechaSel)} />
            <div className="p-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-[#555555] uppercase tracking-wide mb-1">
                  Fecha snapshot
                </div>
                <select
                  value={fechaSel}
                  onChange={(e) => setFechaSel(e.target.value)}
                  className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
                >
                  {fechasAll
                    .slice()
                    .reverse()
                    .map((f) => (
                      <option key={f} value={f}>
                        {fmtFecha(f)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex flex-col justify-end">
                <div className="text-[10px] text-[#555555] uppercase tracking-wide">
                  Total FCI
                </div>
                <div
                  className="text-[20px] font-semibold"
                  style={{ color: BRAND_BLUE }}
                >
                  {fmtFull(snapshotTotal)}
                </div>
              </div>
            </div>
          </div>

          <div className="border border-[#1a1a1a] bg-[#080808] overflow-hidden flex flex-col min-h-0">
            <PanelHeader
              title="DETALLE"
              sub={
                emisorSel
                  ? `${emisorSel} · ${fmtCompact(
                      porEmisor.find((p) => p.emisor === emisorSel)
                        ?.valuacion || 0
                    )}`
                  : "Seleccioná un emisor"
              }
            />
            <div className="flex-1 min-h-0 overflow-y-auto p-2">
              {snapErr ? (
                <div className="text-[#ff3333] text-[11px] p-2">
                  Error: {snapErr}
                </div>
              ) : !emisorSel ? (
                <div className="py-6 text-center text-[#555555] text-[11px]">
                  Seleccioná una sociedad gerente para ver sus fondos y cuentas.
                </div>
              ) : detalleEmisor.length === 0 ? (
                <div className="py-6 text-center text-[#555555] text-[11px]">
                  Sin detalle.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {detalleEmisor.map((t) => (
                    <TickerCard
                      key={t.ticker}
                      ticker={t.ticker}
                      valuacion={t.valuacion}
                      cuentas={t.cuentas}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TickerCard({
  ticker,
  valuacion,
  cuentas,
}: {
  ticker: string;
  valuacion: number;
  cuentas: { cuenta: string; valuacion: number }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#1a1a1a] bg-[#0a0a0a]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center px-3 py-2 hover:bg-[#ff9900]/5 transition-colors"
      >
        <span className="text-[11px] font-semibold text-[#d0d0d0] tracking-wide">
          {ticker}
        </span>
        <span
          className="ml-auto text-[12px] font-semibold"
          style={{ color: "#094293" }}
        >
          {fmtFull(valuacion)}
        </span>
        <span className="ml-3 text-[10px] text-[#555555]">
          {open ? "▼" : "▶"}
        </span>
      </button>
      {open && (
        <div className="border-t border-[#1a1a1a] bg-[#060606]">
          {cuentas.map((c) => (
            <div
              key={c.cuenta}
              className="flex items-center px-3 py-1 text-[11px] border-b border-[#111111] last:border-b-0"
            >
              <span className="text-[#888888] truncate">{c.cuenta}</span>
              <span className="ml-auto font-semibold text-[#d0d0d0]">
                {fmtFull(c.valuacion)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2">
      <div className="text-[10px] text-[#555555] uppercase tracking-wide">
        {label}
      </div>
      <div
        className="text-[18px] font-semibold truncate"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-[#666666]">{sub}</div>}
    </div>
  );
}

function PanelHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10 shrink-0">
      <span className="text-[11px] font-semibold text-[#ff9900] tracking-wide uppercase">
        {title}
      </span>
      {sub && (
        <span className="ml-auto text-[10px] text-[#888888] truncate max-w-[60%]">
          {sub}
        </span>
      )}
    </div>
  );
}

