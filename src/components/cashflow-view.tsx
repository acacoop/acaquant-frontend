"use client";

import { useEffect, useMemo, useState } from "react";
import { DatePickerCompact } from "./date-picker";
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

// Fila del resumen agregado que arma el backend: una por (día, cuenta, unidad),
// con entradas (Σ ≥0) y salidas (Σ <0) separadas. Reemplaza a bajar 2 años de
// movimientos crudos.
interface ResumenRow {
  dia: string;
  cuenta: string;
  unidad: string;
  entradas: number;
  salidas: number;
  n: number;
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
const COLOR_USD = "var(--t-pos)";
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
  const [filas, setFilas] = useState<ResumenRow[]>([]);
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
        setFilas(Array.isArray(json.filas) ? json.filas : []);
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
    if (filas.length === 0) return { minDate: "", maxDate: "" };
    let mn = filas[0].dia;
    let mx = filas[0].dia;
    for (const r of filas) {
      if (r.dia < mn) mn = r.dia;
      if (r.dia > mx) mx = r.dia;
    }
    return { minDate: mn, maxDate: mx };
  }, [filas]);

  const [desdeSel, setDesdeSel] = useState<string | null>(null);
  const [hastaSel, setHastaSel] = useState<string | null>(null);
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

  // Rango de fechas (YYYY-MM-DD). Default = todo el rango de datos disponible.
  // El usuario lo cambia con calendario; clamp para mantener desde ≤ hasta.
  const minDay = minDate.slice(0, 10);
  const maxDay = maxDate.slice(0, 10);
  const desde = desdeSel ?? minDay;
  const hasta = hastaSel ?? maxDay;
  const setDesde = (s: string) => {
    setDesdeSel(s);
    if (s > hasta) setHastaSel(s);
  };
  const setHasta = (s: string) => {
    setHastaSel(s);
    if (s < desde) setDesdeSel(s);
  };


  const monedasSel = useMemo(
    () => [...(showArs ? ["ARS"] : []), ...(showUsd ? ["USD"] : [])],
    [showArs, showUsd]
  );

  const { opciones, label } = useMemo(() => {
    const todasCuentas = Array.from(
      new Set(filas.map((r) => r.cuenta).filter(Boolean))
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
  }, [filas, filtroAcc, accMap]);

  const filtered = useMemo(() => {
    return filas.filter((r) => {
      if (r.dia < desde || r.dia > hasta) return false;
      if (!monedasSel.includes(r.unidad)) return false;
      const cuenta = r.cuenta || "";
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
  }, [filas, desde, hasta, monedasSel, filtroAcc, seleccion, accMap]);

  const chartData = useMemo(() => {
    const byKey: Record<
      string,
      { key: string; label: string; ARS: number; USD: number }
    > = {};
    for (const r of filtered) {
      const key = granularity === "Mensual" ? r.dia.slice(0, 7) : r.dia;
      if (!byKey[key]) {
        byKey[key] = {
          key,
          label: granularity === "Mensual" ? fmtMesAnio(key) : fmtDia(key),
          ARS: 0,
          USD: 0,
        };
      }
      const neto = r.entradas + r.salidas;
      if (r.unidad === "ARS") byKey[key].ARS += neto;
      else if (r.unidad === "USD") byKey[key].USD += neto;
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
    for (const r of filtered) {
      if (!out[r.unidad]) continue;
      out[r.unidad].entradas += r.entradas;
      out[r.unidad].salidas += r.salidas;
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
      <div className="h-full flex items-center justify-center text-[var(--t-neg)] text-sm">
        Error: {error}
      </div>
    );
  }
  if (filas.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">
        Sin datos.
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
      <div className="border border-[var(--t-border)] bg-[var(--t-panel)] p-3 shrink-0">
        <div className="flex flex-wrap items-end gap-3">
          <LabeledInput label="Desde" className="shrink-0">
            <DatePickerCompact value={desde} onChange={setDesde} min={minDay} max={maxDay} />
          </LabeledInput>
          <LabeledInput label="Hasta" className="shrink-0">
            <DatePickerCompact value={hasta} onChange={setHasta} min={minDay} max={maxDay} />
          </LabeledInput>
          <LabeledInput label="Monedas" className="shrink-0">
            <div className="flex items-center gap-1 h-[26px]">
              <Toggle active={showArs} onClick={() => setShowArs(!showArs)}>
                ARS
              </Toggle>
              <Toggle active={showUsd} onClick={() => setShowUsd(!showUsd)}>
                USD
              </Toggle>
            </div>
          </LabeledInput>
          <LabeledInput label="Granularidad" className="shrink-0">
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
          <LabeledInput label="Cuentas" className="w-[150px]">
            <select
              value={filtroAcc}
              onChange={(e) => setFiltroAcc(e.target.value as FiltroAcc)}
              className="w-full bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 h-[26px] font-mono focus:border-[var(--t-accent)] outline-none"
            >
              <option>Todas</option>
              <option>Sin accionistas</option>
              <option>Solo accionistas</option>
              <option>Solo cooperativas</option>
            </select>
          </LabeledInput>
          <LabeledInput label={label} className="w-[170px]">
            <select
              value={seleccion}
              onChange={(e) => setSeleccion(e.target.value)}
              className="w-full bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] text-[11px] px-2 h-[26px] font-mono focus:border-[var(--t-accent)] outline-none"
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
  const netoColor = neto >= 0 ? "var(--t-pos)" : "#ff4444";

  // Escala Y con ticks redondos
  const yScale = hasData
    ? niceScale(Math.min(0, ...vals), Math.max(0, ...vals), 5)
    : { min: 0, max: 1, ticks: [0, 1] };

  // Paso de etiquetas X: mensual = todos; diario = aprox cada 15 data points
  const xInterval =
    granularity === "Mensual" ? 0 : Math.max(0, Math.floor(data.length / 10));

  return (
    <div className="border border-[var(--t-border)] bg-[var(--t-panel)]">
      <div className="flex items-center px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10">
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
            color="var(--t-pos)"
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
                  tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                  axisLine={{ stroke: "var(--t-border-2)" }}
                  tickLine={false}
                  interval={xInterval}
                  angle={-45}
                  textAnchor="end"
                  height={32}
                />
                <YAxis
                  domain={[yScale.min, yScale.max]}
                  ticks={yScale.ticks}
                  tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                  axisLine={{ stroke: "var(--t-border-2)" }}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtCompact(v)}
                  width={60}
                />
                <ReferenceLine y={0} stroke="var(--t-border-2)" />
                <Tooltip
                  contentStyle={{
                    background: "var(--t-surface)",
                    border: "1px solid var(--t-border-2)",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  labelStyle={{ color: "var(--t-text-dim)" }}
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
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className}`}>
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
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
