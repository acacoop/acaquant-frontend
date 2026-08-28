"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { useViewportKey } from "@/lib/use-viewport-key";
import { FairValueView } from "./fair-value-view";
import type { BonoCurva, FairValueDoc } from "@/lib/types";
import { fmtFechaCorta } from "@/lib/fmt";

interface HistRow {
  fecha: string;
  ticker: string;
  tipo?: string | null;
  price: number | null;
  TEA: number | null;
  TEM: number | null;
  duration: number | null;
  paridad: number | null;
}

interface Punto {
  Ticker: string;
  Duration: number;
  y: number;
}

export type Curva = "tasa_fija" | "cer" | "soberanos" | "dolar_linked" | "tamar" | "dual";
// MARGEN no es una opción del selector: es la métrica OBLIGADA de la curva
// TAMAR (ver `metricaUsada`). Vive en el mismo type para que el eje, el fit, el
// tooltip y la leyenda la traten como a cualquier otra y no haya un camino
// paralelo que se olvide de actualizar.
type Metrica = "TEA" | "TEM" | "TNA" | "MARGEN";
type Modo = "live" | "hist" | "fair";

// Los SOBERANOS se parten en familias — BONARES (ley local) vs GLOBALES (ley
// NY) — porque su spread es de lo más mirado de la mesa. El resto va a un solo
// grupo "default", que se renderiza sin leyenda.
//
// La familia sale de `ley`, que es un EJE del rediseño. Antes salía de `tipo`
// (la columna legacy del master) y eso producía una leyenda absurda: con el
// filtro en CORPORATIVO la curva USD mostraba "DEFAULT · SOBERANO", porque los
// corporativos tienen `tipo` vacío y algún soberano suelto lo tenía cargado.
// El error de fondo era usar la PILL para decidir: `hard_dolar` mapea a la
// curva `soberanos`, pero desde que el EMISOR es su propio filtro esa pill es
// un eje de MONEDA, no de emisor.
// Un color POR GRUPO. Antes solo estaban globales y bonares, y todo lo demás
// caía en `default` — que encima usaba el MISMO verde que globales, así que
// BOPREALes, soberanos y globales se dibujaban idénticos y la leyenda mostraba
// cuatro puntitos del mismo color. Si el color no distingue, no sirve de nada
// pintarlos.
//
// Los grupos salen del campo `tipo` del master, y la búsqueda normaliza a
// minúsculas (`colorDe`) para que un 'Bonares' con mayúscula no se caiga al
// default en silencio, que es exactamente cómo pasó desapercibido hasta ahora.
const COLORES: Record<string, { scatter: string; fit: string; label: string }> = {
  globales: { scatter: "var(--t-pos)", fit: "#4488ff", label: "GLOBALES" },
  bonares:  { scatter: "#ff9900",      fit: "#ffaa66", label: "BONARES" },
  bopreal:  { scatter: "#bb66ff",      fit: "#cc99ff", label: "BOPREAL" },
  soberano: { scatter: "#4a9eff",      fit: "#88bbff", label: "SOBERANO" },
  on:       { scatter: "#00cccc",      fit: "#66dddd", label: "ON" },
  lecap:    { scatter: "#ffee44",      fit: "#fff299", label: "LECAP" },
  boncap:   { scatter: "#ff66aa",      fit: "#ff99c4", label: "BONCAP" },
  bono:     { scatter: "#8899aa",      fit: "#aabbcc", label: "BONO" },
  // INDUSTRIAS de los corporativos (2026-08-16). Un corporativo caía todo junto
  // en un grupo único; ahora se separa por la industria de su EMISOR, que vive
  // UNA vez en `mercado.emisores` y no repetida en cada bono.
  // `sin_industria` tiene color propio y NO se pinta como "otros": son cosas
  // distintas — uno es "nadie lo decidió todavía" y el otro es una decisión.
  energia:            { scatter: "#ffaa33", fit: "#ffcc88", label: "ENERGÍA" },
  finanzas:           { scatter: "#33ccaa", fit: "#88ddcc", label: "FINANZAS" },
  agro:               { scatter: "#99dd44", fit: "#c2ee99", label: "AGRO" },
  industria:          { scatter: "#dd7788", fit: "#eeaab4", label: "INDUSTRIA" },
  consumo:            { scatter: "#dd66dd", fit: "#eeaaee", label: "CONSUMO" },
  telecomunicaciones: { scatter: "#5599ff", fit: "#99bbff", label: "TELECOM" },
  construccion:       { scatter: "#cc9966", fit: "#ddbb99", label: "CONSTRUCCIÓN" },
  transporte:         { scatter: "#77bbcc", fit: "#aaddee", label: "TRANSPORTE" },
  otros:              { scatter: "#99aabb", fit: "#bbccdd", label: "OTROS" },
  sin_industria:      { scatter: "#666f7a", fit: "#8a929c", label: "SIN CLASIFICAR" },
  default:  { scatter: "#8899aa",      fit: "#aabbcc", label: "" },
};

