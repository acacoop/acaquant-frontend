"use client";

import { useEffect, useMemo, useState } from "react";
import { useViewportKey } from "@/lib/use-viewport-key";
import { DualRange } from "./dual-range";
import { SensibilidadTable } from "./sensibilidad-table";
import { CanjeTab } from "./canje-tab";
import { DescomposicionTab } from "./descomposicion-tab";
import { CompararInversionView } from "./comparar-inversion-view";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface HistRow {
  fecha: string;
  ticker: string;
  price: number | null;
}

interface RetornoData {
  curva: string;
  rows: HistRow[];
  mep: Record<string, number>;
  oficial: Record<string, number>;
  // Calendario de cobros (cupones + amortizaciones) por ticker. `monto` es
  // cash real por 100 de VN, misma escala que el precio: pesos para
  // tasa_fija/cer (CER-ajustado), USD para soberanos.
  flujos: Record<string, Array<{ fecha: string; monto: number }>>;
}

interface TablaRow {
  ticker: string;
  base: number;
  fechaBase: string;
  final: number;
  fechaFinal: string;
  retArs: number;
  retUsd: number | null;
}

type Curva = "tasa_fija" | "cer" | "soberanos";

const POLL_MS = 300_000; // 5 min — refresh para tomar precios del día

const PALETA = [
  "#ff9900",
  "#4a9eff",
  "var(--t-pos)",
  "var(--t-neg)",
  "#bb66ff",
  "#00cccc",
  "#ffee44",
  "#ff66aa",
  "#aaff00",
  "#ff6600",
];

function addDays(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtFechaCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type EstrategiaTab = "retorno_total" | "sensibilidad" | "canje" | "descomposicion" | "comparar";

export function RetornoTotalView() {
  const [tab, setTab] = useState<EstrategiaTab>("comparar");

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0">
        <span className="text-[11px] font-semibold text-[var(--t-accent)] tracking-widest mr-3">
          ESTRATEGIA
        </span>
        <TabPill
          label="RETORNO TOTAL"
          active={tab === "retorno_total"}
          onClick={() => setTab("retorno_total")}
        />
        <TabPill
          label="ANÁLISIS SENSIBILIDAD"
          active={tab === "sensibilidad"}
          onClick={() => setTab("sensibilidad")}
        />
        <TabPill
          label="CANJE"
          active={tab === "canje"}
          onClick={() => setTab("canje")}
        />
        <TabPill
          label="DESCOMPOSICIÓN"
          active={tab === "descomposicion"}
          onClick={() => setTab("descomposicion")}
        />
        <TabPill
          label="COMPARAR INVERSIÓN"
          active={tab === "comparar"}
          onClick={() => setTab("comparar")}
        />
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "retorno_total" && <HistoricoTab />}
        {tab === "sensibilidad" && <SensibilidadTable />}
        {tab === "canje" && <CanjeTab />}
        {tab === "descomposicion" && <DescomposicionTab />}
        {tab === "comparar" && <CompararInversionView />}
      </div>
    </div>
  );
}

function TabPill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-[11px] font-semibold tracking-wide border ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {label}
    </button>
  );
}

