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
import { MESES_CORTOS as MESES } from "@/lib/fmt";

// Serie YA AGREGADA que arma el backend (`/api/operaciones/flujos/serie`): una
// fila por periodo con el neto de cada moneda.
//
// ANTES esta vista bajaba el GRANO (día × cuenta × unidad) de 2 años y hacía
// acá el filtrado, la agrupación y los totales: 20.559 filas y 2.512 KB en cada
// apertura (medido con scripts/diag_peso_operaciones, 2026-08-19), para dibujar
// ~500 barras. Todo ese cálculo se mudó a cashflow_sql.flujos_serie, con tests
// que fijan la semántica de los filtros — que es la parte con criterio.
interface SerieRow {
  periodo: string;
  ARS: number;
  USD: number;
}

interface Totales {
  entradas: number;
  salidas: number;
}

interface Resp {
  serie: SerieRow[];
  totales: Record<string, Totales>;
  opciones: string[];
  bounds: { min: string; max: string };
}

type FiltroAcc =
  | "Todas"
  | "Sin accionistas"
  | "Solo accionistas"
  | "Solo cooperativas";

// Etiqueta de la UI → valor que entiende el backend. El backend es la ÚNICA
// fuente de la semántica de estos filtros; acá solo se traduce el nombre.
const FILTRO_API: Record<FiltroAcc, string> = {
  "Todas": "todas",
  "Sin accionistas": "sin_accionistas",
  "Solo accionistas": "solo_accionistas",
  "Solo cooperativas": "solo_cooperativas",
};

// El segundo desplegable cambia de nombre según el primero.
const FILTRO_LABEL: Record<FiltroAcc, string> = {
  "Todas": "Cuenta",
  "Sin accionistas": "Cuenta",
  "Solo accionistas": "Accionista",
  "Solo cooperativas": "Cooperativa",
};

type Granularity = "Diario" | "Mensual";

const COLOR_ARS = "#094293";
const COLOR_ARS_NEG = "#3a6db5";
const COLOR_USD = "var(--t-pos)";
const COLOR_USD_NEG = "#5aa87f";
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
  const [data, setData] = useState<Resp | null>(null);
  // Los topes del calendario se guardan del PRIMER fetch y no se pisan: el
  // backend los devuelve sobre la ventana leída, así que son estables, pero
  // dejarlos fijos acá evita cualquier chance de que el calendario se encierre
  // en el rango que el usuario acaba de elegir.
  const [bounds, setBounds] = useState<{ min: string; max: string } | null>(null);

  // Filtros. `null` = "todavía no lo tocó" → el backend usa su default.
  const [desdeSel, setDesdeSel] = useState<string | null>(null);
  const [hastaSel, setHastaSel] = useState<string | null>(null);
  const [showArs, setShowArs] = useState(true);
  const [showUsd, setShowUsd] = useState(true);
  const [granularity, setGranularity] = useState<Granularity>("Diario");
  const [filtroAcc, setFiltroAcc] = useState<FiltroAcc>("Todas");
  // La selección se resetea sola al cambiar de filtro: un grupo de accionistas
  // no existe en la lista de cuentas sueltas.
  const [selState, setSelState] = useState<{ filtro: FiltroAcc; val: string }>({
    filtro: "Todas",
    val: "__TODAS__",
  });
  const seleccion = selState.filtro === filtroAcc ? selState.val : "__TODAS__";
  const setSeleccion = (v: string) => setSelState({ filtro: filtroAcc, val: v });

  const minDay = bounds?.min ?? "";
  const maxDay = bounds?.max ?? "";
  const desde = desdeSel ?? minDay;
  const hasta = hastaSel ?? maxDay;
  const setDesde = (s: string) => {
    setDesdeSel(s);
    if (hasta && s > hasta) setHastaSel(s);
  };
  const setHasta = (s: string) => {
    setHastaSel(s);
    if (desde && s < desde) setDesdeSel(s);
  };

  // Un fetch por combinación de filtros. Lo que vuelve ya está agregado y
  // recortado — acá no se filtra ni se suma nada (antes se hacía todo en el
  // browser sobre 20.559 filas).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const qs = new URLSearchParams({
          agg: granularity === "Mensual" ? "MENSUAL" : "DIARIO",
          filtro: FILTRO_API[filtroAcc],
        });
        if (desdeSel) qs.set("desde", desdeSel);
        if (hastaSel) qs.set("hasta", hastaSel);
        if (seleccion !== "__TODAS__") qs.set("seleccion", seleccion);
        const res = await fetch(`/api/cashflow?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: Resp = await res.json();
        if (cancelled) return;
        setData(json);
        setBounds((prev) => prev ?? json.bounds ?? null);
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
  }, [desdeSel, hastaSel, granularity, filtroAcc, seleccion]);

  const opciones = data?.opciones ?? [];
  const label = FILTRO_LABEL[filtroAcc];

  const monedasSel = useMemo(
    () => [...(showArs ? ["ARS"] : []), ...(showUsd ? ["USD"] : [])],
    [showArs, showUsd]
  );

  // Lo único que queda en el cliente: ponerle la etiqueta legible a cada barra.
  // El toggle de monedas tampoco necesita refetch — la serie trae las dos y el
  // gráfico de cada moneda lee su propia columna.
  const chartData = useMemo(
    () =>
      (data?.serie ?? []).map((r) => ({
        key: r.periodo,
        label: granularity === "Mensual" ? fmtMesAnio(r.periodo) : fmtDia(r.periodo),
        ARS: r.ARS,
        USD: r.USD,
      })),
    [data, granularity]
  );

  const totals = useMemo(
    () => ({
      ARS: data?.totales?.ARS ?? { entradas: 0, salidas: 0 },
      USD: data?.totales?.USD ?? { entradas: 0, salidas: 0 },
    }),
    [data]
  );

  // La pantalla completa de "Cargando…" es SOLO para el primer fetch. Ahora que
  // cada cambio de filtro pide de nuevo, si el guard siguiera mirando `loading`
  // desmontaría la barra en cada click: se perdería el foco del selector y la
  // vista parpadearía entera. Después de la primera carga, los datos viejos se
  // quedan en pantalla atenuados hasta que llegan los nuevos.
  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-text-muted)] text-sm">
        Cargando…
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--t-neg)] text-sm">
        Error: {error}
      </div>
    );
  }
  // "Sin datos" NO puede desmontar la barra: si un filtro deja el resultado
  // vacío, hay que poder cambiarlo. Se muestra dentro del área del gráfico.
  const vacio = !chartData.length;

  return (
    <div
      className={
        "h-full min-h-0 flex flex-col p-3 gap-3 overflow-hidden transition-opacity " +
        (loading ? "opacity-60" : "")
      }
    >
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
        {vacio && monedasSel.length > 0 && (
          <div className="text-center text-[var(--t-text-muted)] text-xs py-8">
            Sin movimientos para este filtro.
          </div>
        )}
        {showArs && !vacio && (
          <MonedaChart
            moneda="ARS"
            color={COLOR_ARS}
            negColor={COLOR_ARS_NEG}
            data={chartData}
            total={totals.ARS}
            granularity={granularity}
          />
        )}
        {showUsd && !vacio && (
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
