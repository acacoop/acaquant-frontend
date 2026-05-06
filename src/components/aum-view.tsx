"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { ValuacionesView } from "@/components/valuaciones-view";

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
      <div className="grid grid-cols-[35%_65%] gap-3 min-h-0" style={{ height: "38%" }}>
        {/* Tickers */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <PanelHeader title="POSICIONES POR TICKER" />
          <div className="flex-1 overflow-y-auto">
            <table>
              <thead><tr><th>TICKER</th><th>VTO.</th><th className="text-right">{colLbl}</th><th className="text-right">COBRO</th></tr></thead>
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
                <thead><tr><th>CUENTA</th><th className="text-right">{colLbl}</th><th className="text-right">COBRO</th></tr></thead>
                <tbody>
                  {tickerSel.cuentas.sort((a, b) => b.valuacion - a.valuacion).map((c, i) => (
                    <tr key={i}>
                      <td className="text-[#d0d0d0]">{c.cuenta}</td>
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

// ── CER ───────────────────────────────────────────────────────────────────────

interface CERCuenta { cuenta: string; id_cuenta: string; valuacion: number; cantidad: number }
interface CERTicker {
  ticker: string; fecha_vencimiento: string | null;
  valuacion: number; cantidad: number;
  tea: number | null; paridad: number | null; duration: number | null;
  cuentas: CERCuenta[];
}
interface CERData { fecha: string | null; total_valuacion: number; tickers: CERTicker[] }

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "-";
  // TEA se almacena como decimal (0.12 = 12%). Paridad como 100-based (95 = 95%).
  return v.toFixed(digits);
}

function TabCer() {
  const [data, setData]           = useState<CERData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [selTicker, setSelTicker] = useState<string | null>(null);
  const [verVN, setVerVN]         = useState(false);

  useEffect(() => {
    fetch("/api/portfolio/cer", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: CERData) => { setData(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-full flex items-center justify-center text-[#555555] text-sm">Cargando…</div>;
  if (!data || !data.tickers.length) return <div className="h-full flex items-center justify-center text-[#555555] text-sm">Sin posiciones CER.</div>;

  const tickers = data.tickers;
  const tickerSel = selTicker ? tickers.find((t) => t.ticker === selTicker) ?? null : null;

  const colSrc  = verVN ? "cantidad"  : "valuacion";
  const colLbl  = verVN ? "VN"        : "VALUACIÓN";
  const fmtCol  = verVN
    ? (v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 2 })
    : (v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 0 });

  const chartData = tickers
    .filter((t) => t.valuacion > 0 && t.fecha_vencimiento)
    .map((t) => ({ fecha: fmtVto(t.fecha_vencimiento), monto: t.valuacion, ticker: t.ticker }));

  return (
    <div className="h-full flex flex-col gap-3 p-3 overflow-hidden min-h-0">
      {/* KPIs + toggle */}
      <div className="flex items-center gap-3 shrink-0">
        <Kpi label="VALUACIÓN ACTUAL" value={fmtCompact(data.total_valuacion)} accent={BRAND_BLUE} />
        <Kpi label="TICKERS"          value={String(tickers.length)} />
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
      <div className="grid grid-cols-[45%_55%] gap-3 min-h-0" style={{ height: "38%" }}>
        {/* Tickers */}
        <div className="border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <PanelHeader title="POSICIONES POR TICKER" />
          <div className="flex-1 overflow-y-auto">
            <table>
              <thead>
                <tr>
                  <th>TICKER</th>
                  <th>VTO.</th>
                  <th className="text-right">{colLbl}</th>
                  <th className="text-right">TEA</th>
                  <th className="text-right">PAR.</th>
                </tr>
              </thead>
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
                    <td className="text-right font-mono text-[#888888]">
                      {t.tea != null ? `${(t.tea * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="text-right font-mono text-[#888888]">
                      {t.paridad != null ? fmtPct(t.paridad, 1) : "—"}
                    </td>
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
                <thead><tr><th>CUENTA</th><th className="text-right">{colLbl}</th></tr></thead>
                <tbody>
                  {tickerSel.cuentas.sort((a, b) => b.valuacion - a.valuacion).map((c, i) => (
                    <tr key={i}>
                      <td className="text-[#d0d0d0]">{c.cuenta}</td>
                      <td className="text-right font-mono">{fmtCol(verVN ? c.cantidad : c.valuacion)}</td>
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

      {/* Gráfico valuación por vencimiento */}
      {chartData.length > 0 && (
        <div className="flex-1 min-h-0 border border-[#1a1a1a] bg-[#080808] flex flex-col overflow-hidden">
          <PanelHeader title="VALUACIÓN POR VENCIMIENTO" />
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

type AumTab = "total" | "fci" | "tasa_fija" | "cer" | "valuaciones";

type CuentaDoc = { id_cuenta: string; cuenta: string };

type CuentaFilter = "todas" | "accionistas" | "sin_accionistas" | "cooperativas";
const CUENTA_FILTER_OPTS: { value: CuentaFilter; label: string }[] = [
  { value: "todas",           label: "TODAS" },
  { value: "accionistas",     label: "ACCIONISTAS" },
  { value: "sin_accionistas", label: "SIN ACCIONISTAS" },
  { value: "cooperativas",    label: "COOPERATIVAS" },
];

type Moneda = "ARS" | "USD";

export function AumView() {
  const [tab, setTab] = useState<AumTab>("total");
  const [cuentaFilter, setCuentaFilter] = useState<CuentaFilter>("todas");
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  // Selecciones del drill-down de TOTAL — independientes del emisorSel
  // (cartera) del leaderboard izquierdo. Los tres se combinan con AND.
  const [cuentaSel, setCuentaSel] = useState<string | null>(null);
  const [unidadSel, setUnidadSel] = useState<string | null>(null);
  // Indicadores de MEP faltante para el banner.
  const [fechasSinMep, setFechasSinMep] = useState<string[]>([]);
  const [mepMissingSnap, setMepMissingSnap] = useState<boolean>(false);

  // Selector de cuenta para la sub-tab VALUACIONES (vive bajo /aum como tab).
  const [cuentas, setCuentas] = useState<CuentaDoc[]>([]);
  const [valCuenta, setValCuenta] = useState<string>("");

  useEffect(() => {
    fetch("/api/portfolio-cuentas", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { cuentas: CuentaDoc[] }) => {
        const list = d.cuentas || [];
        setCuentas(list);
        if (list.length && !valCuenta) setValCuenta(list[0].id_cuenta);
      })
      .catch(() => { /* sin lista, el selector queda vacío */ });
  }, [valCuenta]);
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

  // Serie histórica — depende SOLO de desde / tab / moneda.
  // No se filtra por `cuentaFilter`: el chart muestra siempre la evolución
  // total y se navega con sus propios botones de rango (1M/3M/6M/YTD/ALL).
  // El KPI "AUM HOY" se calcula desde el snapshot, no desde la serie.
  useEffect(() => {
    if (tab !== "fci" && tab !== "total") return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingSerie(true);
        const base = tab === "total" ? "/api/aum-total/serie" : "/api/aum-fci/serie";
        const q = new URLSearchParams({ desde: desdeInit, moneda });
        const res = await fetch(`${base}?${q}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const rawSerie = Array.isArray(json.serie) ? json.serie : [];
        const arr: SeriePoint[] = rawSerie.map((p: { fecha: string; total: number; por_emisor?: Record<string, number>; por_cartera?: Record<string, number> }) => ({
          fecha:      p.fecha,
          total:      p.total,
          por_emisor: p.por_emisor ?? p.por_cartera ?? {},
        }));
        setSerie(arr);
        setFechasSinMep(Array.isArray(json.fechas_sin_mep) ? json.fechas_sin_mep : []);
        if (arr.length) setFechaSel(arr[arr.length - 1].fecha);
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
  }, [desdeInit, tab, moneda]);

  // Snapshot — depende de fecha + cuentaFilter + moneda. Es lo que cambia
  // cuando el usuario juega con los filtros; el chart de evolución se queda
  // quieto.
  useEffect(() => {
    if (tab !== "fci" && tab !== "total") return;
    if (!fechaSel) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingSnap(true);
        setEmisorSel(null);
        const base = tab === "total" ? "/api/aum-total/snapshot" : "/api/aum-fci/snapshot";
        const q = new URLSearchParams({ fecha: fechaSel, moneda });
        if (cuentaFilter !== "todas") q.set("cuenta_filter", cuentaFilter);
        const res = await fetch(`${base}?${q}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        const rawDocs = Array.isArray(json.docs) ? json.docs : [];
        const rows: SnapshotRow[] = rawDocs.map((d: { unidad: string; emisor?: string; cartera?: string; ticker?: string; cuenta: string; id_cuenta: string; valuacion: number; cantidad: number }) => ({
          unidad:    d.unidad,
          emisor:    d.emisor ?? d.cartera ?? "—",
          ticker:    d.ticker ?? d.unidad,
          cuenta:    d.cuenta,
          id_cuenta: d.id_cuenta,
          valuacion: d.valuacion,
          cantidad:  d.cantidad,
        }));
        setSnapshot(rows);
        setMepMissingSnap(Boolean(json.mep_missing));
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
  }, [tab, fechaSel, cuentaFilter, moneda]);

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

  // ── Drill-down para TOTAL ──────────────────────────────────────────────
  // Snapshot filtrado por la cartera seleccionada en el leaderboard izquierdo
  // (emisorSel cumple ambos roles: emisor para FCI, cartera para TOTAL).
  const snapshotByCartera = useMemo(
    () => (emisorSel ? snapshot.filter((r) => r.emisor === emisorSel) : snapshot),
    [snapshot, emisorSel]
  );

  // Lista POR CUENTA: respeta filtro de cartera + filtro cruzado de unidad.
  const porCuenta = useMemo(() => {
    let base = snapshotByCartera;
    if (unidadSel) base = base.filter((r) => r.ticker === unidadSel || r.unidad === unidadSel);
    const agg: Record<string, number> = {};
    for (const r of base) agg[r.cuenta] = (agg[r.cuenta] || 0) + r.valuacion;
    const totalCtx = Object.values(agg).reduce((s, v) => s + v, 0);
    return Object.entries(agg)
      .map(([cuenta, val]) => ({
        cuenta,
        valuacion: val,
        share: totalCtx ? (val / totalCtx) * 100 : 0,
      }))
      .sort((a, b) => b.valuacion - a.valuacion);
  }, [snapshotByCartera, unidadSel]);

  // Lista POR ASSET (unidad/ticker): respeta cartera + filtro cruzado de cuenta.
  const porUnidad = useMemo(() => {
    let base = snapshotByCartera;
    if (cuentaSel) base = base.filter((r) => r.cuenta === cuentaSel);
    const agg: Record<string, number> = {};
    for (const r of base) {
      const k = r.ticker || r.unidad;
      agg[k] = (agg[k] || 0) + r.valuacion;
    }
    const totalCtx = Object.values(agg).reduce((s, v) => s + v, 0);
    return Object.entries(agg)
      .map(([ticker, val]) => ({
        ticker,
        valuacion: val,
        share: totalCtx ? (val / totalCtx) * 100 : 0,
      }))
      .sort((a, b) => b.valuacion - a.valuacion);
  }, [snapshotByCartera, cuentaSel]);

  // Reset selecciones de drill-down si cambia tab, snapshot o cartera —
  // los IDs viejos podrían ya no estar en el set actual.
  useEffect(() => {
    setCuentaSel(null);
    setUnidadSel(null);
  }, [tab, fechaSel, emisorSel]);

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
      {(["total", "fci", "tasa_fija", "cer", "valuaciones"] as AumTab[]).map((t) => (
        <button key={t} onClick={() => setTab(t)}
          className={`px-3 py-0.5 text-[11px] font-semibold tracking-wide border transition-colors ${
            tab === t ? "bg-[#ff9900] text-black border-[#ff9900]" : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
          }`}>
          {t === "fci" ? "FCI" : t === "total" ? "TOTAL" : t === "tasa_fija" ? "TASA FIJA" : t === "cer" ? "CER" : "VALUACIONES"}
        </button>
      ))}
      {(tab === "fci" || tab === "total") && (
        <div className="ml-auto flex items-center gap-3">
          {tab === "total" && (
            <div className="flex items-center gap-2">
              <span className="text-[9px] tracking-widest text-[#666]">MONEDA</span>
              {(["ARS", "USD"] as Moneda[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMoneda(m)}
                  className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
                    moneda === m
                      ? "bg-[#ff9900] text-black border-[#ff9900]"
                      : "bg-transparent text-[#888] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[9px] tracking-widest text-[#666]">CUENTAS</span>
            <select
              value={cuentaFilter}
              onChange={(e) => setCuentaFilter(e.target.value as CuentaFilter)}
              className="bg-black border border-[#2a2a2a] text-[10px] px-2 py-0.5 text-[#d0d0d0] font-mono focus:border-[#ff9900] focus:outline-none"
            >
              {CUENTA_FILTER_OPTS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );

  if (tab === "valuaciones") {
    return (
      <div className="h-full flex flex-col min-h-0">
        {tabBar}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[#1a1a1a] bg-[#080808] shrink-0">
          <span className="text-[9px] tracking-widest text-[#666]">CUENTA</span>
          <CuentaCombobox cuentas={cuentas} value={valCuenta} onChange={setValCuenta} />
        </div>
        <div className="flex-1 min-h-0">
          {valCuenta ? (
            <ValuacionesView idCuenta={valCuenta} />
          ) : (
            <div className="h-full flex items-center justify-center text-[#555] text-sm">
              Cargando cuentas…
            </div>
          )}
        </div>
      </div>
    );
  }

  if (tab === "tasa_fija") {
    return (
      <div className="h-full flex flex-col min-h-0">
        {tabBar}
        <div className="flex-1 min-h-0"><TabTasaFija /></div>
      </div>
    );
  }

  if (tab === "cer") {
    return (
      <div className="h-full flex flex-col min-h-0">
        {tabBar}
        <div className="flex-1 min-h-0"><TabCer /></div>
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
      <div className="flex-1 min-h-0 p-3 overflow-hidden flex flex-col gap-2">
      {moneda === "USD" && fechasSinMep.length > 0 && (
        <div className="border border-[#ff9900]/40 bg-[#ff9900]/5 px-3 py-1.5 text-[10px] text-[#ff9900]">
          ⚠ Sin cotización MEP para {fechasSinMep.length} fecha{fechasSinMep.length > 1 ? "s" : ""} de la serie
          {fechasSinMep.length <= 5 ? `: ${fechasSinMep.join(", ")}` : `. Ej: ${fechasSinMep.slice(0, 5).join(", ")}…`}.
          Esos puntos quedan en ARS sin convertir; revisar feed `Valuaciones.Dolar` para esas fechas.
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
        {/* COLUMNA IZQUIERDA — evolución + stats.
            En TOTAL: chart toma todo el espacio sobrante (1fr), KPI single,
            leaderboard "POR CARTERA" content-based con max-height (suelen
            ser pocas carteras, no llena la pantalla). */}
        <div className={`min-h-0 grid gap-3 ${
          tab === "total" ? "grid-rows-[auto_1fr_auto]" : "grid-rows-[auto_auto_1fr]"
        }`}>
          {/* KPIs */}
          {tab === "total" ? (
            <div className="grid grid-cols-1">
              <Kpi
                label={`AUM TOTAL (HOY) · ${moneda}`}
                value={fmtCompact(snapshotTotal)}
                accent={BRAND_BLUE}
                sub={fmtFecha(fechaSel)}
              />
            </div>
          ) : (
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
          )}

          {/* Chart evolución */}
          <div className={`border border-[#1a1a1a] bg-[#080808] ${
            tab === "total" ? "flex flex-col min-h-0" : ""
          }`}>
            <PanelHeader
              title={tab === "total" ? "EVOLUCIÓN AUM" : "EVOLUCIÓN FCI"}
              sub={
                chartData.length
                  ? `${fmtFecha(chartData[0].fecha)} → ${fmtFecha(
                      chartData[chartData.length - 1].fecha
                    )}`
                  : ""
              }
            />
            <div className={`p-2 ${tab === "total" ? "flex-1 min-h-0 flex flex-col" : ""}`}>
              <div className={tab === "total" ? "flex-1 min-h-0" : "h-[220px]"}>
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
                      formatter={(v) => [fmtCompact(Number(v)), tab === "total" ? "Total AUM" : "Total FCI"]}
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

          {/* Leaderboard del snapshot — por emisor (FCI) o por cartera (TOTAL).
              En TOTAL: max-height baja porque suelen ser pocas carteras —
              dejamos respirar el chart de evolución. */}
          <div className={`border border-[#1a1a1a] bg-[#080808] overflow-hidden flex flex-col min-h-0 ${
            tab === "total" ? "max-h-[28vh]" : ""
          }`}>
            <PanelHeader
              title={`${tab === "total" ? "POR CARTERA" : "POR SOC. GERENTE"} · ${fmtFecha(fechaSel)}`}
              sub={`${porEmisor.length} ${tab === "total" ? "carteras" : "emisores"}`}
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

        {/* COLUMNA DERECHA — snapshot date picker + drill-down.
            En TOTAL: versión compacta sin PanelHeader ni label redundante. */}
        <div className="min-h-0 grid grid-rows-[auto_1fr] gap-3">
          {tab === "total" ? (
            // Mismo padding (px-3 py-2) y borde que el Kpi del lado izquierdo
            // — así los topes de las dos columnas quedan alineados al pixel.
            <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2">
              <div className="text-[10px] text-[#555555] uppercase tracking-wide">
                FECHA SNAPSHOT
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <select
                  value={fechaSel}
                  onChange={(e) => setFechaSel(e.target.value)}
                  className="bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[14px] px-2 py-0.5 font-mono focus:border-[#ff9900] outline-none"
                >
                  {fechasAll.slice().reverse().map((f) => (
                    <option key={f} value={f}>{fmtFecha(f)}</option>
                  ))}
                </select>
                {mepMissingSnap && moneda === "USD" && (
                  <span className="text-[9px] tracking-widest text-[#ff9900] border border-[#ff9900]/40 px-2 py-0.5">
                    ⚠ SIN MEP
                  </span>
                )}
              </div>
              <div className="text-[10px] text-[#666666] mt-0.5">
                {snapshot.length} posiciones
              </div>
            </div>
          ) : (
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
                    {fechasAll.slice().reverse().map((f) => (
                      <option key={f} value={f}>{fmtFecha(f)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <div className="text-[10px] text-[#555555] uppercase tracking-wide">
                    Total FCI
                  </div>
                  <div className="text-[20px] font-semibold" style={{ color: BRAND_BLUE }}>
                    {fmtFull(snapshotTotal)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "total" ? (
            // ── DETALLE TOTAL: dos sub-tablas (CUENTA + ASSET) con
            //     filtro cruzado y reactivo a la cartera del leaderboard.
            <div className="border border-[#1a1a1a] bg-[#080808] overflow-hidden flex flex-col min-h-0">
              <PanelHeader
                title="DETALLE"
                sub={(() => {
                  const parts: string[] = [];
                  if (emisorSel) parts.push(`cartera: ${emisorSel}`);
                  if (cuentaSel) parts.push(`cuenta: ${cuentaSel}`);
                  if (unidadSel) parts.push(`asset: ${unidadSel}`);
                  return parts.length ? parts.join(" · ") : "todos los assets y cuentas";
                })()}
              />
              <div className="flex-1 min-h-0 overflow-y-auto p-2 grid grid-rows-2 gap-2">
                {/* POR CUENTA */}
                <div className="border border-[#1a1a1a] bg-[#0a0a0a] flex flex-col min-h-0">
                  <div className="px-3 py-1.5 text-[10px] tracking-widest text-[#888] flex items-center border-b border-[#1a1a1a]">
                    <span>POR CUENTA</span>
                    <span className="ml-2 text-[#555]">{porCuenta.length}</span>
                    {(cuentaSel || unidadSel) && (
                      <button
                        onClick={() => { setCuentaSel(null); setUnidadSel(null); }}
                        className="ml-auto text-[#666] hover:text-[#ff9900] text-[9px]"
                      >
                        ↺ limpiar
                      </button>
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {porCuenta.length === 0 ? (
                      <div className="py-6 text-center text-[#555] text-[10px]">Sin datos.</div>
                    ) : (
                      porCuenta.map((c) => {
                        const sel = cuentaSel === c.cuenta;
                        return (
                          <button
                            key={c.cuenta}
                            onClick={() => setCuentaSel(sel ? null : c.cuenta)}
                            className={`w-full grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-1 text-[11px] border-b border-[#111] last:border-b-0 transition-colors ${
                              sel ? "bg-[#ff9900]/10 text-[#ff9900]" : "text-[#d0d0d0] hover:bg-[#ff9900]/5"
                            }`}
                          >
                            <span className="text-left truncate" title={c.cuenta}>{c.cuenta}</span>
                            <span className="font-mono">{fmtCompact(c.valuacion)}</span>
                            <span className="text-[9px] text-[#666] w-10 text-right">{c.share.toFixed(1)}%</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
                {/* POR ASSET */}
                <div className="border border-[#1a1a1a] bg-[#0a0a0a] flex flex-col min-h-0">
                  <div className="px-3 py-1.5 text-[10px] tracking-widest text-[#888] flex items-center border-b border-[#1a1a1a]">
                    <span>POR ASSET</span>
                    <span className="ml-2 text-[#555]">{porUnidad.length}</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {porUnidad.length === 0 ? (
                      <div className="py-6 text-center text-[#555] text-[10px]">Sin datos.</div>
                    ) : (
                      porUnidad.map((u) => {
                        const sel = unidadSel === u.ticker;
                        return (
                          <button
                            key={u.ticker}
                            onClick={() => setUnidadSel(sel ? null : u.ticker)}
                            className={`w-full grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-1 text-[11px] border-b border-[#111] last:border-b-0 transition-colors ${
                              sel ? "bg-[#ff9900]/10 text-[#ff9900]" : "text-[#d0d0d0] hover:bg-[#ff9900]/5"
                            }`}
                          >
                            <span className="text-left truncate" title={u.ticker}>{u.ticker}</span>
                            <span className="font-mono">{fmtCompact(u.valuacion)}</span>
                            <span className="text-[9px] text-[#666] w-10 text-right">{u.share.toFixed(1)}%</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
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
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// Combobox tipeable — input con dropdown filtrable. UX: al hacer focus abre la
// lista; al tipear filtra por id_cuenta o denominación; click en opción
// selecciona; ESC o click afuera cierra.
function CuentaCombobox({
  cuentas,
  value,
  onChange,
}: {
  cuentas: CuentaDoc[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const selected = cuentas.find((c) => c.id_cuenta === value);
  const display = selected
    ? `[${selected.id_cuenta}] ${selected.cuenta.replace(/^\[\d+\]\s*/, "")}`
    : "";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cuentas;
    return cuentas.filter(
      (c) =>
        c.id_cuenta.toLowerCase().includes(q) ||
        c.cuenta.toLowerCase().includes(q),
    );
  }, [cuentas, search]);

  // Click afuera cierra. Usamos un ref por si seguís en el dropdown.
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const select = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlighted((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlighted]) select(filtered[highlighted].id_cuenta);
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  };

  return (
    <div ref={wrapRef} className="relative min-w-[320px]">
      <input
        type="text"
        value={open ? search : display}
        onFocus={() => { setOpen(true); setHighlighted(0); }}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); setHighlighted(0); }}
        onKeyDown={handleKey}
        placeholder={cuentas.length === 0 ? "— sin cuentas —" : "Buscar cuenta…"}
        className="w-full bg-black border border-[#2a2a2a] text-[10px] px-2 py-0.5 text-[#d0d0d0] font-mono focus:border-[#ff9900] focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-0.5 z-50 max-h-[280px] overflow-auto bg-[#080808] border border-[#2a2a2a] shadow-lg">
          {filtered.map((c, i) => {
            const isSel = c.id_cuenta === value;
            const isHi = i === highlighted;
            return (
              <li
                key={c.id_cuenta}
                onMouseEnter={() => setHighlighted(i)}
                onMouseDown={(e) => { e.preventDefault(); select(c.id_cuenta); }}
                className={`px-2 py-1 text-[10px] font-mono cursor-pointer ${
                  isSel
                    ? "text-[#ff9900]"
                    : isHi
                      ? "bg-[#ff9900]/10 text-[#d0d0d0]"
                      : "text-[#d0d0d0] hover:bg-[#ff9900]/5"
                }`}
              >
                <span className="text-[#888]">[{c.id_cuenta}]</span>{" "}
                {c.cuenta.replace(/^\[\d+\]\s*/, "")}
              </li>
            );
          })}
        </ul>
      )}
      {open && filtered.length === 0 && (
        <div className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-[#080808] border border-[#2a2a2a] px-2 py-2 text-[10px] text-[#666]">
          Sin resultados
        </div>
      )}
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

