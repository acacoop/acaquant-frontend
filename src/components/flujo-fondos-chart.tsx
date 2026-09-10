"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Bar,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtFechaCorta } from "@/lib/fmt";

/**
 * FLUJO DE FONDOS — el gráfico de la FICHA DEL BONO y del SIMULAR INVERSIÓN.
 *
 * UN gráfico, UNA escala y DOS formas. El capital son barras; los cupones,
 * una línea de puntos con el número escrito encima. Las dos series contra el
 * MISMO eje.
 *
 * Por qué una sola escala (paso 27 de RENTA_FIJA.md, feedback de la mesa). El
 * paso 26 había puesto la renta en un eje derecho propio para que no quedara
 * pegada al cero; el resultado era una línea cuya ALTURA no significaba nada
 * (a 1/3 del alto o a 3/4, según el techo elegido, el cupón "parecía" casi
 * tan grande como la amortización). Con una sola escala la altura vuelve a
 * ser el dato: en un bullet el cupón queda bajo porque ES chico frente al
 * capital, y el monto se lee en el número sobre cada punto, no midiendo la
 * línea. Las dos formas distintas (barra / punto) siguen: es lo que deja ver
 * un cupón de 0,5 al pie de una barra de 100.
 *
 * Vive en un archivo propio desde el 2026-09-10 porque el simulador dibujaba
 * el mismo flujo con dos gráficos de barras apilados y la mesa pidió que se
 * viera igual que la ficha. Un solo componente = no vuelven a separarse.
 */

export interface PuntoFlujo {
  fecha: string;          // YYYY-MM-DD
  amortizacion: number;
  interes: number;
  futuro?: boolean;       // false = ya cobrado → gris. Sin el campo, todo futuro.
}

// El verde de la RENTA: la serie, sus puntos y sus números.
const VERDE_RENTA = "#33ccaa";
const APAGADO = "#8a94a0";   // lo ya cobrado: gris, no verde ni azul

const fmtN = (v: number, d: number) =>
  v.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Referencia de una serie: la marca (barra o punto), qué es y con qué eje se lee. */
function SerieFlujo({ color, forma, texto }: {
  color: string; forma: "barra" | "punto"; texto: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 shrink-0">
      <span
        className={forma === "barra" ? "w-2 h-2.5 shrink-0" : "w-2 h-2 shrink-0 rounded-full"}
        style={{ background: color }}
      />
      <span className="text-[9px] tracking-wide" style={{ color }}>{texto}</span>
    </div>
  );
}

/** Dato del pie del flujo: rótulo y valor en la MISMA línea. */
export function DatoFlujo({ label, valor, tip }: { label: string; valor: React.ReactNode; tip?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0" title={tip}>
      <span className="text-[9px] tracking-wide text-[var(--t-text-muted)] uppercase shrink-0">{label}</span>
      <span className="text-xs text-[var(--t-text-dim)] truncate">{valor}</span>
    </span>
  );
}

