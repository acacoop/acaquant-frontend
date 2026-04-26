"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useViewportKey } from "@/lib/use-viewport-key";

// ─────────────────────────────────────────────────────────────────
// Types — espejan el shape devuelto por
// /api/analitica/descomposicion-retorno y /rolldown-esperado.
// ─────────────────────────────────────────────────────────────────

interface BonoRealizado {
  ticker: string;
  ticker_corto?: string;
  tipo?: string;
  fecha_vencimiento?: string;
  vto_dias_ini: number;
  vto_dias_fin: number;
  precio_ini: number;
  precio_fin: number;
  tem_ini: number;
  r_total: number;
  carry: number;
  rolldown: number;
  cambio_tasa: number;
  tem_curva_ini_at_dias_fin: number;
}

interface RealizadoResp {
  desde?: string;
  hasta?: string;
  dias?: number;
  metodo?: string;
  bonos?: BonoRealizado[];
  promedio_simple?: {
    r_total: number;
    carry: number;
    rolldown: number;
    cambio_tasa: number;
  } | null;
  error?: string;
}

interface BonoEsperado {
  ticker: string;
  ticker_corto?: string;
  tipo?: string;
  fecha_vencimiento?: string;
  precio: number;
  tem: number;
  vto_dias: number;
  vto_dias_horizonte: number;
  tem_curva_at_horizonte: number;
  carry_esperado: number;
  rolldown_esperado: number;
  total_esperado: number;
}

interface EsperadoResp {
  horizonte_dias?: number;
  metodo?: string;
  fecha?: string;
  bonos?: BonoEsperado[];
  error?: string;
}

type SubTab = "realizado" | "esperado";
type Metodo = "lineal" | "cuadratica";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function pct(n: number | undefined | null, decimals = 2): string {
  if (n == null || !isFinite(n)) return "--";
  return `${(n * 100).toFixed(decimals)}%`;
}

