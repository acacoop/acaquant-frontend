"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
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
const COLOR_USD = "#00cc66";
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
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y.slice(-2)}`;
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

  // Mapa cuenta → grupo (accionista)
  const accMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accionistas) m.set(a.cuenta, a.grupo);
    return m;
  }, [accionistas]);

  // Rango de fechas total
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

  // Controles de filtros
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [showArs, setShowArs] = useState(true);
  const [showUsd, setShowUsd] = useState(true);
  const [granularity, setGranularity] = useState<Granularity>("Mensual");
  const [filtroAcc, setFiltroAcc] = useState<FiltroAcc>("Todas");
  const [seleccion, setSeleccion] = useState<string>("__TODAS__");

  useEffect(() => {
    if (minDate && !desde) setDesde(minDate);
    if (maxDate && !hasta) setHasta(maxDate);
  }, [minDate, maxDate, desde, hasta]);

  // Reset selección al cambiar el filtro de cuentas
  useEffect(() => {
    setSeleccion("__TODAS__");
  }, [filtroAcc]);

  const monedasSel: string[] = [
    ...(showArs ? ["ARS"] : []),
    ...(showUsd ? ["USD"] : []),
  ];

  // Opciones del dropdown secundario
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

  // Aplicar filtros
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

  // Agrupar por período + moneda
  const chartData = useMemo(() => {
    const byKey: Record<string, { label: string; ARS: number; USD: number }> =
      {};
    for (const f of filtered) {
      const key =
        granularity === "Mensual"
          ? f.concertacion.slice(0, 7)
          : f.concertacion.slice(0, 10);
      if (!byKey[key]) {
        byKey[key] = {
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

  // Totales por moneda
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
      <div className="h-full flex items-center justify-center text-[#555555] text-sm">
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
      <div className="h-full flex items-center justify-center text-[#555555] text-sm">
        Sin datos.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      <div className="border border-[#1a1a1a] bg-[#080808] p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <LabeledInput label="Desde">
            <input
              type="date"
              value={desde}
              min={minDate}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
            />
          </LabeledInput>
          <LabeledInput label="Hasta">
            <input
              type="date"
              value={hasta}
              min={desde}
              max={maxDate}
              onChange={(e) => setHasta(e.target.value)}
              className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
            />
          </LabeledInput>

          <LabeledInput label="Monedas">
            <div className="flex items-center gap-2 h-[26px]">
              <Toggle active={showArs} onClick={() => setShowArs(!showArs)}>
                ARS
              </Toggle>
              <Toggle active={showUsd} onClick={() => setShowUsd(!showUsd)}>
                USD
              </Toggle>
            </div>
          </LabeledInput>

          <LabeledInput label="Granularidad">
            <div className="flex items-center gap-2 h-[26px]">
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
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
          <LabeledInput label="Cuentas">
            <select
              value={filtroAcc}
              onChange={(e) => setFiltroAcc(e.target.value as FiltroAcc)}
              className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
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
              className="w-full bg-[#0e0e0e] border border-[#2a2a2a] text-[#d0d0d0] text-[11px] px-2 py-1 font-mono focus:border-[#ff9900] outline-none"
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

      {/* Gráficos por moneda */}
      {monedasSel.length === 0 && (
        <div className="text-center text-[#555555] text-xs py-8">
          Seleccioná al menos una moneda.
        </div>
      )}

      {showArs && (
        <MonedaChart
          moneda="ARS"
          color={COLOR_ARS}
          data={chartData}
          total={totals.ARS}
        />
      )}
      {showUsd && (
        <MonedaChart
          moneda="USD"
          color={COLOR_USD}
          data={chartData}
          total={totals.USD}
        />
      )}
    </div>
  );
}

function MonedaChart({
  moneda,
  color,
  data,
  total,
}: {
  moneda: "ARS" | "USD";
  color: string;
  data: { label: string; ARS: number; USD: number }[];
  total: { entradas: number; salidas: number };
}) {
  const hasData = data.some(
    (d) => (moneda === "ARS" ? d.ARS : d.USD) !== 0
  );
  const neto = total.entradas + total.salidas;
  const netoColor = neto >= 0 ? "#00cc66" : "#ff4444";

  return (
    <div className="border border-[#1a1a1a] bg-[#080808]">
      <div className="flex items-center px-3 py-1.5 border-b border-[#1a1a1a] bg-[#ff9900]/10">
        <span
          className="text-[11px] font-semibold tracking-wide uppercase"
          style={{ color }}
        >
          {moneda}
        </span>
      </div>

      <div className="p-3">
        {hasData ? (
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 12, right: 16, bottom: 28, left: 8 }}
              >
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={40}
                  interval={0}
                />
                <YAxis
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  tickFormatter={(v: number) => fmtCompact(v)}
                  width={70}
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
                <Bar
                  dataKey={moneda}
                  fill={color}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="py-8 text-center text-[#555555] text-xs">
            Sin datos para {moneda}.
          </div>
        )}

        <div className="mt-3 grid grid-cols-3 gap-3 text-[11px]">
          <Stat label="Entradas" value={fmtCompact(total.entradas)} color="#00cc66" />
          <Stat
            label="Salidas"
            value={fmtCompact(Math.abs(total.salidas))}
            color="#ff4444"
          />
          <Stat label="Flujo Neto" value={fmtSigned(neto)} color={netoColor} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="border border-[#1a1a1a] bg-[#0a0a0a] px-3 py-2">
      <div className="text-[#888888] text-[10px] tracking-wide uppercase">
        {label}
      </div>
      <div className="text-[15px] font-semibold mt-0.5" style={{ color }}>
        {value}
      </div>
    </div>
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
    <div className="flex flex-col gap-1">
      <span className="text-[10px] tracking-wide text-[#555555] uppercase">
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
          : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
