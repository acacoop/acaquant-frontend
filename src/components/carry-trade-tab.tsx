"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useViewportKey } from "@/lib/use-viewport-key";
import { DualRange } from "./dual-range";

interface TablaRow {
  ticker: string;
  base: number;
  final: number;
  fecha_base: string;
  ret_ars: number;
  var_dolar: number;
  carry_usd: number;
}

interface CarryResp {
  curva: string;
  dolar: string;
  fecha_base: string | null;
  fecha_final: string | null;
  serie: Array<Record<string, number | string>>;
  tabla: TablaRow[];
  error?: string;
}

const PALETA = [
  "#ff9900",
  "#4a9eff",
  "#00cc66",
  "#ff3333",
  "#bb66ff",
  "#00cccc",
  "#ffee44",
  "#ff66aa",
  "#aaff00",
  "#ff6600",
];

const POLL_MS = 300_000; // 5 min

function fmtFechaCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function CarryTradeTab() {
  const [curva, setCurva] = useState<"tasa_fija" | "cer">("tasa_fija");
  const [dolar, setDolar] = useState<"mep" | "oficial">("mep");
  const [data, setData] = useState<CarryResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangoIdx, setRangoIdx] = useState<[number, number] | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string> | null>(null);
  const vpKey = useViewportKey();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/analitica/carry-trade?curva=${encodeURIComponent(curva)}&dolar=${dolar}`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: CarryResp = await res.json();
        if (cancelled) return;
        if (j.error) throw new Error(j.error);
        setData(j);
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
  }, [curva, dolar]);

  // Reset rango y selección cuando cambia curva/dolar
  useEffect(() => {
    setRangoIdx(null);
    setSeleccion(null);
  }, [curva, dolar]);

  const serieRaw = data?.serie || [];
  const tabla = data?.tabla || [];
  const tickers = useMemo(() => tabla.map((r) => r.ticker), [tabla]);
  const fechas = useMemo(
    () => serieRaw.map((r) => String(r.fecha)),
    [serieRaw],
  );

  // Inicializa selección con todos los tickers la primera vez que cargan.
  useEffect(() => {
    if (seleccion === null && tickers.length > 0) {
      setSeleccion(new Set(tickers));
    }
  }, [tickers, seleccion]);

  const effectiveRango: [number, number] =
    fechas.length > 0
      ? rangoIdx == null
        ? [0, fechas.length - 1]
        : [
            Math.min(Math.max(0, rangoIdx[0]), fechas.length - 1),
            Math.min(Math.max(rangoIdx[0], rangoIdx[1]), fechas.length - 1),
          ]
      : [0, 0];

  // Renormalizar la serie al primer día del rango. La base del backend
  // es el primer día absoluto de la respuesta; si el usuario corta el
  // rango, el carry mostrado debe ser desde el nuevo "día 0".
  // Fórmula: carry_t' = (1 + carry_t) / (1 + carry_base) − 1.
  const { serieRecortada, tablaRango } = useMemo(() => {
    if (serieRaw.length === 0) return { serieRecortada: [], tablaRango: [] as TablaRow[] };
    const [lo, hi] = effectiveRango;
    const slice = serieRaw.slice(lo, hi + 1);
    if (slice.length === 0) return { serieRecortada: [], tablaRango: [] };

    // Buscar la base por ticker dentro del slice (primer día con valor).
    const baseByTicker: Record<string, number> = {};
    for (const tk of tickers) {
      for (const row of slice) {
        const v = row[tk];
        if (typeof v === "number") {
          baseByTicker[tk] = v;
          break;
        }
      }
    }

    const serieRecortada = slice.map((row) => {
      const out: Record<string, number | string> = { fecha: row.fecha };
      if (typeof row.dolar === "number") out.dolar = row.dolar;
      for (const tk of tickers) {
        const v = row[tk];
        const base = baseByTicker[tk];
        if (typeof v === "number" && base !== undefined) {
          // v y base están en %, los pasamos a decimal para componer.
          const vD = v / 100;
          const bD = base / 100;
          const renorm = (1 + vD) / (1 + bD) - 1;
          out[tk] = +(renorm * 100).toFixed(3);
        }
      }
      return out;
    });

    // Tabla renormalizada: último valor del rango por ticker.
    const ultRow = serieRecortada[serieRecortada.length - 1];
    const tablaRango: TablaRow[] = tabla
      .map((r) => {
        const carryUsd = ultRow?.[r.ticker];
        if (typeof carryUsd !== "number") return null;
        return {
          ...r,
          carry_usd: carryUsd,
          // ret_ars y var_dolar quedan con los valores originales (se
          // refieren a desde el primer día absoluto). En la tabla esto
          // queda claro porque el carry sí se renormalizó.
        } as TablaRow;
      })
      .filter((x): x is TablaRow => x !== null)
      .sort((a, b) => b.carry_usd - a.carry_usd);

    return { serieRecortada, tablaRango };
  }, [serieRaw, effectiveRango, tickers, tabla]);

  const fechaDesde = fechas[effectiveRango[0]];
  const fechaHasta = fechas[effectiveRango[1]];

  const tickersVisibles = useMemo(
    () => tickers.filter((t) => seleccion?.has(t)),
    [tickers, seleccion],
  );

  const toggleTicker = (tk: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev || tickers);
      if (next.has(tk)) {
        if (next.size === 1) return next; // no permitimos vaciar todo
        next.delete(tk);
      } else {
        next.add(tk);
      }
      return next;
    });
  };

  const seleccionarTodos = () => setSeleccion(new Set(tickers));
  const deseleccionarTodos = () => {
    if (tickers.length > 0) setSeleccion(new Set([tickers[0]]));
  };

  return (
    <div className="h-full min-h-0 flex flex-col p-3 gap-3 overflow-hidden">
      <div className="border border-[#1a1a1a] bg-[#080808] p-3 flex items-center gap-3 shrink-0 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[#555]">Curva</span>
          <div className="flex items-center gap-1 h-[26px]">
            <FilterBtn active={curva === "tasa_fija"} onClick={() => setCurva("tasa_fija")}>
              TASA FIJA
            </FilterBtn>
            <FilterBtn active={curva === "cer"} onClick={() => setCurva("cer")}>
              CER
            </FilterBtn>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[#555]">Dólar</span>
          <div className="flex items-center gap-1 h-[26px]">
            <FilterBtn active={dolar === "mep"} onClick={() => setDolar("mep")}>
              MEP
            </FilterBtn>
            <FilterBtn active={dolar === "oficial"} onClick={() => setDolar("oficial")}>
              OFICIAL
            </FilterBtn>
          </div>
        </div>
        {fechas.length >= 2 && (
          <div className="flex items-center gap-2 flex-1 min-w-[260px]">
            <span className="text-[10px] text-[#ff9900] font-mono min-w-[36px]">
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
            <span className="text-[10px] text-[#ff9900] font-mono min-w-[36px] text-right">
              {fmtFechaCorta(fechaHasta || "")}
            </span>
          </div>
        )}
        <div className="ml-auto text-[10px] text-[#555] font-mono">
          {loading ? "actualizando…" : ""}
        </div>
      </div>

      {/* Toggles de tickers para deseleccionar líneas del chart */}
      {tickers.length > 0 && (
        <div className="border border-[#1a1a1a] bg-[#080808] px-3 py-2 shrink-0 flex items-center gap-1 flex-wrap">
          <span className="text-[9px] uppercase tracking-widest text-[#555] mr-2">
            Tickers
          </span>
          {tickers.map((tk, i) => {
            const active = seleccion?.has(tk) ?? false;
            const color = PALETA[i % PALETA.length];
            return (
              <button
                key={tk}
                onClick={() => toggleTicker(tk)}
                className={`px-2 h-[22px] text-[10px] font-mono border ${
                  active
                    ? "text-black"
                    : "text-[#555] border-[#2a2a2a] bg-transparent hover:text-[#ff9900] hover:border-[#ff9900]"
                }`}
                style={
                  active
                    ? { background: color, borderColor: color }
                    : undefined
                }
                title={
                  active && (seleccion?.size ?? 0) === 1
                    ? "Necesitás al menos 1 ticker activo"
                    : ""
                }
              >
                {tk}
              </button>
            );
          })}
          <span className="ml-auto flex gap-1">
            <button
              onClick={seleccionarTodos}
              className="px-2 h-[22px] text-[9px] uppercase tracking-wide text-[#555] border border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
            >
              Todos
            </button>
            <button
              onClick={deseleccionarTodos}
              className="px-2 h-[22px] text-[9px] uppercase tracking-wide text-[#555] border border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
            >
              Solo 1
            </button>
          </span>
        </div>
      )}

      {error && (
        <div className="px-3 py-2 text-[11px] text-[#ff3333] bg-[#ff3333]/10 border border-[#ff3333]/30 font-mono shrink-0">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3">
        <div className="border border-[#1a1a1a] bg-[#080808] p-2 min-h-0">
          {serieRecortada.length < 2 ? (
            <p className="text-[#555] text-xs py-4 text-center">
              {loading ? "Cargando…" : "Sin datos suficientes."}
            </p>
          ) : (
            <ResponsiveContainer key={vpKey} width="100%" height="100%">
              <LineChart data={serieRecortada} margin={{ top: 12, right: 20, bottom: 28, left: 4 }}>
                <CartesianGrid stroke="#1a1a1a" vertical={false} />
                <XAxis
                  dataKey="fecha"
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  angle={-35}
                  textAnchor="end"
                  height={40}
                  tickFormatter={(v) => fmtFechaCorta(String(v))}
                  interval={Math.max(0, Math.floor(serieRecortada.length / 12))}
                />
                <YAxis
                  tick={{ fill: "#808080", fontSize: 10 }}
                  axisLine={{ stroke: "#2a2a2a" }}
                  tickLine={false}
                  tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                  width={55}
                />
                <ReferenceLine y={0} stroke="#555" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{
                    background: "#0e0e0e",
                    border: "1px solid #2a2a2a",
                    fontSize: 11,
                    fontFamily: "JetBrains Mono, monospace",
                  }}
                  labelStyle={{ color: "#ff9900" }}
                  labelFormatter={(v) => fmtFechaCorta(String(v))}
                  formatter={(v, name) => {
                    if (name === "dolar") return [`${Number(v).toFixed(2)}`, dolar.toUpperCase()];
                    return [`${Number(v).toFixed(2)}%`, String(name)];
                  }}
                />
                <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 10 }} />
                {tickersVisibles.map((tk) => {
                  const i = tickers.indexOf(tk);
                  return (
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
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="border border-[#1a1a1a] bg-[#080808] p-2 overflow-y-auto min-h-0">
          <div className="text-[10px] text-[#555] tracking-wide mb-1">
            Carry vs {dolar.toUpperCase()} ·{" "}
            {fechaDesde && fechaHasta
              ? `${fmtFechaCorta(fechaDesde)} → ${fmtFechaCorta(fechaHasta)}`
              : ""}
          </div>
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 bg-[#080808] z-10">
              <tr className="text-[#707070]">
                <th className="!px-1 text-left">TICKER</th>
                <th className="!px-1 text-right">CARRY USD</th>
              </tr>
            </thead>
            <tbody>
              {tablaRango.map((r, i) => (
                <tr key={r.ticker} className={i % 2 === 0 ? "bg-[#0a0a0a]" : ""}>
                  <td className="!px-1 text-[#ff9900]">{r.ticker}</td>
                  <td
                    className={`!px-1 text-right font-semibold ${
                      r.carry_usd >= 0 ? "text-[#00cc66]" : "text-[#ff3333]"
                    }`}
                  >
                    {r.carry_usd >= 0 ? "+" : ""}
                    {r.carry_usd.toFixed(2)}%
                  </td>
                </tr>
              ))}
              {tablaRango.length === 0 && !loading && (
                <tr>
                  <td colSpan={2} className="text-center text-[#555] py-6">
                    Sin tickers con base válida.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border border-[#1a1a1a] bg-[#0a0a0a] p-3 shrink-0 text-[10px] font-mono">
        <div className="text-[9px] uppercase tracking-widest text-[#ff9900] mb-1">
          Cálculo
        </div>
        <div className="text-[#d0d0d0]">
          Carry USD = (1 + Ret<sub>ARS</sub>) / (1 + Var<sub>{dolar.toUpperCase()}</sub>) − 1
        </div>
        <div className="text-[#888] mt-1 leading-relaxed">
          Cuánto rindió el bono en pesos descontando lo que se devaluó el peso
          contra USD ({dolar.toUpperCase()}) en el mismo período. Carry positivo
          = el bono le ganó a la devaluación. Cada serie se normaliza al
          primer día del rango seleccionado, así moviendo la barra ves el
          carry desde esa fecha en adelante.
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
      className={`px-2 h-[26px] text-[10px] font-semibold tracking-wide border ${
        active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
