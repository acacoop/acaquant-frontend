"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
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

// ── Tasa Fija ─────────────────────────────────────────────────────────────────

interface TFCuenta { cuenta: string; id_cuenta: string; valuacion: number; cantidad: number; cobro_proyectado: number }
interface TFTicker {
  ticker: string; fecha_vencimiento: string | null;
  flujo_vencimiento: number; valuacion: number; cantidad: number;
  cobro_proyectado: number; cuentas: TFCuenta[];
}
interface TFData { fecha: string | null; total_valuacion: number; total_cobro: number; tickers: TFTicker[] }

function fmtVto(s: string | null): string {
  if (!s) return "-";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(-2)}`;
}

function TabTasaFija() {
  const [data, setData]           = useState<TFData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selTicker, setSelTicker] = useState<string | null>(null);
  const [verVN, setVerVN]         = useState(false);

  useEffect(() => {
    fetch("/api/portfolio/tasa-fija", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: TFData) => { setData(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-full flex items-center justify-center text-[#555555] text-sm">Cargando…</div>;
  if (!data || !data.tickers.length) return <div className="h-full flex items-center justify-center text-[#555555] text-sm">Sin posiciones de Tasa Fija.</div>;

  const tickers = data.tickers;
  const tickerSel = selTicker ? tickers.find((t) => t.ticker === selTicker) ?? null : null;

  const colSrc  = verVN ? "cantidad"  : "valuacion";
  const colLbl  = verVN ? "VN"        : "VALUACIÓN";
  const fmtCol  = verVN
    ? (v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 2 })
    : (v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 0 });

  const chartData = tickers
    .filter((t) => t.cobro_proyectado > 0 && t.fecha_vencimiento)
    .map((t) => ({ fecha: fmtVto(t.fecha_vencimiento), monto: t.cobro_proyectado, ticker: t.ticker }));

  return (
    <div className="h-full flex flex-col gap-3 p-3 overflow-hidden min-h-0">
      {/* KPIs + toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <Kpi label="VALUACIÓN ACTUAL" value={fmtCompact(data.total_valuacion)} accent={BRAND_BLUE} />
        <Kpi label="COBRO PROYECTADO" value={fmtCompact(data.total_cobro)} accent="#00cc66" />
        <Kpi label="FECHA SNAPSHOT"   value={fmtVto(data.fecha)} />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-[#555555]">VALOR NOMINAL</span>
          <button
            onClick={() => setVerVN((v) => !v)}
            className={`w-8 h-4 rounded-full transition-colors relative ${verVN ? "bg-[#ff9900]" : "bg-[#2a2a2a]"}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${verVN ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
        </div>
      </div>

      {/* Tabla tickers + detalle cuentas */}
      <div className="grid grid-cols-[1fr_1fr] gap-3 min-h-0" style={{ height: "38%" }}>
        {/* Tickers */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <PanelHeader title="POSICIONES POR TICKER" />
          <div className="flex-1 overflow-y-auto">
            <table>
              <thead><tr><th>TICKER</th><th>VENCIMIENTO</th><th className="text-right">{colLbl}</th><th className="text-right">COBRO PROY.</th></tr></thead>
              <tbody>
                {tickers.map((t) => (
                  <tr
                    key={t.ticker}
                    onClick={() => setSelTicker(selTicker === t.ticker ? null : t.ticker)}
                    className={`cursor-pointer ${selTicker === t.ticker ? "bg-[#ff9900]/10" : ""}`}
                  >
                    <td className="text-[#ff9900] font-semibold">{t.ticker}</td>
                    <td className="text-[#808080]">{fmtVto(t.fecha_vencimiento)}</td>
                    <td className="text-right font-mono">{fmtCol(t[colSrc])}</td>
                    <td className="text-right font-mono text-[#00cc66]">{t.cobro_proyectado.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cuentas */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <PanelHeader title={tickerSel ? `CUENTAS — ${tickerSel.ticker}` : "CUENTAS (seleccioná un ticker)"} />
          <div className="flex-1 overflow-y-auto">
            {tickerSel ? (
              <table>
                <thead><tr><th>CUENTA</th><th className="text-right">{colLbl}</th><th className="text-right">COBRO PROY.</th></tr></thead>
                <tbody>
                  {tickerSel.cuentas.sort((a, b) => b.valuacion - a.valuacion).map((c, i) => (
                    <tr key={i}>
                      <td className="text-[#d0d0d0] whitespace-normal break-words max-w-[180px]">{c.cuenta}</td>
                      <td className="text-right font-mono">{fmtCol(verVN ? c.cantidad : c.valuacion)}</td>
                      <td className="text-right font-mono text-[#00cc66]">{c.cobro_proyectado.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[#555555] text-xs py-4 text-center">Clickeá un ticker para ver detalle por cuenta.</p>
            )}
          </div>
        </div>
      </div>

      {/* Gráfico amortizaciones */}
      {chartData.length > 0 && (
        <div className="flex-1 min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <PanelHeader title="COBRO PROYECTADO POR VENCIMIENTO" />
          <div className="flex-1 min-h-0 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
                <XAxis dataKey="fecha" tick={{ fill: "#808080", fontSize: 10 }} axisLine={{ stroke: "#2a2a2a" }} tickLine={false} angle={-35} textAnchor="end" height={36} />
                <YAxis tick={{ fill: "#808080", fontSize: 10 }} axisLine={{ stroke: "#2a2a2a" }} tickLine={false} tickFormatter={(v) => fmtCompact(v)} width={60} />
                <Tooltip
                  contentStyle={{ background: "#0e0e0e", border: "1px solid #2a2a2a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                  formatter={(v, _, entry) => [`${Number(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`, String((entry as { payload?: { ticker?: string } })?.payload?.ticker ?? "")]}
                  labelFormatter={(l) => `Vto: ${l}`}
                />
                <Bar dataKey="monto" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                  {chartData.map((_, i) => <Cell key={i} fill={BRAND_BLUE} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

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

type AumTab = "fci" | "tasa_fija";

export function AumView() {
  const [tab, setTab] = useState<AumTab>("fci");
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

  type RangoKey = "1M" | "3M" | "6M" | "YTD" | "ALL";
  const [rangoKey, setRangoKey] = useState<RangoKey>("ALL");

  const chartData = useMemo(() => {
    if (!serie.length || rangoKey === "ALL") return serie;
    const hoy = new Date();
    let corte: Date;
    if (rangoKey === "YTD") {
      corte = new Date(hoy.getFullYear(), 0, 1);
    } else {
      const meses = rangoKey === "1M" ? 1 : rangoKey === "3M" ? 3 : 6;
      corte = new Date(hoy.getFullYear(), hoy.getMonth() - meses, hoy.getDate());
    }
    const corteStr = corte.toISOString().slice(0, 10);
    return serie.filter((s) => s.fecha >= corteStr);
  }, [serie, rangoKey]);

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

  const tabBar = (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
      {(["fci", "tasa_fija"] as AumTab[]).map((t) => (
        <button key={t} onClick={() => setTab(t)}
          className={`px-3 py-0.5 text-[11px] font-semibold tracking-wide border transition-colors ${
            tab === t ? "bg-[#ff9900] text-black border-[#ff9900]" : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
          }`}>
          {t === "fci" ? "FCI" : "TASA FIJA"}
        </button>
      ))}
    </div>
  );

  if (tab === "tasa_fija") {
    return (
      <div className="h-full flex flex-col min-h-0">
        {tabBar}
        <div className="flex-1 min-h-0"><TabTasaFija /></div>
      </div>
    );
  }

  if (loadingSerie) {
    return (
      <div className="h-full flex flex-col min-h-0">
        {tabBar}
        <div className="flex-1 flex items-center justify-center text-[#555555] text-sm">Cargando…</div>
      </div>
    );
  }
  if (serieErr) {
    return (
      <div className="h-full flex flex-col min-h-0">
        {tabBar}
        <div className="flex-1 flex items-center justify-center text-[#ff3333] text-sm">Error: {serieErr}</div>
      </div>
    );
  }
  if (serie.length === 0) {
    return (
      <div className="h-full flex flex-col min-h-0">
        {tabBar}
        <div className="flex-1 flex items-center justify-center text-[#555555] text-sm">Sin datos FCI.</div>
      </div>
    );
  }

  const vals = chartData.map((d) => d.total);
  const yScale =
    vals.length > 1
      ? niceScale(Math.min(...vals), Math.max(...vals), 4)
      : { min: 0, max: Math.max(1, vals[0] || 1), ticks: [0, vals[0] || 1] };

  return (
    <div className="h-full flex flex-col min-h-0">
      {tabBar}
      <div className="flex-1 min-h-0 p-3 overflow-hidden">
      <div className="grid grid-cols-2 gap-3 h-full min-h-0">
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

              {fechasAll.length > 1 && (
                <div className="px-2 pt-1 pb-0 flex items-center justify-center gap-1">
                  {(["1M", "3M", "6M", "YTD", "ALL"] as RangoKey[]).map((k) => (
                    <button
                      key={k}
                      onClick={() => setRangoKey(k)}
                      className={`px-2 h-[22px] text-[10px] font-semibold tracking-wide border transition-colors ${
                        rangoKey === k
                          ? "bg-[#ff9900] text-black border-[#ff9900]"
                          : "bg-transparent text-[#888888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
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

