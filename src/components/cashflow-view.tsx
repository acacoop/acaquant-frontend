"use client";

import { useEffect, useMemo, useState } from "react";
import { DualRange } from "./dual-range";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface Flujo {
  boleto?: string;
  cuenta?: string;
  concertacion: string;
  informacion?: string;
  bruto: number;
  unidad: string;
}

interface Accionista {
  cuenta: string;
  nombre: string;
  grupo: string;
}

type FiltroAcc =
  | "Todas"
  | "Sin accionistas"
  | "Solo accionistas"
  | "Solo cooperativas";

type Granularity = "Diario" | "Mensual";

const COLOR_ARS = "#094293";
const COLOR_ARS_NEG = "#3a6db5";
const COLOR_USD = "#00cc66";
const COLOR_USD_NEG = "#5aa87f";
const COOP_RE = /\bcoop/i;

function esCooperativa(cuenta?: string | null): boolean {
  return !!cuenta && COOP_RE.test(String(cuenta));
}

function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmtSigned(n: number): string {
  const sign = n < 0 ? "-" : "+";
  return sign + fmtCompact(Math.abs(n));
}

function niceScale(
  min: number,
  max: number,
  maxTicks = 6
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

const MESES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function fmtMesAnio(key: string): string {
  const [y, m] = key.split("-");
  return `${MESES[parseInt(m) - 1]} ${y.slice(-2)}`;
}

function fmtDia(key: string): string {
  const [, m, d] = key.split("-");
  return `${d}/${m}`;
}

export function CashFlowView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flujos, setFlujos] = useState<Flujo[]>([]);
  const [accionistas, setAccionistas] = useState<Accionista[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/cashflow", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setFlujos(Array.isArray(json.flujos) ? json.flujos : []);
        setAccionistas(Array.isArray(json.accionistas) ? json.accionistas : []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const accMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accionistas) m.set(a.cuenta, a.grupo);
    return m;
  }, [accionistas]);

  const { minDate, maxDate } = useMemo(() => {
    if (flujos.length === 0) return { minDate: "", maxDate: "" };
    let mn = flujos[0].concertacion;
    let mx = flujos[0].concertacion;
    for (const f of flujos) {
      if (f.concertacion < mn) mn = f.concertacion;
      if (f.concertacion > mx) mx = f.concertacion;
    }
    return { minDate: mn, maxDate: mx };
  }, [flujos]);

  const [rangoIdx, setRangoIdx] = useState<[number, number] | null>(null);
  const [showArs, setShowArs] = useState(true);
  const [showUsd, setShowUsd] = useState(true);
  const [granularity, setGranularity] = useState<Granularity>("Diario");
  const [filtroAcc, setFiltroAcc] = useState<FiltroAcc>("Todas");
  const [selState, setSelState] = useState<{ filtro: FiltroAcc; val: string }>({
    filtro: "Todas",
    val: "__TODAS__",
  });
  const seleccion = selState.filtro === filtroAcc ? selState.val : "__TODAS__";
  const setSeleccion = (v: string) => setSelState({ filtro: filtroAcc, val: v });

  const fechasUnicas = useMemo(
    () => Array.from(new Set(flujos.map((f) => f.concertacion.slice(0, 10)))).sort(),
    [flujos]
  );

  const efectivoRango: [number, number] =
    fechasUnicas.length > 0
      ? rangoIdx == null
        ? [0, fechasUnicas.length - 1]
        : [
            Math.min(Math.max(0, rangoIdx[0]), fechasUnicas.length - 1),
            Math.min(Math.max(rangoIdx[0], rangoIdx[1]), fechasUnicas.length - 1),
          ]
      : [0, 0];

  const desde = fechasUnicas[efectivoRango[0]] ?? minDate;
  const hasta = fechasUnicas[efectivoRango[1]] ?? maxDate;


  const monedasSel = useMemo(
    () => [...(showArs ? ["ARS"] : []), ...(showUsd ? ["USD"] : [])],
    [showArs, showUsd]
  );

  const { opciones, label } = useMemo(() => {
    const todasCuentas = Array.from(
      new Set(flujos.map((f) => f.cuenta).filter(Boolean) as string[])
    );
    if (filtroAcc === "Solo accionistas") {
      const grupos = Array.from(
        new Set(
          todasCuentas.filter((c) => accMap.has(c)).map((c) => accMap.get(c)!)
        )
      ).sort();
      return { opciones: grupos, label: "Accionista" };
    }
    if (filtroAcc === "Sin accionistas") {
      return {
        opciones: todasCuentas.filter((c) => !accMap.has(c)).sort(),
        label: "Cuenta",
      };
    }
    if (filtroAcc === "Solo cooperativas") {
      return {
        opciones: todasCuentas
          .filter((c) => !accMap.has(c) && esCooperativa(c))
          .sort(),
        label: "Cooperativa",
      };
    }
    return { opciones: todasCuentas.sort(), label: "Cuenta" };
  }, [flujos, filtroAcc, accMap]);

  const filtered = useMemo(() => {
    return flujos.filter((f) => {
      if (f.concertacion < desde || f.concertacion > hasta) return false;
      if (!monedasSel.includes(f.unidad)) return false;
      const cuenta = f.cuenta || "";
      const grupo = accMap.get(cuenta);
      if (filtroAcc === "Sin accionistas") {
        if (grupo) return false;
        if (seleccion !== "__TODAS__" && cuenta !== seleccion) return false;
      } else if (filtroAcc === "Solo accionistas") {
        if (!grupo) return false;
        if (seleccion !== "__TODAS__" && grupo !== seleccion) return false;
      } else if (filtroAcc === "Solo cooperativas") {
        if (grupo) return false;
        if (!esCooperativa(cuenta)) return false;
        if (seleccion !== "__TODAS__" && cuenta !== seleccion) return false;
      } else if (seleccion !== "__TODAS__") {
        if (cuenta !== seleccion) return false;
      }
      return true;
    });
  }, [flujos, desde, hasta, monedasSel, filtroAcc, seleccion, accMap]);

  const chartData = useMemo(() => {
    const byKey: Record<
      string,
      { key: string; label: string; ARS: number; USD: number }
    > = {};
    for (const f of filtered) {
      const key =
        granularity === "Mensual"
          ? f.concertacion.slice(0, 7)
          : f.concertacion.slice(0, 10);
      if (!byKey[key]) {
        byKey[key] = {
          key,
          label: granularity === "Mensual" ? fmtMesAnio(key) : fmtDia(key),
          ARS: 0,
          USD: 0,
        };
      }
      if (f.unidad === "ARS") byKey[key].ARS += f.bruto;
      else if (f.unidad === "USD") byKey[key].USD += f.bruto;
    }
    return Object.entries(byKey)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([, v]) => v);
  }, [filtered, granularity]);

  const totals = useMemo(() => {
    const out: Record<string, { entradas: number; salidas: number }> = {
      ARS: { entradas: 0, salidas: 0 },
      USD: { entradas: 0, salidas: 0 },
    };
    for (const f of filtered) {
      if (!out[f.unidad]) continue;
      if (f.bruto >= 0) out[f.unidad].entradas += f.bruto;
      else out[f.unidad].salidas += f.bruto;
    }
    return out;
  }, [filtered]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">
        Cargando…
      </div>
    );
  }
  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-[#ff3333] text-sm">
        Error: {error}
      </div>
    );
  }
  if (flujos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">
        Sin datos.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 space-y-2 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] text-[#ff9900] font-mono min-w-[54px]">{desde}</span>
          <DualRange
            min={0}
            max={Math.max(0, fechasUnicas.length - 1)}
            lo={efectivoRango[0]}
            hi={efectivoRango[1]}
            setLo={(v) => setRangoIdx([v, Math.max(v, efectivoRango[1])])}
            setHi={(v) => setRangoIdx([Math.min(v, efectivoRango[0]), v])}
          />
          <span className="text-[10px] text-[#ff9900] font-mono min-w-[54px] text-right">{hasta}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <LabeledInput label="Monedas">
            <div className="flex items-center gap-1 h-[26px]">
              <Toggle active={showArs} onClick={() => setShowArs(!showArs)}>
                ARS
              </Toggle>
              <Toggle active={showUsd} onClick={() => setShowUsd(!showUsd)}>
                USD
              </Toggle>
            </div>
          </LabeledInput>
          <LabeledInput label="Granularidad">
            <div className="flex items-center gap-1 h-[26px]">
              <Toggle
                active={granularity === "Diario"}
                onClick={() => setGranularity("Diario")}
              >
                Diario
              </Toggle>
              <Toggle
                active={granularity === "Mensual"}
                onClick={() => setGranularity("Mensual")}
              >
                Mensual
              </Toggle>
            </div>
          </LabeledInput>
          <LabeledInput label="Cuentas">
            <select
              value={filtroAcc}
              onChange={(e) => setFiltroAcc(e.target.value as FiltroAcc)}
              className="w-full bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
            >
              <option>Todas</option>
              <option>Sin accionistas</option>
              <option>Solo accionistas</option>
              <option>Solo cooperativas</option>
            </select>
          </LabeledInput>
          <LabeledInput label={label}>
            <select
              value={seleccion}
              onChange={(e) => setSeleccion(e.target.value)}
              className="w-full bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
            >
              <option value="__TODAS__">Todas</option>
              {opciones.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </LabeledInput>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden grid grid-cols-1 gap-3 auto-rows-min">
        {monedasSel.length === 0 && (
          <div className="text-center text-[var(--t-text-muted)] text-xs py-8">
            Seleccioná al menos una moneda.
          </div>
        )}
        {showArs && (
          <MonedaChart
            moneda="ARS"
            color={COLOR_ARS}
            negColor={COLOR_ARS_NEG}
            data={chartData}
            total={totals.ARS}
            granularity={granularity}
          />
        )}
        {showUsd && (
          <MonedaChart
            moneda="USD"
            color={COLOR_USD}
            negColor={COLOR_USD_NEG}
            data={chartData}
            total={totals.USD}
            granularity={granularity}
          />
        )}
      </div>
    </div>
  );
}

