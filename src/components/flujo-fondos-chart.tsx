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
 * UN gráfico, DOS ejes y DOS formas. El capital son barras contra el eje
 * IZQUIERDO; los cupones, una línea de puntos con el número escrito encima,
 * contra el eje DERECHO, con su propia escala.
 *
 * Por qué así (paso 26 de RENTA_FIJA.md). En una sola escala, en un bullet la
 * amortización (100) aplasta al cupón (1,89): la renta se dibuja pegada al cero
 * y el bono parece no pagar nada hasta el vencimiento. Dos paneles apilados
 * arreglaban eso pero partían en dos un cronograma que es uno solo. Y el doble
 * eje con las DOS series en barras es lo peor de los dos mundos: misma forma,
 * misma unidad, dos escalas — el ojo compara alturas que no son comparables.
 * La salida es que cada serie tenga su FORMA: nadie compara la altura de una
 * línea contra la de una barra, y el cupón se lee por su NÚMERO, no por su
 * altura.
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

// El verde de la RENTA: la serie, su eje, sus puntos y sus números. Con dos
// escalas en un gráfico, el color es lo único que dice qué se mide con qué eje.
const VERDE_RENTA = "#33ccaa";
const APAGADO = "#8a94a0";   // lo ya cobrado: gris, no verde ni azul

const fmtN = (v: number, d: number) =>
  v.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Referencia de una serie: la marca (barra o punto), qué es y con qué eje se lee. */
function SerieFlujo({ color, forma, texto, eje }: {
  color: string; forma: "barra" | "punto"; texto: string; eje: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 shrink-0">
      <span
        className={forma === "barra" ? "w-2 h-2.5 shrink-0" : "w-2 h-2 shrink-0 rounded-full"}
        style={{ background: color }}
      />
      <span className="text-[9px] tracking-wide" style={{ color }}>{texto}</span>
      <span className="text-[9px] text-[var(--t-text-muted)]">{eje}</span>
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

  // El TECHO del eje de la renta. Fijarlo (y no dejar que recharts lo saque del
  // máximo) deja el eje en números redondos y con aire arriba para los números
  // de cada cupón. Hasta el 2026-09-10 era `max × 2,2`: los cupones vivían en el
  // tercio de abajo y dos tercios del gráfico quedaban vacíos — la mesa lo leía
  // como "la escala no se ajusta". Ahora es `max × 1,25`: la línea usa casi
  // todo el alto y sigue habiendo lugar para el número encima del punto más alto.
  const techoRenta = useMemo(() => {
    const max = Math.max(0, ...puntos.map((c) => c.interes));
    if (max <= 0) return 1;
    const paso = max * 1.25 / 4;                    // 4 intervalos = 5 marcas
    const mag = Math.pow(10, Math.floor(Math.log10(paso)));
    const lindo = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((k) => k * mag >= paso) ?? 10;
    return lindo * mag * 4;
  }, [puntos]);

  const fmtEjeCapital = (v: number) =>
    ejeCompacto ? v.toLocaleString("es-AR", { notation: "compact" }) : fmtN(v, 0);
  const fmtEjeRenta = (v: number) =>
    ejeCompacto
      ? v.toLocaleString("es-AR", { notation: "compact" })
      : fmtN(v, v >= 10 ? 0 : 2);

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
        <SerieFlujo
          color="var(--t-accent)"
          forma="barra"
          texto="CAPITAL — amortización"
          eje="eje izq."
        />
        <SerieFlujo
          color={VERDE_RENTA}
          forma="punto"
          texto="RENTA — interés"
          eje="eje der., otra escala"
        />
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
            <YAxis
              yAxisId="capital"
              tick={{ fill: "var(--t-accent)", fontSize: 10 }}
              axisLine={{ stroke: "var(--t-border-2)" }}
              tickLine={false}
              width={ejeCompacto ? 60 : 52}
              tickFormatter={fmtEjeCapital}
            />
            {/* El eje de la renta arranca en 0 y llega a un número redondo apenas
                arriba del cupón más grande: la línea usa el alto del gráfico y
                queda aire para el número sobre cada punto. */}
            <YAxis
              yAxisId="renta"
              orientation="right"
              tick={{ fill: VERDE_RENTA, fontSize: 10 }}
              axisLine={{ stroke: VERDE_RENTA }}
              tickLine={false}
              width={ejeCompacto ? 60 : 52}
              domain={[0, techoRenta]}
              tickCount={5}
              tickFormatter={fmtEjeRenta}
            />
            <Tooltip {...tooltip} />
            {/* Barras FINAS y translúcidas. Anchas y macizas (el default: cada
                barra ocupa toda su categoría) el gráfico es un paredón, y encima
                de ese paredón no se lee ni la línea de cupones ni sus números. */}
            <Bar
              yAxisId="capital"
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
              yAxisId="renta"
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
                  cada punto y el eje derecho pasa a ser una referencia, no la
                  fuente del dato. Cuando no entra, manda el tooltip. */}
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
