"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  createChart,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { usePoll } from "@/lib/use-poll";
import type {
  MonitorClase,
  MonitorResp,
  MonitorUniverso,
  MonitorVentana,
} from "@/lib/types-trading";

/**
 * Tab MONITOR — **dónde se operó la plata**, no dónde está el precio.
 *
 * PIVOTS contesta "a qué nivel está"; esto contesta "a qué precio está el
 * volumen": el POC (el precio más operado de la ventana) y el área de valor
 * (la banda donde se hizo el 70 % del negocio). Es el nivel que la mesa
 * defiende, y hasta ahora no estaba en ninguna pantalla.
 *
 * Layout: 20 % universo / 80 % partido 50-50 (precio arriba, volumen por
 * precio abajo).
 *
 * **El filtro madre RENTA FIJA / RENTA VARIABLE no es cosmético**: cambia el
 * universo, las UNIDADES de los dos gráficos (renta fija cotiza en paridad,
 * precio cada 100 VN, y su volumen son VN; renta variable son pesos por CEDEAR
 * y papeles) y las ventanas disponibles. Mezclarlas en un mismo eje no
 * significa nada, por eso nunca conviven.
 *
 * **Acá no se deriva NADA.** El POC, el área de valor, los buckets (contiguos,
 * con los huecos ya en cero) y la fuente los manda el backend resueltos. Si la
 * pantalla recalculara el POC, podría terminar contradiciendo al mismo endpoint
 * que le dio los datos. Las VENTANAS también vienen del backend: hardcodearlas
 * acá dibujaría botones que el service rechaza.
 *
 * El chip de FUENTE está siempre visible porque las ventanas NO salen todas de
 * la misma tabla: en renta variable, HOY es el tape tick a tick (exacto) y el
 * multi-rueda son barras de 1 minuto, donde el perfil se deriva del precio
 * típico de cada barra — una aproximación. El backend lo marca en `aproximado`
 * y acá se muestra: un POC aproximado que se ve idéntico a uno exacto es
 * exactamente el tipo de número que se mira mal.
 */
const POLL_VIVO_MS = 3_000;      // HOY: el tape se escribe todo el tiempo
const POLL_ARCHIVO_MS = 120_000; // multi-rueda: no cambia hasta el próximo cierre
const POLL_RAIL_MS = 10_000;
const BUCKETS = 26;

const fmtNum = (n: number | null | undefined, dec = 2) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtPct = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