function MonedaChart({
  moneda,
  color,
  negColor,
  data,
  total,
  granularity,
}: {
  moneda: "ARS" | "USD";
  color: string;
  negColor: string;
  data: { key: string; label: string; ARS: number; USD: number }[];
  total: { entradas: number; salidas: number };
  granularity: Granularity;
}) {
  const vals = data.map((d) => (moneda === "ARS" ? d.ARS : d.USD));
  const hasData = vals.some((v) => v !== 0);
  const neto = total.entradas + total.salidas;
  const netoColor = neto >= 0 ? "#00cc66" : "#ff4444";

  // Escala Y con ticks redondos
  const yScale = hasData
    ? niceScale(Math.min(0, ...vals), Math.max(0, ...vals), 5)
    : { min: 0, max: 1, ticks: [0, 1] };

  // Paso de etiquetas X: mensual = todos; diario = aprox cada 15 data points
  const xInterval =
    granularity === "Mensual" ? 0 : Math.max(0, Math.floor(data.length / 10));

  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
      <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[#ff9900]/10">
        <span
          className="text-[11px] font-semibold tracking-wide uppercase"
          style={{ color }}
        >
          {moneda}
        </span>
        <div className="ml-auto flex items-center gap-4 text-[10px]">
          <LegendStat
            label="Entradas"
            value={fmtCompact(total.entradas)}
            color="#00cc66"
          />
          <LegendStat
            label="Salidas"
            value={fmtCompact(Math.abs(total.salidas))}
            color="#ff4444"
          />
          <LegendStat label="Neto" value={fmtSigned(neto)} color={netoColor} />
        </div>
      </div>

      <div className="p-2">
        {hasData ? (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 12, bottom: 24, left: 8 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  interval={xInterval}
                  angle={-45}
                  textAnchor="end"
                  height={32}
                />
                <YAxis
                  domain={[yScale.min, yScale.max]}
                  ticks={yScale.ticks}
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtCompact(v)}
                  width={60}
                />
                <ReferenceLine y={0} stroke="#2a2a2a" />
                <Tooltip
                  contentStyle={{
                    background: "#0e0e0e",
                    border: "1px solid #2a2a2a",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  labelStyle={{ color: "#808080" }}
                  formatter={(value) => [fmtSigned(Number(value)), moneda]}
                />
                <Bar dataKey={moneda} fill={color} isAnimationActive={false}>
                  {data.map((d, i) => {
                    const v = moneda === "ARS" ? d.ARS : d.USD;
                    return (
                      <Cell key={i} fill={v < 0 ? negColor : color} />
                    );
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-8 text-center text-[var(--t-text-muted)] text-xs">
            Sin datos para {moneda}.
          </div>
        )}
      </div>
    </div>
  );
}

function LegendStat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <span>
      <span className="text-[var(--t-text-dim)]">{label}: </span>
      <span style={{ color }} className="font-semibold">
        {value}
      </span>
    </span>
  );
}

function LabeledInput({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[10px] tracking-wide text-[var(--t-text-muted)] uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function Toggle({
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
      className={`px-2 h-[26px] text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