export function FlujoFondosChart({
  puntos,
  decimales = 3,
  ejeCompacto = false,
  minAlto = 220,
}: {
  puntos: PuntoFlujo[];
  // Decimales de los números del cupón y del tooltip: 3 por 100 VN (ficha),
  // 0 en montos (simulador).
  decimales?: number;
  // Eje del capital en notación compacta (1,2 M / 900 k): para montos grandes.
  ejeCompacto?: boolean;
  minAlto?: number;
}) {
  // Ancho REAL de la caja del gráfico. Los números sobre cada cupón entran o no
  // según cuántos píxeles hay por pago, no según cuántos pagos hay: los mismos 8
  // pagos entran holgados en el modal ancho y se pisan en un teléfono.
  const [anchoGrafico, setAnchoGrafico] = useState(0);
  const medirGrafico = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const ro = new ResizeObserver(() => setAnchoGrafico(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Píxeles que pide el número más largo ("1,890" o "5.522" en 9 px
  // monoespaciada, ~7 px por carácter) más su aire. Mínimo 46.
  const pxPorNumero = useMemo(() => {
    const largo = Math.max(0, ...puntos.map((p) => fmtN(p.interes, decimales).length));
    return Math.max(46, largo * 7 + 14);
  }, [puntos, decimales]);
  const numerosDelCupon =
    anchoGrafico > 0 && anchoGrafico / Math.max(1, puntos.length) >= pxPorNumero;

  const fmtEje = (v: number) =>
    ejeCompacto ? v.toLocaleString("es-AR", { notation: "compact" }) : fmtN(v, 0);

  const tooltip = {
    contentStyle: {
      background: "var(--t-surface)",
      border: "1px solid var(--t-border-2)",
      fontSize: 11,
      fontFamily: "JetBrains Mono, monospace",
    },
    labelStyle: { color: "var(--t-text-dim)" },
    labelFormatter: (v: unknown) => fmtFechaCorta(String(v)),
    formatter: (v: unknown, name: unknown) => [fmtN(Number(v), decimales), String(name)] as [string, string],
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-baseline gap-4 flex-wrap px-1 pb-1 shrink-0">
        <SerieFlujo color="var(--t-accent)" forma="barra" texto="CAPITAL — amortización" />
        <SerieFlujo color={VERDE_RENTA} forma="punto" texto="RENTA — interés" />
        <span className="text-[9px] text-[var(--t-text-muted)]">misma escala</span>
      </div>
      <div ref={medirGrafico} className="flex-1" style={{ minHeight: minAlto }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={puntos} margin={{ top: 14, right: 4, bottom: 24, left: 4 }}>
            <XAxis
              dataKey="fecha"
              tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
              axisLine={{ stroke: "var(--t-border-2)" }}
              tickLine={false}
              angle={-35}
              textAnchor="end"
              height={40}
              tickFormatter={fmtFechaCorta}
              interval={Math.max(0, Math.floor(puntos.length / 10))}
            />
            {/* UN solo eje para las dos series: la altura es el monto. */}
            <YAxis
              tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
              axisLine={{ stroke: "var(--t-border-2)" }}
              tickLine={false}
              width={ejeCompacto ? 60 : 52}
              tickFormatter={fmtEje}
            />
            <Tooltip {...tooltip} />
            {/* Barras FINAS y translúcidas. Anchas y macizas (el default: cada
                barra ocupa toda su categoría) el gráfico es un paredón, y encima
                de ese paredón no se lee ni la línea de cupones ni sus números. */}
            <Bar
              dataKey="amortizacion"
              name="Amortización"
              isAnimationActive={false}
              maxBarSize={26}
              fillOpacity={0.5}
            >
              {puntos.map((c, i) => (
                <Cell key={i} fill={c.futuro === false ? APAGADO : "var(--t-accent)"} />
              ))}
            </Bar>
            <Line
              type="linear"
              dataKey="interes"
              name="Interés"
              stroke={VERDE_RENTA}
              strokeWidth={1.5}
              isAnimationActive={false}
              dot={(d: { cx?: number; cy?: number; index?: number; payload?: { futuro?: boolean } }) => (
                <circle
                  key={d.index}
                  cx={d.cx}
                  cy={d.cy}
                  r={3}
                  stroke="var(--t-panel)"
                  strokeWidth={1.5}
                  fill={d.payload?.futuro === false ? APAGADO : VERDE_RENTA}
                />
              )}
            >
              {/* El cupón se LEE, no se mide: cuando hay lugar va el número sobre
                  cada punto (en un bullet la línea va pegada al piso y el número
                  es lo único que lo hace legible). Cuando no entra, manda el
                  tooltip. */}
              {numerosDelCupon && (
                <LabelList
                  dataKey="interes"
                  position="top"
                  offset={7}
                  fontSize={9}
                  fill={VERDE_RENTA}
                  stroke="var(--t-panel)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  formatter={(v: unknown) => fmtN(Number(v), decimales)}
                />
              )}
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