// `ley` → la clave de color. Es la traducción de un EJE del master al nombre
// que la mesa usa: ley local = Bonares, ley NY = Globales.
function _familia(ley: string | null | undefined): string | null {
  const l = (ley || "").toLowerCase();
  return l === "local" ? "bonares" : l === "ny" ? "globales" : null;
}

// A qué FAMILIA pertenece un bono en el gráfico. Un soberano se separa por LEY
// (Bonar/Global) y un corporativo por la INDUSTRIA de su emisor. Vive UNA sola vez
// porque lo usan los puntos Y la leyenda: si cada uno lo derivara a su manera, la
// leyenda podría ofrecer un filtro que no matchea ningún punto.
function familiaDe(b: { emisor_tipo: string; ley: string | null; industria: string | null }) {
  if (b.emisor_tipo === "soberano") return _familia(b.ley);
  if (b.emisor_tipo === "corporativo") return b.industria || "sin_industria";
  return null;
}

function colorDe(tipo: string) {
  return COLORES[(tipo || "").toLowerCase()] || COLORES.default;
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

function logFit(xs: number[], ys: number[]): { a: number; b: number } | null {
  if (xs.length < 2) return null;
  const logs = xs.map(Math.log);
  const n = xs.length;
  const sumLogX = logs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumLogXY = logs.reduce((acc, lx, i) => acc + lx * ys[i], 0);
  const sumLogX2 = logs.reduce((acc, lx) => acc + lx * lx, 0);
  const denom = n * sumLogX2 - sumLogX * sumLogX;
  if (Math.abs(denom) < 1e-12) return null;
  const a = (n * sumLogXY - sumLogX * sumY) / denom;
  const b = (sumY - a * sumLogX) / n;
  return { a, b };
}

export function CurvasChart({
  bonos,
  fairValueInicial,
  curvaFija,
  sinPills = false,
}: {
  // LOS MISMOS bonos que muestra la tabla de arriba (`curvas-vista`). En LIVE el
  // gráfico dibuja exactamente estos: por construcción no puede contradecirla.
  //
  // Antes se armaba de `forwards` + `/analitica/listar-curva?curva=…`, que leen
  // la columna VIEJA `curva`, mientras la tabla ya venía por EJES. Con
  // EMISOR=corporativo la tabla listaba 107 bonos y el gráfico buscaba en
  // `curva='soberanos'` (~21 filas): la intersección quedaba casi vacía. Y al
  // revés, con una pill sin bonos (DUALES=0) el filtro se desactivaba y el
  // gráfico dibujaba TODO junto a una tabla vacía. Dos fuentes para el mismo
  // panel siempre terminan discrepando — ahora hay una.
  bonos: BonoCurva[];
  fairValueInicial?: Record<string, FairValueDoc>;
  // Rediseño 2026-08-15 (docs/RENTA_FIJA.md §0): en la tab CURVAS la curva la
  // manda la PILL de su columna, no el chart. Sigue haciendo falta para el modo
  // HISTÓRICO y para Fair Value, que sí consultan por curva.
  curvaFija?: Curva | null;
  sinPills?: boolean;
}) {
  const [curvaInterna, setCurva] = useState<Curva>("tasa_fija");
  const curva: Curva = curvaFija ?? curvaInterna;
  const [metrica, setMetrica] = useState<Metrica>("TEA");
  const [modo, setModo] = useState<Modo>("live");
  // Familia AISLADA por la leyenda (null = todas). En HARD DOLAR conviven ~8
  // industrias y el gráfico era ilegible; con esto se mira una sola.
  const [aislada, setAislada] = useState<string | null>(null);
  // Cambiar de pill LIMPIA el aislado: las familias de TASA FIJA no son las de
  // HARD DOLAR, así que un aislado heredado dejaría el gráfico vacío y la leyenda
  // sin nada resaltado — o sea, sin pista de por qué no se ve nada.
  useEffect(() => { setAislada(null); }, [curva]);
  const vpKey = useViewportKey();

  const [histByCurva, setHistByCurva] = useState<Record<string, HistRow[]>>({});
  const [histLoading, setHistLoading] = useState(false);
  const [histError, setHistError] = useState<string | null>(null);

  // Snapshot LIVE de duration real (Macaulay) — necesario para soberanos
  // amortizables, donde TTM ≠ duration.

  useEffect(() => {
    if (modo !== "hist") return;
    if (histByCurva[curva]) return;
    let cancelled = false;
    (async () => {
      try {
        setHistLoading(true);
        setHistError(null);
        const res = await fetch(
          `/api/historico-curva?curva=${encodeURIComponent(curva)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j: HistRow[] = await res.json();
        if (cancelled) return;
        setHistByCurva((prev) => ({ ...prev, [curva]: j }));
      } catch (e) {
        if (!cancelled) {
          setHistError(e instanceof Error ? e.message : "error");
        }
      } finally {
        if (!cancelled) setHistLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modo, curva, histByCurva]);

  // Sort defensivo ASC (más viejo → más reciente). El default de .sort() para
  // strings ISO ya da ASC, pero hacemos el compare explícito para evitar
  // sorpresas si alguna fecha viene con otro formato.
  const fechasHist = useMemo(() => {
    const rows = histByCurva[curva] || [];
    return Array.from(new Set(rows.map((r) => r.fecha))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [histByCurva, curva]);

  const [fechaIdx, setFechaIdx] = useState<number | null>(null);

  // Modo efectivo: si el usuario tiene "fair" seleccionado pero cambió a una
  // curva sin soporte (soberanos / dolar_linked), renderizamos como "live"
  // sin tocar el state. Cuando vuelva a tasa_fija/cer reaparece el modo fair.
  // TAMAR entra por el mismo camino: se grafica por MARGEN y el histórico solo
  // guarda TEA, así que en HISTÓRICO el eje diría una cosa y los puntos serían
  // otra. Se renderiza como live sin tocar el state.
  const modoEfectivo: Modo =
    (modo === "fair" && curva !== "tasa_fija" && curva !== "cer") ||
    (modo !== "live" && curva === "tamar")
      ? "live"
      : modo;

  // Reset del slider cuando cambia curva o modo, para que el default
  // (último = más reciente) se aplique sin arrastrar el valor anterior.
  useEffect(() => {
    setFechaIdx(null);
  }, [curva, modo]);

  const effectiveIdx =
    fechasHist.length > 0
      ? fechaIdx == null
        ? fechasHist.length - 1
        : Math.min(Math.max(0, fechaIdx), fechasHist.length - 1)
      : 0;
  const fechaSel = fechasHist[effectiveIdx];

  // CER y soberanos siempre se grafican en TEA (TEM mensualizado no tiene
  // sentido en USD ni para CER real).
  // ⚠️ Un TAMAR NO se compara por tasa. Los ocho flotan contra la MISMA
  // referencia (la TAMAR del BCRA), así que su TEA nominal se mueve toda junta y
  // ordenarlos por ella no dice nada del papel: lo que distingue a un TAMAR de
  // otro es cuánto paga POR ENCIMA de esa referencia. La curva de la mesa es
  // MARGEN vs duration, y por eso no es una opción del selector sino la única
  // métrica posible de esa pill.
  const metricaUsada: Metrica =
    curva === "tamar" ? "MARGEN"
    : curva === "cer" || curva === "soberanos" ? "TEA"
    : metrica;

  const { puntosPorTipo, fitPorTipo, yMin, yMax, yTicks, xMin, xMax, xTicks, tipos } = useMemo(() => {
    const puntosPorTipo: Record<string, Punto[]> = {};
    const pushPunto = (tipo: string | null | undefined, p: Punto) => {
      const t = (tipo || "default").toLowerCase();
      // El aislado se aplica ACÁ y no al dibujar: así el eje Y, el fit y las
      // etiquetas se recalculan para lo que quedó. Filtrando solo en el render,
      // aislar FINANZAS dejaría la escala de los 129 bonos y se vería una raya.
      if (aislada && t !== aislada) return;
      (puntosPorTipo[t] ??= []).push(p);
    };

    if (modo === "live") {
      // Los puntos salen de `bonos` — la MISMA lista que la tabla. `duration` y
      // `TEA` vienen de `mercado.market_snapshot`, igual que antes: el número no
      // cambia, cambia de dónde se lo pide.
      //
      for (const b of bonos) {
        const dur = b.metrics?.duration;
        const tea = b.metrics?.TEA;
        // Curva por MARGEN: no depende de la TEA, así que un TAMAR sin tasa
        // igual entra al gráfico mientras tenga spread. Y el que no tiene margen
        // (los corporativos que 1816 no cubre) NO se grafica en cero: se omite,
        // porque un 0% ahí se leería como "paga la TAMAR pelada".
        if (metricaUsada === "MARGEN") {
          if (!b.ticker_corto || dur == null || dur <= 0 || b.margen == null) continue;
          pushPunto(familiaDe(b), {
            Ticker: b.ticker_corto,
            Duration: +dur.toFixed(4),
            y: +(b.margen * 100).toFixed(4),
          });
          continue;
        }
        if (!b.ticker_corto || dur == null || dur <= 0 || tea == null) continue;
        // ⚠️ Las tasas RUIDO no se grafican. Un bono a 3 días con TEA 142% no es
        // un punto alto de la curva: es un artefacto de anualizar pocos días, y
        // UNO SOLO estira el eje Y hasta aplastar a los otros 120 bonos contra el
        // cero (visto en pantalla el 2026-08-16 con AFCHO, CS450 y HBCAO).
        // Sigue en la TABLA, apagado — se saca del gráfico, no del dato.
        if (b.tasa_ruido) continue;
        const teaPct = tea * 100;
        const temPct = b.metrics?.TEM != null
          ? b.metrics.TEM * 100
          : (Math.pow(1 + tea, 1 / 12) - 1) * 100;
        // TNA (capitalización mensual nominal) = TEM × 12.
        const tnaPct = temPct * 12;
        const y =
          metricaUsada === "TEM" ? temPct
          : metricaUsada === "TNA" ? tnaPct
          : teaPct;
        // Por BONO, no por pill. Un soberano se separa por LEY (Bonar/Global) y
        // un corporativo por la INDUSTRIA de su emisor — que es lo que faltaba
        // para poder leer HARD DOLAR, donde conviven 14 soberanos con ~100 ONs.
        // Sin industria cargada va a su propio grupo VISIBLE: mezclarlo con
        // `otros` haría que "nadie lo decidió" se vea igual que una decisión.
        pushPunto(familiaDe(b), {
          Ticker: b.ticker_corto,
          Duration: +dur.toFixed(4),
          y: +y.toFixed(4),
        });
      }
    } else if (fechaSel) {
      const rows = (histByCurva[curva] || []).filter((r) => r.fecha === fechaSel);
      for (const r of rows) {
        if (r.duration == null || r.duration <= 0) continue;
        const tea = r.TEA;
        if (tea == null) continue;
        const teaPct = tea * 100;
        const temPct = r.TEM != null ? r.TEM * 100 : (Math.pow(1 + tea, 1 / 12) - 1) * 100;
        const tnaPct = temPct * 12;
        const y =
          metricaUsada === "TEM" ? temPct
          : metricaUsada === "TNA" ? tnaPct
          : teaPct;
        // Solo soberanos se divide en familias (globales/bonares), cada una con
        // su propio fit. Para tasa_fija / cer / dolar_linked todo va a "default"
        // → UNA sola curva, igual que en LIVE. Sin esto, el `tipo` de cada bono
        // (lecap/boncap) partía la curva en 2 líneas de fit en HISTÓRICO.
        pushPunto(curva === "soberanos" ? r.tipo : null, {
          Ticker: r.ticker,
          Duration: +r.duration.toFixed(4),
          y: +y.toFixed(4),
        });
      }
    }

    // La línea es una tendencia LOG local ajustada sobre los puntos LIVE que se
    // grafican (los bonos CON dato de la rueda) → es una curva LIVE: refleja el
    // PRESENTE. Antes se dibujaba la cuadrática oficial del fair value (β del
    // cierre), pero al depender del cierre quedaba congelada y se disparaba a
    // -80% cuando ese cierre tenía bonos con flujos malos, aunque el dato live
    // ya estuviera bien. La curva oficial del fair value vive en la pestaña
    // FAIR VALUE (esa sí usa los β del cierre).
    // ⚠️ PERFORMANCE — la GRILLA DEL FIT ES COMPARTIDA, y esa es toda la
    // diferencia entre que la pantalla ande y que se arrastre.
    //
    // Antes cada tipo generaba SU propia rampa de 101 puntos. Como recharts
    // recibe UN dataset con una fila por valor de X, cada rampa aportaba 101
    // filas NUEVAS que ninguna otra serie compartía. Con EMISOR=SOBERANO hay 2
    // familias (Bonares/Globales) → ~200 filas de fit y no se notaba. Con
    // EMISOR=CORPORATIVO el tipo es la INDUSTRIA y son hasta 10 → ~1.010 filas
    // de fit, y encima 20 series (una Line + un Scatter por industria) que
    // recorren el dataset ENTERO cada una. Y esto se rehace cada 5 segundos, en
    // las DOS columnas, porque la tabla es live.
    //
    // Con una sola grilla de GRID_FIT valores para todo el gráfico, las 10
    // industrias comparten las mismas filas: el dataset baja de ~1.100 a ~150
    // filas sin que el dibujo cambie (una curva log sobre 48 puntos ya es
    // suave; los 101 originales caían todos dentro del mismo pixel).
    //
    // Cada tipo se evalúa SOLO dentro de su propio rango [xA, xB] — un fit no
    // se extrapola fuera de los bonos que lo generaron. Como ese rango es
    // contiguo, los huecos quedan en las PUNTAS y nunca en el medio, así que el
    // `connectNulls` de la Line no puede inventar un tramo que no existe.
    const GRID_FIT = 48;
    const fitPorTipo: Record<string, { Duration: number; y: number }[] | null> = {};
    const allY: number[] = [];
    const allX: number[] = [];

    const tiposOrden = Object.keys(puntosPorTipo);
    for (const t of tiposOrden) {
      puntosPorTipo[t].sort((a, b) => a.Duration - b.Duration);
      for (const p of puntosPorTipo[t]) {
        allX.push(p.Duration);
        allY.push(p.y);
      }
    }

    // La grilla se arma sobre el rango de TODOS los puntos graficados, una vez.
    const gX = allX.length ? Math.min(...allX) : 0;
    const gY = allX.length ? Math.max(...allX) : 1;
    const grilla: number[] = [];
    if (gY > gX) {
      for (let i = 0; i <= GRID_FIT; i++) {
        grilla.push(+(gX + ((gY - gX) * i) / GRID_FIT).toFixed(4));
      }
    }

    for (const t of tiposOrden) {
      const pts = puntosPorTipo[t];
      let fitArr: { Duration: number; y: number }[] | null = null;
      if (pts.length >= 2 && grilla.length) {
        const xs = pts.map((p) => p.Duration);
        const ys = pts.map((p) => p.y);
        const xA = xs[0];
        const xB = xs[xs.length - 1];
        const fitted = logFit(xs, ys);
        if (fitted) {
          // Las puntas EXACTAS del rango entran siempre, aunque no caigan sobre
          // la grilla: sin ellas el fit de una industria de pocos bonos podría
          // quedarse sin un solo punto adentro y desaparecer del gráfico.
          const xsFit = grilla.filter((x) => x >= xA && x <= xB);
          if (xsFit[0] !== xA) xsFit.unshift(xA);
          if (xsFit[xsFit.length - 1] !== xB) xsFit.push(xB);
          fitArr = xsFit.map((x) => ({
            Duration: x,
            y: +(fitted.a * Math.log(x) + fitted.b).toFixed(4),
          }));
          for (const p of fitArr) allY.push(p.y);
        }
      }
      fitPorTipo[t] = fitArr;
    }
    const yScale = allY.length
      ? niceScale(Math.min(...allY), Math.max(...allY), 6)
      : { min: 0, max: 1, ticks: [0, 1] };
    const xScale = allX.length
      ? niceScale(Math.min(...allX), Math.max(...allX), 7)
      : { min: 0, max: 1, ticks: [0, 1] };

    const tipos = Object.keys(puntosPorTipo).sort();

    return {
      puntosPorTipo,
      fitPorTipo,
      tipos,
      yMin: yScale.min,
      yMax: yScale.max,
      yTicks: yScale.ticks,
      xMin: xScale.min,
      xMax: xScale.max,
      xTicks: xScale.ticks,
    };
  }, [bonos, curva, metricaUsada, modo, histByCurva, fechaSel, fairValueInicial,
      aislada]);

  const totalPuntos = tipos.reduce(
    (n, t) => n + (puntosPorTipo[t]?.length || 0),
    0,
  );

  // ⚠️ PERFORMANCE + LEGIBILIDAD — las ETIQUETAS DE TICKER se apagan solas
  // cuando son demasiadas, y se pueden volver a prender a mano.
  //
  // Cada `<Scatter>` lleva un `<LabelList>`, y recharts evalúa una etiqueta por
  // FILA DEL DATASET y por serie — no por punto con valor. Con EMISOR=CORPORATIVO
  // eso eran ~10 industrias × ~1.100 filas ≈ 11.000 etiquetas para dibujar 102
  // tickers, cada 5 segundos y en las dos columnas.
  //
  // Y aunque fuera gratis, 102 tickers de 10px sobre un gráfico no se leen: se
  // pisan entre ellos y tapan los puntos. Con SOBERANO (~20-60 puntos) sí se
  // leen, y ahí siguen prendidos.
  //
  // `null` = automático. El usuario lo puede forzar en cualquier sentido, y el
  // botón dice en cuál está — apagar algo en silencio es peor que la lentitud.
  const [tickersModo, setTickersModo] = useState<boolean | null>(null);
  const AUTO_TICKERS_MAX = 40;
  const mostrarTickers = tickersModo ?? totalPuntos <= AUTO_TICKERS_MAX;

  // Construir el dataset combinado: cada punto tiene un campo dinámico
  // por tipo (scatterY_<tipo> y fitY_<tipo>) para que recharts pueda
  // renderizar series independientes con sus propios colores.
  const merged = useMemo(() => {
    const map = new Map<number, Record<string, number | string>>();
    const ensure = (dur: number) => {
      let row = map.get(dur);
      if (!row) {
        row = { Duration: dur };
        map.set(dur, row);
      }
      return row;
    };
    for (const tipo of tipos) {
      for (const p of puntosPorTipo[tipo] || []) {
        const row = ensure(p.Duration);
        row[`scatterY_${tipo}`] = p.y;
        // El ticker solo viaja si se va a dibujar: es una string por punto y por
        // serie en un dataset que recharts recorre entero.
        if (mostrarTickers) row[`Ticker_${tipo}`] = p.Ticker;
      }
      const fit = fitPorTipo[tipo];
      if (fit) {
        for (const p of fit) {
          const row = ensure(p.Duration);
          row[`fitY_${tipo}`] = p.y;
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (a.Duration as number) - (b.Duration as number),
    );
  }, [puntosPorTipo, fitPorTipo, tipos, mostrarTickers]);

  const hayHist = fechasHist.length > 0;
  // La leyenda nombra FAMILIAS (Bonares, Globales…). `default` no es una
  // familia: es "todo lo demás", y no tiene nombre — mostrarlo produjo la
  // leyenda "DEFAULT · SOBERANO" que no significaba nada. Se muestra sólo si
  // hay DOS familias de verdad que distinguir.
  // ⚠️ La leyenda se arma con TODAS las familias, no con `tipos`: al aislar una,
  // `tipos` queda con un solo elemento y la leyenda se autodestruía — sin forma de
  // volver a ver el resto. Es el clásico control que se borra a sí mismo.
  const familias = useMemo(() => {
    const set = new Set<string>();
    for (const b of bonos) {
      const t = (familiaDe(b) || "default").toLowerCase();
      if (t !== "default" && colorDe(t).label) set.add(t);
    }
    return Array.from(set).sort();
  }, [bonos]);
  const mostrarLegend = familias.length > 1;

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-2 flex-wrap shrink-0">
        {!sinPills && (
          <>
            <FilterBtn
              active={curva === "tasa_fija"}
              onClick={() => setCurva("tasa_fija")}
            >
              TASA FIJA
            </FilterBtn>
            <FilterBtn active={curva === "cer"} onClick={() => setCurva("cer")}>
              CER
            </FilterBtn>
            <FilterBtn active={curva === "soberanos"} onClick={() => setCurva("soberanos")}>
              HARD DOLAR
            </FilterBtn>
            <FilterBtn active={curva === "dolar_linked"} onClick={() => setCurva("dolar_linked")}>
              DOLAR LINKED
            </FilterBtn>
          </>
        )}
        {curva === "tasa_fija" && (
          <div className="ml-1 flex items-center gap-1">
            <FilterBtn active={metrica === "TEA"} onClick={() => setMetrica("TEA")}>
              TEA
            </FilterBtn>
            <FilterBtn active={metrica === "TEM"} onClick={() => setMetrica("TEM")}>
              TEM
            </FilterBtn>
            <FilterBtn active={metrica === "TNA"} onClick={() => setMetrica("TNA")}>
              TNA
            </FilterBtn>
          </div>
        )}
        <span className="w-px h-3 bg-[var(--t-border-2)] mx-1" />
        <FilterBtn active={modo === "live"} onClick={() => setModo("live")}>
          LIVE
        </FilterBtn>
        <FilterBtn active={modo === "hist"} onClick={() => setModo("hist")}>
          HISTÓRICO
        </FilterBtn>
        {(curva === "tasa_fija" || curva === "cer") && (
          <FilterBtn active={modo === "fair"} onClick={() => setModo("fair")}>
            FAIR VALUE
          </FilterBtn>
        )}
        {/* Las etiquetas se apagan solas cuando son ilegibles (y caras). El
            botón EXISTE para que eso no sea un misterio: dice en qué estado
            está y deja forzarlo. Un click alterna respecto de lo que se ve
            ahora, así que siempre hace lo que el botón promete. */}
        {modoEfectivo !== "fair" && totalPuntos >= 2 && (
          <FilterBtn
            active={mostrarTickers}
            onClick={() => setTickersModo(!mostrarTickers)}
            title={
              mostrarTickers
                ? `Ocultar los ${totalPuntos} tickers del gráfico`
                : `Mostrar los ${totalPuntos} tickers${
                    tickersModo === null
                      ? ` (apagados automáticamente: más de ${AUTO_TICKERS_MAX} puntos se pisan entre sí)`
                      : ""
                  }`
            }
          >
            TICKERS
          </FilterBtn>
        )}

        {mostrarLegend && (
          <div className="ml-auto flex items-center gap-3 text-[10px]">
            {/* La leyenda ES el filtro. No se agrega una fila de controles nueva:
                en HARD DOLAR conviven ~8 industrias y lo que hacía falta era poder
                mirar una sola, no un panel más que le coma alto al gráfico.
                UN click aísla; click en la aislada vuelve a todas. */}
            {familias.map((t) => {
              const c = colorDe(t);
              const apagada = aislada !== null && aislada !== t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setAislada((prev) => (prev === t ? null : t))}
                  title={aislada === t ? "Ver todas" : `Ver solo ${c.label}`}
                  className={`flex items-center gap-1 cursor-pointer transition-opacity ${
                    apagada ? "opacity-30 hover:opacity-60" : "opacity-100"
                  }`}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ background: c.scatter }}
                  />
                  <span
                    className={`tracking-wide ${
                      aislada === t
                        ? "text-[var(--t-accent)] font-semibold"
                        : "text-[var(--t-text-dim)]"
                    }`}
                  >
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {modo === "hist" && (
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <span className="text-[10px] text-[var(--t-text-muted)] tracking-wide">FECHA</span>
          {histLoading && !hayHist ? (
            <span className="text-[10px] text-[var(--t-text-muted)]">cargando…</span>
          ) : histError ? (
            <span className="text-[10px] text-[var(--t-neg)]">error: {histError}</span>
          ) : !hayHist ? (
            <span className="text-[10px] text-[var(--t-text-muted)]">sin histórico</span>
          ) : (
            <>
              <input
                type="range"
                min={0}
                max={fechasHist.length - 1}
                value={effectiveIdx}
                onChange={(e) => setFechaIdx(Number(e.target.value))}
                className="flex-1 range-slider"
              />
              <span className="text-[10px] text-[var(--t-accent)] font-mono min-w-[60px] text-right">
                {fechaSel ? fmtFechaCorta(fechaSel) : "--"}
              </span>
            </>
          )}
        </div>
      )}

      {modoEfectivo === "fair" && (curva === "tasa_fija" || curva === "cer") ? (
        <div className="flex-1 min-h-0">
          <FairValueView key={curva} curva={curva} initialDoc={fairValueInicial?.[curva]} />
        </div>
      ) : totalPuntos >= 2 ? (
        <div className="flex-1 min-h-0 relative">
          <ResponsiveContainer key={vpKey} width="100%" height="100%">
            <ComposedChart data={merged} margin={{ top: 20, right: 20, bottom: 10, left: 10 }}>
              <XAxis
                dataKey="Duration"
                type="number"
                domain={[xMin, xMax]}
                ticks={xTicks}
                tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                axisLine={{ stroke: "var(--t-border-2)" }}
                tickLine={false}
                tickFormatter={(v: number) => v.toFixed(1)}
                label={{ value: "Duration (años)", position: "insideBottom", offset: -4, fill: "var(--t-text-muted)", fontSize: 10 }}
              />
              <YAxis
                domain={[yMin, yMax]}
                ticks={yTicks}
                tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                axisLine={{ stroke: "var(--t-border-2)" }}
                tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(curva === "cer" ? 1 : 2)}%`}
                label={
                  metricaUsada === "MARGEN"
                    ? { value: "Margen s/ TAMAR", angle: -90, position: "insideLeft",
                        fill: "var(--t-text-muted)", fontSize: 10 }
                    : undefined
                }
              />
              <Tooltip
                contentStyle={{
                  background: "var(--t-surface)",
                  border: "1px solid var(--t-border-2)",
                  fontSize: 11,
                  fontFamily: "JetBrains Mono, monospace",
                }}
                labelStyle={{ color: "var(--t-text-dim)" }}
                formatter={(value, name) => {
                  const v = Number(value);
                  const key = String(name);
                  if (key.startsWith("scatterY_")) {
                    const tipo = key.slice("scatterY_".length);
                    const label = colorDe(tipo).label || metricaUsada;
                    return [`${v.toFixed(2)}%`, label || metricaUsada];
                  }
                  if (key.startsWith("fitY_")) return [`${v.toFixed(2)}%`, "Fit log"];
                  return [String(value), key];
                }}
                labelFormatter={(v) => `Duration ${Number(v).toFixed(2)} años`}
              />
              {tipos.map((t) => {
                const c = colorDe(t);
                if (!fitPorTipo[t]) return null;
                return (
                  <Line
                    key={`fit-${t}`}
                    dataKey={`fitY_${t}`}
                    type="monotone"
                    stroke={c.fit}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}
              {tipos.map((t) => {
                const c = colorDe(t);
                return (
                  <Scatter
                    key={`pts-${t}`}
                    dataKey={`scatterY_${t}`}
                    fill={c.scatter}
                    isAnimationActive={false}
                  >
                    {mostrarTickers && (
                      <LabelList
                        dataKey={`Ticker_${t}`}
                        position="top"
                        fill="#aaaaaa"
                        style={{ fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                      />
                    )}
                  </Scatter>
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-[var(--t-text-muted)] text-xs py-4 text-center">
          {modo === "hist" && histLoading ? "Cargando…" : "SIN DATOS — MERCADO CERRADO"}
        </p>
      )}
    </div>
  );
}

function FilterBtn({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}