function pctSigned(n: number | undefined | null, decimals = 2): string {
  if (n == null || !isFinite(n)) return "--";
  const v = n * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(decimals)}%`;
}

function colorRet(n: number): string {
  if (n > 0) return "text-[#00cc66]";
  if (n < 0) return "text-[#ff3333]";
  return "text-[#808080]";
}

// Default: hasta = ayer (date-only en hora local); desde = 30 días antes.
// El backend valida si hubo trades; si no, devuelve error y mostramos mensaje.
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────

export function DescomposicionTab() {
  const [sub, setSub] = useState<SubTab>("realizado");
  const [metodo, setMetodo] = useState<Metodo>("lineal");

  return (
    <div className="h-full flex flex-col min-h-0 p-3 gap-3">
      <div className="border border-[#1a1a1a] bg-[#080808] p-2 shrink-0 flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 mr-3">
          <FilterBtn active={sub === "realizado"} onClick={() => setSub("realizado")}>
            REALIZADO
          </FilterBtn>
          <FilterBtn active={sub === "esperado"} onClick={() => setSub("esperado")}>
            ESPERADO
          </FilterBtn>
        </div>
        <span className="text-[10px] text-[#555] tracking-wider">MÉTODO</span>
        <div className="flex items-center gap-1">
          <FilterBtn active={metodo === "lineal"} onClick={() => setMetodo("lineal")}>
            LINEAL
          </FilterBtn>
          <FilterBtn active={metodo === "cuadratica"} onClick={() => setMetodo("cuadratica")}>
            CUADRÁTICA
          </FilterBtn>
        </div>
        <span className="text-[10px] text-[#555] ml-auto">
          Lecap / Boncap (cupón cero, pesos)
        </span>
      </div>

      <div className="flex-1 min-h-0">
        {sub === "realizado" ? (
          <RealizadoView metodo={metodo} />
        ) : (
          <EsperadoView metodo={metodo} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// REALIZADO — descomposición ex-post entre dos fechas
// ─────────────────────────────────────────────────────────────────

function RealizadoView({ metodo }: { metodo: Metodo }) {
  const [desde, setDesde] = useState(() => isoDaysAgo(30));
  const [hasta, setHasta] = useState(() => isoDaysAgo(1));
  const [data, setData] = useState<RealizadoResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vpKey = useViewportKey();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const url =
          `/api/analitica/descomposicion-retorno` +
          `?desde=${encodeURIComponent(desde)}` +
          `&hasta=${encodeURIComponent(hasta)}` +
          `&metodo=${metodo}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: RealizadoResp = await res.json();
        if (cancelled) return;
        if (j.error) {
          setError(j.error);
          setData(null);
        } else {
          setData(j);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [desde, hasta, metodo]);

  const chartData = useMemo(() => {
    if (!data?.bonos) return [];
    return data.bonos.map((b) => ({
      ticker: b.ticker_corto || b.ticker,
      carry: +(b.carry * 100).toFixed(4),
      rolldown: +(b.rolldown * 100).toFixed(4),
      cambio_tasa: +(b.cambio_tasa * 100).toFixed(4),
      r_total: +(b.r_total * 100).toFixed(4),
    }));
  }, [data]);

  return (
    <div className="h-full flex flex-col min-h-0 gap-3">
      <div className="border border-[#1a1a1a] bg-[#080808] p-2 shrink-0 flex items-center gap-3 flex-wrap">
        <DateInput label="DESDE" value={desde} onChange={setDesde} />
        <DateInput label="HASTA" value={hasta} onChange={setHasta} />
        {data?.dias != null && (
          <span className="text-[10px] text-[#808080] font-mono">
            {data.dias} días · {data.bonos?.length || 0} bonos
          </span>
        )}
        {data?.promedio_simple && (
          <span className="text-[10px] text-[#808080] font-mono ml-auto">
            promedio:{" "}
            <span className={colorRet(data.promedio_simple.r_total)}>
              {pctSigned(data.promedio_simple.r_total)}
            </span>
            {" · carry "}{pct(data.promedio_simple.carry)}
            {" · roll "}{pct(data.promedio_simple.rolldown)}
            {" · Δtasa "}{pctSigned(data.promedio_simple.cambio_tasa)}
          </span>
        )}
        {loading && <span className="text-[10px] text-[#555]">cargando…</span>}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-3">
        <div className="border border-[#1a1a1a] bg-[#080808] p-2 min-h-0">
          {error ? (
            <p className="text-[#ff3333] text-xs py-4 text-center">
              error: {error}
            </p>
          ) : !chartData.length ? (
            <p className="text-[#555] text-xs py-4 text-center">
              {loading ? "cargando…" : "sin datos en el período"}
            </p>
          ) : (
            <ResponsiveContainer key={vpKey} width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 16, bottom: 60, left: 4 }}
              >
                <CartesianGrid stroke="#1a1a1a" vertical={false} />
                <XAxis
                  dataKey="ticker"
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  angle={-50}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                  width={55}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0e0e0e",
                    border: "1px solid #2a2a2a",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  labelStyle={{ color: "#ff9900" }}
                  formatter={(v) => `${Number(v).toFixed(3)}%`}
                />
                <Legend
                  verticalAlign="top"
                  height={20}
                  wrapperStyle={{ fontSize: 10 }}
                />
                <Bar dataKey="carry" stackId="a" fill="#4a9eff" name="Carry" />
                <Bar dataKey="rolldown" stackId="a" fill="#ff9900" name="Roll-down" />
                <Bar dataKey="cambio_tasa" stackId="a" fill="#bb66ff" name="Δ Tasa" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="border border-[#1a1a1a] bg-[#080808] p-2 overflow-y-auto min-h-0">
          {!data?.bonos?.length ? (
            <p className="text-[#555] text-[10px] py-4 text-center">--</p>
          ) : (
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-[#080808] z-10">
                <tr className="text-[#707070]">
                  <th className="!px-1 text-left">TICKER</th>
                  <th className="!px-1 text-right">CARRY</th>
                  <th className="!px-1 text-right">ROLL</th>
                  <th className="!px-1 text-right">Δ TASA</th>
                  <th className="!px-1 text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {data.bonos.map((b, i) => (
                  <tr
                    key={b.ticker}
                    className={i % 2 === 0 ? "bg-[#0a0a0a]" : ""}
                  >
                    <td className="!px-1 text-[#ff9900]">
                      {b.ticker_corto || b.ticker}
                    </td>
                    <td className="!px-1 text-right text-[#4a9eff]">
                      {pct(b.carry)}
                    </td>
                    <td className="!px-1 text-right text-[#ff9900]">
                      {pct(b.rolldown)}
                    </td>
                    <td className={`!px-1 text-right ${colorRet(b.cambio_tasa)}`}>
                      {pctSigned(b.cambio_tasa)}
                    </td>
                    <td className={`!px-1 text-right font-semibold ${colorRet(b.r_total)}`}>
                      {pctSigned(b.r_total)}
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

// ─────────────────────────────────────────────────────────────────
// ESPERADO — qué Lecap rinde mejor a horizonte si la curva no se mueve
// ─────────────────────────────────────────────────────────────────

const HORIZONTES = [30, 60, 90] as const;

function EsperadoView({ metodo }: { metodo: Metodo }) {
  const [horizonte, setHorizonte] = useState<number>(30);
  const [data, setData] = useState<EsperadoResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vpKey = useViewportKey();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const url =
          `/api/analitica/rolldown-esperado` +
          `?horizonte_dias=${horizonte}` +
          `&metodo=${metodo}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: EsperadoResp = await res.json();
        if (cancelled) return;
        if (j.error) {
          setError(j.error);
          setData(null);
        } else {
          setData(j);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [horizonte, metodo]);

  const chartData = useMemo(() => {
    if (!data?.bonos) return [];
    return data.bonos.map((b) => ({
      ticker: b.ticker_corto || b.ticker,
      carry: +(b.carry_esperado * 100).toFixed(4),
      rolldown: +(b.rolldown_esperado * 100).toFixed(4),
      total: +(b.total_esperado * 100).toFixed(4),
    }));
  }, [data]);

  return (
    <div className="h-full flex flex-col min-h-0 gap-3">
      <div className="border border-[#1a1a1a] bg-[#080808] p-2 shrink-0 flex items-center gap-3 flex-wrap">
        <span className="text-[10px] text-[#555] tracking-wider">HORIZONTE</span>
        <div className="flex items-center gap-1">
          {HORIZONTES.map((h) => (
            <FilterBtn
              key={h}
              active={horizonte === h}
              onClick={() => setHorizonte(h)}
            >
              {h}D
            </FilterBtn>
          ))}
        </div>
        {data?.bonos && (
          <span className="text-[10px] text-[#808080] font-mono">
            {data.bonos.length} bonos · curva al {data.fecha}
          </span>
        )}
        {loading && <span className="text-[10px] text-[#555]">cargando…</span>}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-3">
        <div className="border border-[#1a1a1a] bg-[#080808] p-2 min-h-0">
          {error ? (
            <p className="text-[#ff3333] text-xs py-4 text-center">
              error: {error}
            </p>
          ) : !chartData.length ? (
            <p className="text-[#555] text-xs py-4 text-center">
              {loading ? "cargando…" : "sin datos"}
            </p>
          ) : (
            <ResponsiveContainer key={vpKey} width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 12, right: 16, bottom: 60, left: 4 }}
              >
                <CartesianGrid stroke="#1a1a1a" vertical={false} />
                <XAxis
                  dataKey="ticker"
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  angle={-50}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(2)}%`}
                  width={55}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0e0e0e",
                    border: "1px solid #2a2a2a",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  labelStyle={{ color: "#ff9900" }}
                  formatter={(v) => `${Number(v).toFixed(3)}%`}
                />
                <Legend
                  verticalAlign="top"
                  height={20}
                  wrapperStyle={{ fontSize: 10 }}
                />
                <Bar dataKey="carry" stackId="a" fill="#4a9eff" name="Carry" />
                <Bar dataKey="rolldown" stackId="a" fill="#ff9900" name="Roll-down" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="border border-[#1a1a1a] bg-[#080808] p-2 overflow-y-auto min-h-0">
          {!data?.bonos?.length ? (
            <p className="text-[#555] text-[10px] py-4 text-center">--</p>
          ) : (
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-[#080808] z-10">
                <tr className="text-[#707070]">
                  <th className="!px-1 text-left">TICKER</th>
                  <th className="!px-1 text-right">TEM</th>
                  <th className="!px-1 text-right">CARRY</th>
                  <th className="!px-1 text-right">ROLL</th>
                  <th className="!px-1 text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {data.bonos.map((b, i) => (
                  <tr
                    key={b.ticker}
                    className={i % 2 === 0 ? "bg-[#0a0a0a]" : ""}
                  >
                    <td className="!px-1 text-[#ff9900]">
                      {b.ticker_corto || b.ticker}
                    </td>
                    <td className="!px-1 text-right text-[#d0d0d0]">
                      {pct(b.tem)}
                    </td>
                    <td className="!px-1 text-right text-[#4a9eff]">
                      {pct(b.carry_esperado)}
                    </td>
                    <td className="!px-1 text-right text-[#ff9900]">
                      {pct(b.rolldown_esperado)}
                    </td>
                    <td className="!px-1 text-right font-semibold text-[#00cc66]">
                      {pct(b.total_esperado)}
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

// ─────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────

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
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-[#555]">
      <span className="tracking-wider">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#0a0a0a] border border-[#2a2a2a] text-[#d0d0d0] text-[10px] px-1 py-0.5 font-mono focus:outline-none focus:border-[#ff9900]"
      />
    </label>
  );
}
