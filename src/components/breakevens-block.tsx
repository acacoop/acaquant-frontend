"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { shortTicker } from "./ui";
import { useViewportKey } from "@/lib/use-viewport-key";

interface BreakevenPar {
  n: number;
  lecap: string;
  cer: string;
  fecha_vencimiento: string;
  fecha_cer_liq?: string;  // CER settlement = vto − 10 hábiles; cuando se fija el flujo
  mes_inflacion?: string;  // 'YYYY-MM' — IPC que pricea este BE (vto − 2m)
  dias: number;            // días calendario hasta vto
  dias_cer?: number;       // días calendario hasta la liquidación del CER
  tem_lecap: number;
  paridad_cer: number;
  breakeven_mensual: number;
}

interface BreakevenHistDoc {
  fecha: string;
  pares: BreakevenPar[];
}

interface RemAcumItem {
  periodo: string;
  fin_mes: string | null;
  ipc_mensual_rem: number;
  promedio_mensual_acum: number;
  meses_acumulados: number;
}

interface RemAcumResp {
  informe: string | null;
  indicador: string | null;
  serie: RemAcumItem[];
}

type Modo = "live" | "hist";

const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtMesAnio(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${MESES_CORTOS[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

function fmtSoloMes(ts: number): string {
  // Formato 'Abr' / 'May' / 'Jun' — sin año. Usa UTC para evitar que una
  // fecha construida con Date.UTC(y, m, 15) caiga en el mes anterior en
  // timezone Argentina.
  const d = new Date(ts);
  return MESES_CORTOS[d.getUTCMonth()];
}

function fmtPeriodoMensual(yyyy_mm: string): string {
  // Parseo manual para evitar el bug UTC→Local del constructor Date("2026-03-01"),
  // que en timezone Argentina (UTC-3) devuelve el día 28-29 del mes anterior.
  const [yStr, mStr] = yyyy_mm.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) return yyyy_mm;
  return `${MESES_CORTOS[m - 1]} ${String(y).slice(-2)}`;
}

function fmtFechaCorta(s: string): string {
  const iso = s.length >= 10 ? s.slice(0, 10) : s;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
}

function niceScale(min: number, max: number, maxTicks = 6): { min: number; max: number; ticks: number[] } {
  if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (min === max) return { min: min - 1, max: max + 1, ticks: [min - 1, min, min + 1] };
  const range = max - min;
  const roughStep = range / Math.max(1, maxTicks - 1);
  const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / pow10;
  const niceStep = normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10;
  const step = niceStep * pow10;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let t = niceMin; t <= niceMax + step / 2; t += step) ticks.push(+t.toFixed(10));
  return { min: niceMin, max: niceMax, ticks };
}

export function BreakevensBlock({
  pares,
  historico,
}: {
  pares: BreakevenPar[];
  historico?: BreakevenHistDoc[];
}) {
  const [modo, setModo] = useState<Modo>("live");
  const [remOn, setRemOn] = useState(true);
  const [remSerie, setRemSerie] = useState<RemAcumItem[]>([]);

  const fechasOrdenadas = useMemo(
    () =>
      (historico ?? [])
        .map((d) => d.fecha)
        .filter(Boolean)
        .sort(),
    [historico]
  );

  const [fechaIdx, setFechaIdx] = useState<number | null>(null);

  const effectiveIdx =
    fechasOrdenadas.length > 0
      ? fechaIdx == null
        ? fechasOrdenadas.length - 1
        : Math.min(Math.max(0, fechaIdx), fechasOrdenadas.length - 1)
      : 0;
  const fechaSel = fechasOrdenadas[effectiveIdx];
  const paresBase =
    modo === "live"
      ? pares
      : (historico ?? []).find((d) => d.fecha === fechaSel)?.pares ?? [];

  // Por pedido de la mesa: mostrar solo bonos que vencen en 2026. Filtra
  // tanto la tabla como el chart.
  const paresMostrar = useMemo(
    () =>
      paresBase.filter((p) => {
        const anio = parseInt((p.fecha_vencimiento || "").slice(0, 4), 10);
        return anio === 2026;
      }),
    [paresBase],
  );

  const hayHistorico = fechasOrdenadas.length > 0;

  // Serie REM acumulada, siempre del último informe disponible.
  useEffect(() => {
    if (!remOn) return;
    let cancelled = false;
    fetch("/api/cotizaciones/rem/breakeven-acumulado", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: RemAcumResp | null) => {
        if (!cancelled && j && Array.isArray(j.serie)) setRemSerie(j.serie);
      })
      .catch(() => {
        /* REM best-effort: si falla el chart sigue funcionando */
        if (!cancelled) setRemSerie([]);
      });
    return () => {
      cancelled = true;
    };
  }, [remOn]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2 shrink-0 flex-wrap">
        <FilterBtn active={modo === "live"} onClick={() => setModo("live")}>
          LIVE
        </FilterBtn>
        <FilterBtn
          active={modo === "hist"}
          onClick={() => hayHistorico && setModo("hist")}
          disabled={!hayHistorico}
        >
          HISTÓRICO
        </FilterBtn>

        <div className="ml-2 h-4 w-px bg-[#222]" />

        <FilterBtn active={remOn} onClick={() => setRemOn((v) => !v)}>
          REM
        </FilterBtn>
      </div>

      {modo === "hist" && hayHistorico && (
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <span className="text-[10px] text-[#555555] tracking-wide">FECHA</span>
          <input
            type="range"
            min={0}
            max={fechasOrdenadas.length - 1}
            value={effectiveIdx}
            onChange={(e) => setFechaIdx(Number(e.target.value))}
            className="flex-1 range-slider"
          />
          <span className="text-[10px] text-[#ff9900] font-mono min-w-[60px] text-right">
            {fechaSel ? fmtFechaCorta(fechaSel) : "--"}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 grid grid-cols-[auto_1fr] gap-3 min-w-0">
        <BreakevensTabla pares={paresMostrar} />
        <BreakevensGrafico
          pares={paresMostrar}
          remSerie={remOn ? remSerie : []}
        />
      </div>
    </div>
  );
}

function BreakevensTabla({ pares }: { pares: BreakevenPar[] }) {
  if (pares.length === 0) return null;
  return (
    <div className="overflow-y-auto shrink-0">
      <table>
        <thead>
          <tr>
            <th>LECAP/BONCAP</th>
            <th>CER</th>
            <th className="text-right" title="IPC del mes cuya inflación pricea el BE (vto − 2 meses por rezago del CER).">
              IPC MES
            </th>
            <th className="text-right">DÍAS</th>
            <th className="text-right">BE MEN.</th>
          </tr>
        </thead>
        <tbody>
          {pares.map((p) => {
            const be = p.breakeven_mensual * 100;
            const mesLabel = p.mes_inflacion ? fmtPeriodoMensual(p.mes_inflacion) : "—";
            return (
              <tr key={p.n}>
                <td className="text-[#ff9900]">{shortTicker(p.lecap)}</td>
                <td className="text-[#808080]">{shortTicker(p.cer)}</td>
                <td className="text-right text-[#d0d0d0] font-mono">{mesLabel}</td>
                <td className="text-right text-[#808080]">{p.dias}</td>
                <td className={`text-right font-bold ${be > 3 ? "text-[#ff3333]" : "text-[#00cc66]"}`}>
                  {be.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BreakevensGrafico({
  pares,
  remSerie,
}: {
  pares: BreakevenPar[];
  remSerie: RemAcumItem[];
}) {
  const vpKey = useViewportKey();

  const data = useMemo(() => {
    // Grilla mensual desde el mes actual en adelante. Cada punto es el
    // día 15 (UTC) de un mes. Para los meses sin BE hacemos forward-fill
    // desde el último BE conocido.

    // 1. Meses disponibles: min(hoy) a max(REM ∪ BEs). Si no hay ni REM ni
    // BEs, devolvemos vacío.
    const hoy = new Date();
    const mesActualUtc = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 15);

    const remByMonth = new Map<number, { mensual: number; acum: number }>();
    remSerie.forEach((r) => {
      if (!r.periodo) return;
      const ts = Date.UTC(
        parseInt(r.periodo.slice(0, 4), 10),
        parseInt(r.periodo.slice(5, 7), 10) - 1,
        15,
      );
      if (isNaN(ts)) return;
      remByMonth.set(ts, {
        mensual: +(r.ipc_mensual_rem * 100).toFixed(2),
        acum:    +(r.promedio_mensual_acum * 100).toFixed(2),
      });
    });

    const beByMonth = new Map<number, { be: number; ticker: string }>();
    pares
      .filter((p) => p.breakeven_mensual != null)
      .forEach((p) => {
        // El BE pricea el IPC del mes (vto − 2m). El punto va EN ESE MES,
        // no en el mes del vto del bono. Fallback al vto solo si falta
        // mes_inflacion (data vieja del backend).
        let ts: number;
        if (p.mes_inflacion) {
          ts = Date.UTC(
            parseInt(p.mes_inflacion.slice(0, 4), 10),
            parseInt(p.mes_inflacion.slice(5, 7), 10) - 1,
            15,
          );
        } else {
          const vto = new Date(p.fecha_vencimiento);
          ts = Date.UTC(vto.getUTCFullYear(), vto.getUTCMonth(), 15);
        }
        if (isNaN(ts)) return;
        beByMonth.set(ts, {
          be:     +(p.breakeven_mensual * 100).toFixed(2),
          ticker: shortTicker(p.lecap),
        });
      });

    const todosTs = [...remByMonth.keys(), ...beByMonth.keys()].sort((a, b) => a - b);
    if (todosTs.length === 0) return [];
    const ultimoTs = todosTs[todosTs.length - 1];

    // Generar lista de meses consecutivos: hoy → último mes con datos.
    const meses: number[] = [];
    let cursor = mesActualUtc;
    while (cursor <= ultimoTs) {
      meses.push(cursor);
      const d = new Date(cursor);
      cursor = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 15);
    }

    // Armar los puntos. Forward-fill del BE cuando un mes no tiene dato propio.
    let ultimoBe: number | undefined;
    return meses.map((ts) => {
      const rem = remByMonth.get(ts);
      const be = beByMonth.get(ts);
      if (be) ultimoBe = be.be;
      return {
        vencTs:      ts,
        rem_mensual: rem?.mensual,
        rem_acum:    rem?.acum,
        // `be` = valor real del mes (si existe) o el forward-fill del previo.
        be:          be ? be.be : ultimoBe,
        // `beReal` identifica los puntos que SÍ tienen bono detrás; el
        // scatter y el tooltip los usan para mostrar ticker solo en ellos.
        beReal:      be ? be.be : undefined,
        ticker:      be?.ticker,
      };
    });
  }, [pares, remSerie]);

  if (data.length === 0) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        SIN DATOS — MERCADO CERRADO
      </p>
    );
  }

  // Un tick por mes. Todos los meses de la grilla (desde hoy hasta el
  // último mes con datos). Formato 'Abr' / 'May' sin año — por pedido
  // de la mesa; arranca siempre desde el mes presente.
  const xTicksShown = data.map((d) => d.vencTs);

  const allVals = data.flatMap((d) =>
    [d.be, d.rem_mensual, d.rem_acum].filter((v): v is number => v != null),
  );
  const yScale = allVals.length
    ? niceScale(Math.min(...allVals, 3), Math.max(...allVals, 3), 6)
    : { min: 0, max: 5, ticks: [0, 1, 2, 3, 4, 5] };

  return (
    <div className="h-full min-h-0 min-w-0">
      <ResponsiveContainer key={vpKey} width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 30, left: 10 }}>
          <XAxis
            dataKey="vencTs"
            type="number"
            domain={["dataMin", "dataMax"]}
            ticks={xTicksShown}
            scale="time"
            tick={{ fill: "#808080", fontSize: 10 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={false}
            angle={-45}
            textAnchor="end"
            height={40}
            interval={0}
            padding={{ left: 24, right: 24 }}
            tickFormatter={(ts: number) => fmtSoloMes(ts)}
          />
          <YAxis
            domain={[yScale.min, yScale.max]}
            ticks={yScale.ticks}
            tick={{ fill: "#808080", fontSize: 10 }}
            axisLine={{ stroke: "#2a2a2a" }}
            tickLine={false}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          />
          <ReferenceLine y={3} stroke="#ff3333" strokeDasharray="6 3" strokeOpacity={0.5} />
          <Tooltip
            contentStyle={{ background: "#0e0e0e", border: "1px solid #2a2a2a", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
            labelStyle={{ color: "#808080" }}
            formatter={(value, name) => {
              if (value == null) return ["—", String(name)];
              if (name === "be")          return [`${Number(value).toFixed(2)}%`, "BE Mercado"];
              if (name === "beReal")      return [`${Number(value).toFixed(2)}%`, "BE con bono"];
              if (name === "rem_mensual") return [`${Number(value).toFixed(2)}%`, "REM mensual"];
              if (name === "rem_acum")    return [`${Number(value).toFixed(2)}%`, "REM acumulado"];
              return [String(value), String(name)];
            }}
            labelFormatter={(ts) => fmtMesAnio(new Date(Number(ts)).toISOString())}
          />
          {/* REM mensual (línea sólida celeste, IPC mes a mes del informe) */}
          <Line
            dataKey="rem_mensual"
            type="monotone"
            stroke="#4fc3f7"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          {/* REM acumulado (línea punteada, promedio mensual geom. hasta cada mes) */}
          <Line
            dataKey="rem_acum"
            type="monotone"
            stroke="#4fc3f7"
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          {/* BE de mercado: línea fluida (suave) con forward-fill mes a
              mes. Scatter en cada mes sin labels. */}
          <Line
            dataKey="be"
            type="monotone"
            stroke="#ff9900"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Scatter dataKey="be" fill="#ff9900" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        disabled
          ? "bg-transparent text-[#333333] border-[var(--t-border)] cursor-not-allowed"
          : active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#555555] border-[var(--t-border-2)] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