const fmtVol = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 2 })} M`;
  if (n >= 1e3) return `${Math.round(n / 1e3).toLocaleString("es-AR")} k`;
  return Math.round(n).toLocaleString("es-AR");
};

// Renta fija cotiza en paridad (2 decimales); los CEDEARs en pesos, donde el
// decimal es ruido a estos precios.
const decimales = (clase: MonitorClase) => (clase === "rf" ? 2 : 0);

// Las unidades viven en los EJES del gráfico, no en un chip aparte: repetirlas
// arriba era ruido y encima podía quedar desincronizado del eje.
const UNIDADES: Record<MonitorClase, { ejeX: string; ejeY: string }> = {
  rv: { ejeX: "PRECIO ARS", ejeY: "NOMINALES" },
  rf: { ejeX: "PRECIO c/100 VN", ejeY: "NOMINALES (VN)" },
};

export function MonitorView() {
  const [clase, setClase] = useState<MonitorClase>("rv");
  const [ticker, setTicker] = useState<string | null>(null);
  // null = "todavía no eligió": abre con la que el backend marca por defecto
  // (20 R en renta variable). Derivado, no seteado desde un efecto.
  const [ventana, setVentana] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  // null = TODAS. Solo renta fija (los CEDEARs no tienen curva).
  const [curva, setCurva] = useState<string | null>(null);

  const { data: uni, error: errUni } = usePoll<MonitorUniverso | null>(
    `/api/trading/monitor/universo?clase=${clase}`,
    null,
    POLL_RAIL_MS,
    { fetchOnMount: true },
  );

  const items = useMemo(() => uni?.items ?? [], [uni]);
  const ventanas = uni?.ventanas ?? [];
  const curvasDisp = useMemo(() => uni?.curvas ?? [], [uni]);

  // Sin elección explícita se muestra el primero del rail, que viene ordenado
  // por plata operada — el papel que la mesa está mirando. Se DERIVA, no se
  // guarda en estado: setear el default desde un efecto encadena un render de
  // más en cada poll del universo (y el linter lo prohíbe, con razón).
  const activo = ticker ?? items[0]?.ticker ?? null;
  // La ventana la elige el BACKEND (`por_defecto`), no una constante de acá: si
  // se hardcodeara, cambiar el default sería tocar los dos repos, y mientras
  // tanto la tab abriría en una ventana que el backend ya no considera la suya.
  const ventanaActiva = ventana ?? ventanas.find((v) => v.por_defecto)?.ventana ?? null;

  const cambiarClase = (c: MonitorClase) => {
    if (c === clase) return;
    setClase(c);
    setTicker(null);      // el ticker de la otra clase no existe en ésta
    setVentana(null);     // cada clase tiene su default y sus ventanas propias
    setFiltro("");
    setCurva(null);
  };

  const visibles = useMemo(() => {
    const f = filtro.trim().toUpperCase();
    return items.filter((x) => {
      // Un dual entra en DOS curvas y tiene que aparecer con cualquiera de las
      // dos elegida — por eso es `includes` y no una comparación.
      if (curva && !(x.curvas ?? []).includes(curva)) return false;
      if (!f) return true;
      return x.ticker.includes(f) || (x.nombre || "").toUpperCase().includes(f);
    });
  }, [items, filtro, curva]);

  const dec = decimales(clase);

  return (
    <div className="h-full min-h-0 grid grid-cols-[20%_1fr]">
      {/* ── universo (20 %) ─────────────────────────────────────────────── */}
      <aside className="min-h-0 flex flex-col border-r border-[var(--t-border)]">
        <div className="shrink-0 p-2 border-b border-[var(--t-border)] space-y-2">
          <div className="grid grid-cols-2 gap-1">
            <ClaseBtn active={clase === "rf"} onClick={() => cambiarClase("rf")}>
              RENTA FIJA
            </ClaseBtn>
            <ClaseBtn active={clase === "rv"} onClick={() => cambiarClase("rv")}>
              RENTA VAR.
            </ClaseBtn>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-semibold tracking-wider text-[var(--t-text-dim)]">
              {clase === "rf" ? "BONOS Y LETRAS" : "CEDEARS"}
            </span>
            <span className="text-[10px] text-[var(--t-text-muted)] font-mono">
              {visibles.length} / {items.length}
            </span>
          </div>
          {/* Filtro por CURVA (solo renta fija): las mismas de la tab CURVAS
              de /renta-fija, con su conteo. Las manda el backend — el front no
              conoce la taxonomía ni la reconstruye. */}
          {curvasDisp.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <CurvaBtn active={curva === null} onClick={() => setCurva(null)}>
                TODAS <span className="opacity-60">{items.length}</span>
              </CurvaBtn>
              {curvasDisp.map((c) => (
                <CurvaBtn
                  key={c.codigo}
                  active={curva === c.codigo}
                  onClick={() => setCurva(curva === c.codigo ? null : c.codigo)}
                  title={c.lado === "—" ? "sin curva acordada" : c.lado}
                >
                  {c.display} <span className="opacity-60">{c.n}</span>
                </CurvaBtn>
              ))}
            </div>
          )}
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar ticker o nombre"
            className="w-full px-2 py-1 text-[11px] bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[var(--t-text)] outline-none focus:border-[var(--t-accent)]"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {errUni && (
            <div className="p-3 text-[11px] text-[var(--t-neg)]">
              No se pudo leer el universo: {errUni}
            </div>
          )}
          {visibles.map((it) => {
            const sel = it.ticker === activo;
            return (
              <button
                key={it.ticker}
                onClick={() => setTicker(it.ticker)}
                className={`w-full text-left px-2 py-1.5 border-b border-[var(--t-border)] border-l-2 grid grid-cols-[1fr_auto] gap-x-2 ${
                  sel
                    ? "bg-[var(--t-surface-2)] border-l-[var(--t-accent)]"
                    : "border-l-transparent hover:bg-[var(--t-surface)]"
                }`}
              >
                <span className="font-mono text-[12px] font-semibold text-[var(--t-text)]">
                  {it.ticker}
                </span>
                <span className="font-mono text-[12px] text-right text-[var(--t-text)] tabular-nums">
                  {fmtNum(it.last, dec)}
                </span>
                <span className="text-[10px] text-[var(--t-text-muted)] truncate">
                  {it.nombre}
                  {it.moneda ? ` · ${it.moneda}` : ""}
                </span>
                <span
                  className="font-mono text-[10px] text-right tabular-nums"
                  style={{
                    color:
                      it.var_pct == null
                        ? "var(--t-text-muted)"
                        : it.var_pct >= 0
                          ? "var(--t-pos)"
                          : "var(--t-neg)",
                  }}
                >
                  {fmtPct(it.var_pct)}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── precio (50 %) + volumen por precio (50 %) ───────────────────── */}
      {activo && ventanaActiva ? (
        <PanelDerecho
          clase={clase}
          ticker={activo}
          ventana={ventanaActiva}
          ventanas={ventanas}
          onVentana={setVentana}
        />
      ) : (
        <div className="min-h-0 flex items-center justify-center text-[11px] font-mono text-[var(--t-text-muted)]">
          elegí un instrumento
        </div>
      )}
    </div>
  );
}

/**
 * La mitad derecha: precio arriba, volumen por precio abajo. Vive aparte porque
 * es la que pollea, y `usePoll` no acepta una URL nula — sin ticker elegido no
 * hay endpoint que pedir, así que el panel directamente no se monta (en vez de
 * pollear una URL de mentira y filtrar la respuesta después).
 */
function PanelDerecho({
  clase,
  ticker,
  ventana,
  ventanas,
  onVentana,
}: {
  clase: MonitorClase;
  ticker: string;
  ventana: string;
  ventanas: MonitorVentana[];
  onVentana: (v: string) => void;
}) {
  const esVivo = ventana === "hoy";
  const { data: datos, error } = usePoll<MonitorResp | null>(
    `/api/trading/monitor?clase=${clase}&ticker=${encodeURIComponent(ticker)}` +
      `&ventana=${ventana}&buckets=${BUCKETS}`,
    null,
    esVivo ? POLL_VIVO_MS : POLL_ARCHIVO_MS,
    { fetchOnMount: true },
  );
  const dec = decimales(clase);
  const u = UNIDADES[clase];

  return (
    <div className="min-h-0 grid grid-rows-2">
        <section className="min-h-0 flex flex-col">
          <header className="shrink-0 flex items-center gap-3 flex-wrap px-3 py-1.5 border-b border-[var(--t-border)]">
            <span className="font-mono text-[15px] font-semibold text-[var(--t-text)]">
              {ticker ?? "—"}
            </span>
            <span className="font-mono text-[15px] tabular-nums text-[var(--t-accent)]">
              {fmtNum(datos?.resumen?.last, dec)}
            </span>
            <Chip>{datos?.fuente ?? "—"}</Chip>
            {datos?.aproximado && (
              <span
                className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-dim)]"
                title="El perfil sale de barras de 1 minuto (precio típico), no de trades: es una aproximación."
              >
                APROX.
              </span>
            )}
            <div className="ml-auto flex items-center gap-4">
              <Kpi label="vwap">{fmtNum(datos?.resumen?.vwap, dec)}</Kpi>
              <Kpi label="máx / mín">
                {fmtNum(datos?.resumen?.high, dec)} / {fmtNum(datos?.resumen?.low, dec)}
              </Kpi>
              <Kpi label="trades">{fmtVol(datos?.resumen?.trades)}</Kpi>
              <Kpi label="ruedas">{datos?.resumen?.ruedas ?? "—"}</Kpi>
              <div className="flex">
                {ventanas.map((v) => (
                  <button
                    key={v.ventana}
                    onClick={() => onVentana(v.ventana)}
                    title={v.fuente}
                    className={`px-2 py-0.5 text-[10px] font-mono border ${
                      v.ventana === ventana
                        ? "bg-[var(--t-surface-2)] text-[var(--t-text)] border-[var(--t-accent)]"
                        : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
                    }`}
                  >
                    {v.etiqueta}
                  </button>
                ))}
              </div>
            </div>
          </header>
          <div className="flex-1 min-h-0 relative">
            {error && <Aviso>No se pudo leer el monitor: {error}</Aviso>}
            {!error && datos?.sin_datos && (
              <Aviso>{datos.motivo ?? "sin datos"} — el papel no operó en esta ventana.</Aviso>
            )}
            <PrecioChart serie={datos?.serie ?? []} vwap={datos?.resumen?.vwap ?? null} />
          </div>
        </section>

        <section className="min-h-0 flex flex-col border-t border-[var(--t-border)]">
          <header className="shrink-0 flex items-center gap-3 flex-wrap px-3 py-1.5 border-b border-[var(--t-border)]">
            <span className="text-[10px] font-semibold tracking-wider text-[var(--t-text-dim)]">
              VOLUMEN POR PRECIO
            </span>
            {/* Las UNIDADES ya las dicen los dos ejes del gráfico (PRECIO … /
                NOMINALES): repetirlas en un chip era ruido. Lo que sí hacía
                falta es que VAL y VAH digan QUÉ SON — en el gráfico son dos
                siglas sueltas. Cada una es su propio KPI, con el nombre arriba
                del número: piso y techo de la banda donde se operó el 70 %. */}
            <div className="ml-auto flex items-center gap-4">
              <Kpi label="poc · más operado">{fmtNum(datos?.poc?.px, dec)}</Kpi>
              <Kpi label="val · piso 70 %">{fmtNum(datos?.val, dec)}</Kpi>
              <Kpi label="vah · techo 70 %">{fmtNum(datos?.vah, dec)}</Kpi>
              <Kpi label={u.ejeY.toLowerCase()}>{fmtVol(datos?.resumen?.vol)}</Kpi>
            </div>
          </header>
          <div className="flex-1 min-h-0 px-2 pb-1">
            <PerfilChart
              buckets={datos?.buckets ?? []}
              poc={datos?.poc?.px ?? null}
              val={datos?.val ?? null}
              vah={datos?.vah ?? null}
              dec={dec}
              ejeX={u.ejeX}
            />
          </div>
        </section>
    </div>
  );
}

// ── precio: lightweight-charts, el MISMO motor que el chart LIVE de PIVOTS ──
// (misma interacción para la mesa: arrastrar/zoom en X, escala Y automática)
function PrecioChart({
  serie,
  vwap,
}: {
  serie: { t: string; c: number }[];
  vwap: number | null;
}) {
  const contRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const vwapRef = useRef<IPriceLine | null>(null);
  const [ready, setReady] = useState(0);

  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const read = () => setIsLight(el.classList.contains("light"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const el = contRef.current;
    if (!el) return;
    const txt = isLight ? "#16203a" : "#8a8a8a";
    const grid = isLight ? "#eef2f7" : "#141414";
    const border = isLight ? "#aab6c9" : "#2a2a2a";
    const bg = isLight ? "#ffffff" : "#080808";

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: txt,
        fontSize: 10,
        fontFamily: "JetBrains Mono, monospace",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: grid, style: LineStyle.Dotted },
        horzLines: { color: grid, style: LineStyle.Dotted },
      },
      leftPriceScale: {
        visible: true,
        borderColor: border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      rightPriceScale: { visible: false },
      handleScale: { axisPressedMouseMove: { time: true, price: false } },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false, rightOffset: 2 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: {
        priceFormatter: (v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 2 }),
      },
    });
    const s = chart.addSeries(AreaSeries, {
      priceScaleId: "left",
      lineColor: "#ff9900",
      lineWidth: 2,
      topColor: "rgba(255, 153, 0, 0.28)",
      bottomColor: "rgba(255, 153, 0, 0.02)",
      priceLineVisible: false,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = s;
    setReady((n) => n + 1);
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      vwapRef.current = null;
    };
  }, [isLight]);

  useEffect(() => {
    const s = seriesRef.current;
    const chart = chartRef.current;
    if (!s || !chart) return;
    // ts naive ART → epoch como si fuera UTC: el chart rendea la MISMA hora de
    // pared argentina en cualquier browser (misma convención que el chart LIVE).
    const data: { time: Time; value: number }[] = [];
    let prev = 0;
    for (const d of serie) {
      if (!d?.t || !Number.isFinite(d.c)) continue;
      const secs = Math.floor(Date.parse(d.t.endsWith("Z") ? d.t : `${d.t}Z`) / 1000);
      if (!Number.isFinite(secs) || secs <= prev) continue;
      prev = secs;
      data.push({ time: secs as Time, value: d.c });
    }
    s.setData(data);
    if (data.length) chart.timeScale().fitContent();
  }, [serie, ready]);

  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    if (vwapRef.current) {
      s.removePriceLine(vwapRef.current);
      vwapRef.current = null;
    }
    if (vwap != null && Number.isFinite(vwap)) {
      vwapRef.current = s.createPriceLine({
        price: vwap,
        color: "#8a8a8a",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "VWAP",
      });
    }
  }, [vwap, ready]);

  return <div ref={contRef} className="absolute inset-0" />;
}

// ── volumen por precio: eje X = PRECIO, eje Y = nominales ────────────────────
// Una sola barra por bucket (sin partir por lado: el lado no se muestra). El
// POC se pinta con el acento y el resto apagado — no hace falta leyenda porque
// hay una sola serie, y el título del panel ya la nombra.
function PerfilChart({
  buckets,
  poc,
  val,
  vah,
  dec,
  ejeX,
}: {
  buckets: { px_lo: number; px_hi: number; vol: number; trades: number }[];
  poc: number | null;
  val: number | null;
  vah: number | null;
  dec: number;
  ejeX: string;
}) {
  const rows = useMemo(
    () =>
      buckets.map((b) => ({
        px: (b.px_lo + b.px_hi) / 2,
        etiqueta: b.px_lo.toLocaleString("es-AR", {
          minimumFractionDigits: dec,
          maximumFractionDigits: dec,
        }),
        vol: b.vol,
        trades: b.trades,
        lo: b.px_lo,
        hi: b.px_hi,
      })),
    [buckets, dec],
  );
  if (!rows.length) return null;

  // El POC se marca por índice de bucket y no por precio: la banda de precios es
  // un eje CATEGÓRICO (un bucket = una categoría), así que una línea "en 11.512"
  // no tendría dónde caer.
  const iPoc = poc == null ? -1 : rows.findIndex((r) => poc >= r.lo && poc <= r.hi);
  const iVal = val == null ? -1 : rows.findIndex((r) => val >= r.lo && val <= r.hi);
  const iVah = vah == null ? -1 : rows.findIndex((r) => vah >= r.lo && vah <= r.hi);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 14, right: 12, left: 4, bottom: 14 }}>
        <CartesianGrid stroke="var(--t-border)" strokeDasharray="2 3" vertical={false} />
        <XAxis
          dataKey="etiqueta"
          tick={{ fontSize: 9, fill: "var(--t-text-muted)", fontFamily: "monospace" }}
          interval={Math.max(0, Math.floor(rows.length / 9))}
          tickLine={false}
          axisLine={{ stroke: "var(--t-border-2)" }}
          label={{
            value: ejeX,
            position: "insideBottom",
            offset: -10,
            style: { fontSize: 9, fill: "var(--t-text-muted)", letterSpacing: "0.08em" },
          }}
        />
        <YAxis
          tick={{ fontSize: 9, fill: "var(--t-text-muted)", fontFamily: "monospace" }}
          tickFormatter={(v: number) =>
            v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : `${v}`
          }
          tickLine={false}
          axisLine={false}
          width={46}
        />
        <Tooltip
          cursor={{ fill: "var(--t-surface-2)" }}
          contentStyle={{
            background: "var(--t-panel)",
            border: "1px solid var(--t-border-2)",
            fontSize: 11,
            fontFamily: "monospace",
          }}
          labelStyle={{ color: "var(--t-text)" }}
          formatter={(v, _n, p) => {
            const n = typeof v === "number" ? v : Number(v ?? 0);
            const t = (p as { payload?: { trades?: number } })?.payload?.trades ?? 0;
            return [`${Math.round(n).toLocaleString("es-AR")}  (${t} trades)`, "nominales"];
          }}
          labelFormatter={(l) => `desde ${String(l ?? "")}`}
        />
        {iVal >= 0 && (
          <ReferenceLine
            x={rows[iVal].etiqueta}
            stroke="var(--t-text-muted)"
            strokeDasharray="4 4"
            label={{ value: "VAL", fontSize: 9, fill: "var(--t-text-muted)", position: "top" }}
          />
        )}
        {iVah >= 0 && (
          <ReferenceLine
            x={rows[iVah].etiqueta}
            stroke="var(--t-text-muted)"
            strokeDasharray="4 4"
            label={{ value: "VAH", fontSize: 9, fill: "var(--t-text-muted)", position: "top" }}
          />
        )}
        <Bar dataKey="vol" isAnimationActive={false}>
          {rows.map((r, i) => (
            <Cell
              key={r.etiqueta + i}
              fill={i === iPoc ? "var(--t-accent)" : "var(--t-brand)"}
              fillOpacity={i === iPoc ? 1 : 0.55}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── piezas chicas ───────────────────────────────────────────────────────────

function ClaseBtn({
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
      className={`px-2 py-1 text-[10px] font-semibold tracking-wider border ${
        active
          ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}

function CurvaBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`px-1.5 py-0.5 text-[9px] font-mono tracking-wide border ${
        active
          ? "bg-[var(--t-surface-2)] text-[var(--t-text)] border-[var(--t-accent)]"
          : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
      }`}
    >
      {children}
    </button>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-mono px-1.5 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-muted)] whitespace-nowrap">
      {children}
    </span>
  );
}

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[9px] font-mono tracking-wider uppercase text-[var(--t-text-muted)]">
        {label}
      </span>
      <span className="text-[11px] font-mono tabular-nums text-[var(--t-text-dim)]">
        {children}
      </span>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <span className="px-3 py-1.5 text-[11px] font-mono bg-[var(--t-panel)] border border-[var(--t-border-2)] text-[var(--t-text-dim)]">
        {children}
      </span>
    </div>
  );
}
