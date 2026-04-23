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
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { shortTicker } from "./ui";
import { useViewportKey } from "@/lib/use-viewport-key";

interface BreakevenPar {
  n: number;
  lecap: string;
  cer: string;
  fecha_vencimiento: string;
  fecha_vto_cer?: string;
  gap_cer_dias?: number;  // días entre vto Lecap y vto CER (positivo = CER posterior)
  mes_inflacion?: string; // 'YYYY-MM' — IPC del mes que pricea este BE (vto_lecap − 2m)
  dias: number;
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
  const paresMostrar =
    modo === "live"
      ? pares
      : (historico ?? []).find((d) => d.fecha === fechaSel)?.pares ?? [];

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
            <th>LECAP</th>
            <th>CER</th>
            <th className="text-right" title="Días entre vto Lecap y vto CER. Target=60d (CER 2m posterior para corregir rezago).">
              GAP
            </th>
            <th className="text-right" title="IPC del mes cuya inflación queda implicada (vto Lecap − 2 meses).">
              IPC MES
            </th>
            <th className="text-right">DÍAS</th>
            <th className="text-right">BE MEN.</th>
          </tr>
        </thead>
        <tbody>
          {pares.map((p) => {
            const be = p.breakeven_mensual * 100;
            const gap = p.gap_cer_dias;
            // Coloreo del gap: verde oscuro si está cerca del target (45-75),
            // amarillo si está en tolerancia pero lejos, gris si n/a.
            let gapColor = "#555";
            if (gap != null) {
              const distTarget = Math.abs(gap - 60);
              gapColor = distTarget <= 15 ? "#00cc66" : "#ff9900";
            }
            const mesLabel = p.mes_inflacion ? fmtMesAnio(`${p.mes_inflacion}-01`) : "—";
            return (
              <tr key={p.n}>
                <td className="text-[#ff9900]">{shortTicker(p.lecap)}</td>
                <td className="text-[#808080]">{shortTicker(p.cer)}</td>
                <td className="text-right font-mono" style={{ color: gapColor }}>
                  {gap != null ? `+${gap}d` : "—"}
                </td>
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
    // El esqueleto del eje X lo da el REM (todos los meses futuros que
    // proyecta el informe). Encima de esa grilla, pinchamos los BE del
    // mercado en la fecha EXACTA de vencimiento de cada Lecap — pueden
    // o no coincidir con fin de mes; la línea del BE los conecta con
    // connectNulls.
    const map = new Map<number, {
      vencTs: number;
      rem_mensual?: number;
      rem_acum?: number;
      be?: number;
      ticker?: string;
    }>();

    // 1. Puntos del REM (1 por mes proyectado).
    remSerie.forEach((r) => {
      if (!r.fin_mes) return;
      const ts = new Date(r.fin_mes).getTime();
      if (isNaN(ts)) return;
      map.set(ts, {
        vencTs:      ts,
        rem_mensual: +(r.ipc_mensual_rem * 100).toFixed(2),
        rem_acum:    +(r.promedio_mensual_acum * 100).toFixed(2),
      });
    });

    // 2. Puntos del breakeven de mercado (fecha exacta de vto Lecap).
    pares
      .filter((p) => p.breakeven_mensual != null)
      .forEach((p) => {
        const ts = new Date(p.fecha_vencimiento).getTime();
        if (isNaN(ts)) return;
        const entry = map.get(ts) ?? { vencTs: ts };
        entry.be = +(p.breakeven_mensual * 100).toFixed(2);
        // Label del punto = mes de inflación implicada (vto − 2m). Fallback
        // al ticker de la Lecap si el backend todavía no envía mes_inflacion.
        entry.ticker = p.mes_inflacion
          ? fmtMesAnio(`${p.mes_inflacion}-01`)
          : shortTicker(p.lecap);
        map.set(ts, entry);
      });

    return Array.from(map.values()).sort((a, b) => a.vencTs - b.vencTs);
  }, [pares, remSerie]);

  if (data.length === 0) {
    return (
      <p className="text-[#555555] text-xs py-4 text-center">
        SIN DATOS — MERCADO CERRADO
      </p>
    );
  }

  // Xticks = unión de meses del REM + vencimientos de Lecap, pero SIN
  // duplicar labels en el mismo mes: si un BE cae en el mismo mes-año que
  // un fin-de-mes del REM, priorizamos el del BE (fecha exacta del vto)
  // porque es lo que al operador le importa leer en el eje.
  const tsRem = data.filter((d) => d.rem_mensual != null).map((d) => d.vencTs);
  const tsBe  = data.filter((d) => d.be != null).map((d) => d.vencTs);
  const monthKey = (ts: number): string => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth()}`;
  };
  const mesesConBe = new Set(tsBe.map(monthKey));
  const tsRemFiltrados = tsRem.filter((ts) => !mesesConBe.has(monthKey(ts)));
  const xTicks = Array.from(new Set([...tsRemFiltrados, ...tsBe])).sort(
    (a, b) => a - b,
  );

  // Si hay muchos labels, decimamos los del REM (preservamos los BE siempre).
  const maxLabels = 14;
  const tsBeSet = new Set(tsBe);
  let xTicksShown: number[] = xTicks;
  if (xTicks.length > maxLabels) {
    const skipRem = Math.max(
      1,
      Math.ceil(tsRemFiltrados.length / Math.max(1, maxLabels - tsBe.length)),
    );
    xTicksShown = xTicks.filter((ts) => {
      if (tsBeSet.has(ts)) return true;
      const i = tsRemFiltrados.indexOf(ts);
      return i === -1 || i % skipRem === 0;
    });
  }

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
            tickFormatter={(ts: number) => fmtMesAnio(new Date(ts).toISOString())}
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
          {/* Mercado (línea naranja + scatter con tickers) */}
          <Line
            dataKey="be"
            type="monotone"
            stroke="#ff9900"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Scatter dataKey="be" fill="#ff9900" isAnimationActive={false}>
            <LabelList dataKey="ticker" position="top" fill="#aaaaaa" style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} />
          </Scatter>
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
          ? "bg-transparent text-[#333333] border-[#1a1a1a] cursor-not-allowed"
          : active
          ? "bg-[#ff9900] text-black border-[#ff9900]"
          : "bg-transparent text-[#555555] border-[#2a2a2a] hover:text-[#ff9900] hover:border-[#ff9900]"
      }`}
    >
      {children}
    </button>
  );
}