function HistoricoTab() {
  const [curva, setCurva] = useState<Curva>("tasa_fija");
  const [byCurva, setByCurva] = useState<Record<string, RetornoData>>({});
  const vpKey = useViewportKey();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Moneda del CHART: ARS (default) o USD. Solo aplica a curvas en pesos —
  // soberanos siempre USD. La tabla muestra SIEMPRE ambos retornos.
  const [monedaChart, setMonedaChart] = useState<"ARS" | "USD">("ARS");
  // Dólar usado para dolarizar (MEP u Oficial A3500).
  const [dolarTipo, setDolarTipo] = useState<"mep" | "oficial">("mep");

  const esPesos = curva === "tasa_fija" || curva === "cer";

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/analitica/retorno-total?curva=${encodeURIComponent(curva)}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: RetornoData = await res.json();
        if (cancelled) return;
        setByCurva((prev) => ({ ...prev, [curva]: j }));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [curva]);

  const curr = byCurva[curva];
  const rows = useMemo<HistRow[]>(() => curr?.rows || [], [curr]);
  const flujos = useMemo<RetornoData["flujos"]>(() => curr?.flujos || {}, [curr]);

  const fechas = useMemo(
    () => Array.from(new Set(rows.map((r) => r.fecha))).sort(),
    [rows],
  );
  const tickers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.ticker))).sort(),
    [rows],
  );

  const [rangoIdx, setRangoIdx] = useState<[number, number] | null>(null);

  const effectiveRango: [number, number] =
    fechas.length > 0
      ? rangoIdx == null
        ? [0, fechas.length - 1]
        : [
            Math.min(Math.max(0, rangoIdx[0]), fechas.length - 1),
            Math.min(Math.max(rangoIdx[0], rangoIdx[1]), fechas.length - 1),
          ]
      : [0, 0];

  const fechaDesde = fechas[effectiveRango[0]];
  const fechaHasta = fechas[effectiveRango[1]];

  // Serie del dólar activa (mep u oficial), ordenada asc para carry-forward.
  const dolarSorted = useMemo<Array<[string, number]>>(() => {
    if (!esPesos || !curr) return [];
    const obj = dolarTipo === "mep" ? curr.mep : curr.oficial;
    return Object.entries(obj || {}).sort((a, b) => a[0].localeCompare(b[0]));
  }, [curr, dolarTipo, esPesos]);

  const { chartData, tabla } = useMemo(() => {
    const vacio = {
      chartData: [] as Array<Record<string, string | number>>,
      tabla: [] as TablaRow[],
    };
    if (!rows.length || !fechaDesde || !fechaHasta) return vacio;

    // Serie por ticker: [(fecha, price)] ordenada asc, sin nulls. Incluye
    // fechas anteriores al rango — necesarias para el carry-forward.
    const serieByTicker: Record<string, Array<{ fecha: string; price: number }>> = {};
    for (const r of rows) {
      if (r.price == null) continue;
      (serieByTicker[r.ticker] ??= []).push({ fecha: r.fecha, price: r.price });
    }
    for (const tk in serieByTicker) {
      serieByTicker[tk].sort((a, b) => a.fecha.localeCompare(b.fecha));
    }

    // Cada flujo de Trading.Curvas trae el `fecha` de PAGO, pero el bono
    // cotiza "ex" unos días antes → el precio cae antes de esa fecha. Si
    // contáramos el flujo por la fecha de pago, el chart muestra un pozo
    // fake (precio ya bajó, flujo aún no sumado) y después salta. Alineamos
    // cada flujo a la fecha del mayor desplome de precio en una ventana
    // alrededor del pago — sólo si ese desplome es comparable al monto del
    // flujo (así un cupón chico no se "pega" a un movimiento de mercado).
    const flujosAlin: Record<string, Array<{ fecha: string; monto: number }>> = {};
    for (const tk in flujos) {
      const serie = serieByTicker[tk] || [];
      flujosAlin[tk] = (flujos[tk] || []).map((fl) => {
        const lo = addDays(fl.fecha, -25);
        const hi = addDays(fl.fecha, 7);
        let mejorFecha = fl.fecha;
        let mejorCaida = 0;
        for (let i = 1; i < serie.length; i++) {
          const d = serie[i].fecha;
          if (d < lo || d > hi) continue;
          const caida = serie[i - 1].price - serie[i].price;
          if (caida > mejorCaida) {
            mejorCaida = caida;
            mejorFecha = d;
          }
        }
        return {
          fecha: mejorCaida >= fl.monto * 0.5 ? mejorFecha : fl.fecha,
          monto: fl.monto,
        };
      });
    }

    // Dólar "as-of": último valor con fecha <= target (carry-forward, el
    // MEP no se mueve fines de semana / feriados).
    const dolarAsOf = (fecha: string): number | null => {
      let v: number | null = null;
      for (const [f, val] of dolarSorted) {
        if (f <= fecha) v = val;
        else break;
      }
      return v;
    };

    // Σ de cupones + amortizaciones cobrados en (desdeF, hastaF] para un
    // ticker. Sumar esto al precio convierte la "variación de precio" en
    // RETORNO TOTAL — un bono que amortiza deja de mostrar pérdida fake
    // porque el capital devuelto cuenta como cobrado.
    const sumaFlujos = (tk: string, desdeF: string, hastaF: string): number => {
      let s = 0;
      for (const fl of flujosAlin[tk] || []) {
        if (fl.fecha > desdeF && fl.fecha <= hastaF) s += fl.monto;
      }
      return s;
    };
    // Igual, dolarizando cada cobro al dólar de SU fecha de pago.
    const sumaFlujosUsd = (tk: string, desdeF: string, hastaF: string): number => {
      let s = 0;
      for (const fl of flujosAlin[tk] || []) {
        if (fl.fecha > desdeF && fl.fecha <= hastaF) {
          const d = dolarAsOf(fl.fecha);
          if (d && d > 0) s += fl.monto / d;
        }
      }
      return s;
    };

    // Base ARS de cada ticker = precio as-of fechaDesde. Si el ticker
    // recién empieza a cotizar dentro del rango, base = su primera fecha
    // disponible.
    const baseInfo: Record<string, { base: number; fechaBase: string }> = {};
    for (const tk in serieByTicker) {
      const serie = serieByTicker[tk];
      let base: { fecha: string; price: number } | null = null;
      for (const pt of serie) {
        if (pt.fecha <= fechaDesde) base = pt;
        else break;
      }
      if (!base) {
        const dentro = serie.find((pt) => pt.fecha >= fechaDesde && pt.fecha <= fechaHasta);
        if (dentro) base = dentro;
      }
      if (base) baseInfo[tk] = { base: base.price, fechaBase: base.fecha };
    }

    // Precios reales dentro del rango (el chart muestra solo los puntos
    // que operaron; connectNulls los une).
    const precioPorFecha: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (r.price == null) continue;
      if (r.fecha < fechaDesde || r.fecha > fechaHasta) continue;
      (precioPorFecha[r.fecha] ??= {})[r.ticker] = r.price;
    }
    const fechasRango = fechas.filter((f) => f >= fechaDesde && f <= fechaHasta);
    if (!fechasRango.length) return vacio;

    // ¿El chart muestra USD? Solo curvas en pesos con toggle en USD.
    const chartUSD = esPesos && monedaChart === "USD";

    const chartData = fechasRango.map((f) => {
      const row: Record<string, string | number> = { fecha: f };
      const precios = precioPorFecha[f] || {};
      const dolF = chartUSD ? dolarAsOf(f) : null;
      for (const [tk, p] of Object.entries(precios)) {
        const bi = baseInfo[tk];
        if (!bi || bi.base <= 0 || f < bi.fechaBase) continue;
        if (chartUSD) {
          const dolBase = dolarAsOf(bi.fechaBase);
          if (!dolF || !dolBase || dolF <= 0 || dolBase <= 0) continue;
          const pUsd = p / dolF + sumaFlujosUsd(tk, bi.fechaBase, f);
          const baseUsd = bi.base / dolBase;
          if (baseUsd <= 0) continue;
          row[tk] = +((pUsd / baseUsd - 1) * 100).toFixed(3);
        } else {
          const tot = p + sumaFlujos(tk, bi.fechaBase, f);
          row[tk] = +((tot / bi.base - 1) * 100).toFixed(3);
        }
      }
      return row;
    });

    // Tabla: retorno ARS + retorno USD por ticker. final = último precio
    // con fecha <= fechaHasta (carry-forward). Para soberanos retUsd
    // queda null — el price ya está en USD, retArs ES el retorno en USD.
    const tabla = tickers
      .map((tk): TablaRow | null => {
        const bi = baseInfo[tk];
        const serie = serieByTicker[tk];
        if (!bi || !serie) return null;
        let fin: { fecha: string; price: number } | null = null;
        for (const pt of serie) {
          if (pt.fecha <= fechaHasta) fin = pt;
          else break;
        }
        if (!fin) return null;
        // Retorno TOTAL: precio + cupones/amortizaciones cobrados en el período.
        const flujoArs = sumaFlujos(tk, bi.fechaBase, fin.fecha);
        const retArs = +(((fin.price + flujoArs) / bi.base - 1) * 100).toFixed(2);
        let retUsd: number | null = null;
        if (esPesos) {
          const dolBase = dolarAsOf(bi.fechaBase);
          const dolFin = dolarAsOf(fin.fecha);
          if (dolBase && dolFin && dolBase > 0 && dolFin > 0) {
            const baseUsd = bi.base / dolBase;
            const finUsd =
              fin.price / dolFin + sumaFlujosUsd(tk, bi.fechaBase, fin.fecha);
            if (baseUsd > 0) retUsd = +((finUsd / baseUsd - 1) * 100).toFixed(2);
          }
        }
        return {
          ticker: tk,
          base: bi.base,
          fechaBase: bi.fechaBase,
          final: fin.price,
          fechaFinal: fin.fecha,
          retArs,
          retUsd,
        };
      })
      .filter((x): x is TablaRow => x !== null)
      .sort((a, b) => {
        // Ordena por la moneda que se está mostrando en el chart.
        const ka = esPesos && monedaChart === "USD" ? (a.retUsd ?? -9999) : a.retArs;
        const kb = esPesos && monedaChart === "USD" ? (b.retUsd ?? -9999) : b.retArs;
        return kb - ka;
      });

    return { chartData, tabla };
  }, [rows, flujos, fechaDesde, fechaHasta, tickers, fechas, dolarSorted, esPesos, monedaChart]);

  const monedaLabel = !esPesos ? "USD" : monedaChart;

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3">
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 shrink-0 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <FilterBtn active={curva === "tasa_fija"} onClick={() => { setCurva("tasa_fija"); setRangoIdx(null); }}>
            TASA FIJA
          </FilterBtn>
          <FilterBtn active={curva === "cer"} onClick={() => { setCurva("cer"); setRangoIdx(null); }}>
            CER
          </FilterBtn>
          <FilterBtn active={curva === "soberanos"} onClick={() => { setCurva("soberanos"); setRangoIdx(null); }}>
            HARD DOLAR
          </FilterBtn>
        </div>

        {/* Toggle ARS/USD del chart + selector de dólar — solo curvas en pesos */}
        {esPesos && (
          <>
            <div className="flex items-center gap-1 border-l border-[var(--t-border-2)] pl-3">
              <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] mr-1">Chart</span>
              <FilterBtn active={monedaChart === "ARS"} onClick={() => setMonedaChart("ARS")}>
                ARS
              </FilterBtn>
              <FilterBtn active={monedaChart === "USD"} onClick={() => setMonedaChart("USD")}>
                USD
              </FilterBtn>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] mr-1">Dólar</span>
              <FilterBtn active={dolarTipo === "mep"} onClick={() => setDolarTipo("mep")}>
                MEP
              </FilterBtn>
              <FilterBtn active={dolarTipo === "oficial"} onClick={() => setDolarTipo("oficial")}>
                OFICIAL
              </FilterBtn>
            </div>
          </>
        )}

        <span className="text-[10px] text-[var(--t-text-muted)] font-mono px-1">
          Chart en {monedaLabel}
        </span>

        {loading ? (
          <span className="text-[10px] text-[var(--t-text-muted)]">cargando…</span>
        ) : error ? (
          <span className="text-[10px] text-[var(--t-neg)]">error: {error}</span>
        ) : fechas.length < 2 ? (
          <span className="text-[10px] text-[var(--t-text-muted)]">sin datos</span>
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <span className="text-[10px] text-[var(--t-accent)] font-mono min-w-[36px]">
              {fmtFechaCorta(fechaDesde || "")}
            </span>
            <DualRange
              min={0}
              max={fechas.length - 1}
              lo={effectiveRango[0]}
              hi={effectiveRango[1]}
              setLo={(v) => setRangoIdx([v, Math.max(v, effectiveRango[1])])}
              setHi={(v) => setRangoIdx([Math.min(v, effectiveRango[0]), v])}
            />
            <span className="text-[10px] text-[var(--t-accent)] font-mono min-w-[36px] text-right">
              {fmtFechaCorta(fechaHasta || "")}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-2 min-h-0">
          {chartData.length < 2 ? (
            <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">Sin datos suficientes.</p>
          ) : (
            <ResponsiveContainer key={vpKey} width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 20, bottom: 28, left: 4 }}>
                <CartesianGrid stroke="var(--t-border)" vertical={false} />
                <XAxis
                  dataKey="fecha"
                  tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                  axisLine={{ stroke: "var(--t-border-2)" }}
                  tickLine={false}
                  angle={-35}
                  textAnchor="end"
                  height={40}
                  tickFormatter={fmtFechaCorta}
                  interval={Math.max(0, Math.floor(chartData.length / 12))}
                />
                <YAxis
                  tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                  axisLine={{ stroke: "var(--t-border-2)" }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                  width={55}
                />
                <ReferenceLine y={0} stroke="#555" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{
                    background: "var(--t-surface)",
                    border: "1px solid var(--t-border-2)",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  labelStyle={{ color: "var(--t-accent)" }}
                  labelFormatter={(v) => fmtFechaCorta(String(v))}
                  formatter={(v, name) => [`${Number(v).toFixed(2)}%`, String(name)]}
                />
                <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 10 }} />
                {tickers.map((tk, i) => (
                  <Line
                    key={tk}
                    type="monotone"
                    dataKey={tk}
                    stroke={PALETA[i % PALETA.length]}
                    strokeWidth={1.6}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-2 overflow-y-auto min-h-0">
          <div className="text-[10px] text-[var(--t-text-muted)] tracking-wide mb-1">
            {fechaDesde && fechaHasta ? `${fmtFechaCorta(fechaDesde)} → ${fmtFechaCorta(fechaHasta)}` : ""}
          </div>
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
              <tr className="text-[var(--t-text-muted)]">
                <th className="!px-1 text-left">TICKER</th>
                <th className="!px-1 text-right">BASE</th>
                <th className="!px-1 text-right">FINAL</th>
                {esPesos ? (
                  <>
                    <th className="!px-1 text-right">RET ARS</th>
                    <th className="!px-1 text-right" title={`Retorno dolarizado al ${dolarTipo.toUpperCase()}`}>
                      RET USD
                    </th>
                  </>
                ) : (
                  <th className="!px-1 text-right">RETORNO</th>
                )}
              </tr>
            </thead>
            <tbody>
              {tabla.map((r, i) => {
                const baseDesalineada = r.fechaBase !== fechaDesde;
                const finalDesalineado = r.fechaFinal !== fechaHasta;
                return (
                  <tr
                    key={r.ticker}
                    className={i % 2 === 0 ? "bg-[var(--t-panel)]" : ""}
                    title={
                      `Base: ${r.fechaBase}  ·  Final: ${r.fechaFinal}` +
                      (baseDesalineada || finalDesalineado
                        ? "  (sin precio exacto en la fecha elegida — se usó el más cercano)"
                        : "")
                    }
                  >
                    <td className="!px-1 text-[var(--t-accent)] whitespace-nowrap">
                      {r.ticker}
                      {baseDesalineada && (
                        <span className="text-[var(--t-text-muted)] ml-1">›{fmtFechaCorta(r.fechaBase)}</span>
                      )}
                    </td>
                    <td className="!px-1 text-right text-[var(--t-text-dim)]">{r.base.toFixed(2)}</td>
                    <td className="!px-1 text-right text-[var(--t-text)]">{r.final.toFixed(2)}</td>
                    {esPesos ? (
                      <>
                        <td
                          className={`!px-1 text-right font-semibold ${
                            r.retArs >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
                          }`}
                        >
                          {r.retArs >= 0 ? "+" : ""}
                          {r.retArs.toFixed(2)}%
                        </td>
                        <td
                          className={`!px-1 text-right font-semibold ${
                            r.retUsd == null
                              ? "text-[var(--t-text-muted)]"
                              : r.retUsd >= 0
                                ? "text-[var(--t-pos)]"
                                : "text-[var(--t-neg)]"
                          }`}
                        >
                          {r.retUsd == null
                            ? "—"
                            : `${r.retUsd >= 0 ? "+" : ""}${r.retUsd.toFixed(2)}%`}
                        </td>
                      </>
                    ) : (
                      <td
                        className={`!px-1 text-right font-semibold ${
                          r.retArs >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
                        }`}
                      >
                        {r.retArs >= 0 ? "+" : ""}
                        {r.retArs.toFixed(2)}%
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
