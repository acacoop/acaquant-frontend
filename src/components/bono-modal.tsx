"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BonoDetalle, PataBono } from "@/lib/types";
import { fmtFechaCorta } from "@/lib/fmt";

// Modal de FICHA DE BONO — se abre con click en una fila de la tab CURVAS.
//
// **Qué contesta que la tabla no puede.** La tabla da una fila: precio, TEA,
// duration. La pregunta que sigue siempre es la misma —*¿y cuándo paga?*— y ese
// dato no estaba en ninguna pantalla de mercado. Vivía dentro de
// `/api/titulos/flujos`, que devuelve los 222 bonos con su cronograma completo:
// 240 KB para mirar uno. Acá se pide UN bono a `/api/cotizaciones/bono/<ticker>`.
//
// **El front no deriva nada.** Los montos, la unidad del eje, la rama de cálculo
// y las tasas vienen resueltos del backend. En particular la UNIDAD (`por 100 VN`
// en USD, en pesos, o en pesos de emisión para un CER) la decide el servidor,
// porque depende de con qué fórmula se valúa el bono — y un monto por 100 VN sin
// unidad no se puede leer, o peor, se lee mal.
//
// **Layout: mitad y mitad, sin scroll de página.** Antes los cuatro bloques iban
// apilados a todo el ancho y la FICHA quedaba al pie: para leer la ficha había
// que scrollear, y al scrollear se perdía de vista el cronograma — o sea que las
// dos cosas que se comparan (qué bono es / cuándo paga) nunca estaban juntas en
// pantalla. Ahora las TASAS quedan arriba, a todo el ancho (es el titular), y
// abajo el cuerpo se parte 50/50: la FICHA ocupa toda la altura de la mitad
// izquierda en filas verticales label→valor, con el rótulo FICHA escrito en
// vertical sobre el lomo; a la derecha el gráfico arriba y el cronograma abajo.
// Cada mitad scrollea por dentro, así el modal entero no se mueve.

interface Props {
  ticker: string;             // el CORTO (AL30) — el mismo que muestra la tabla
  onClose: () => void;
}

const fmt2 = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? "--" : v.toLocaleString("es-AR", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });
const pct = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? "--" : `${(v * 100).toFixed(d)}%`;

/**
 * Dato INLINE: rótulo y valor en la MISMA línea, para tiras que se leen de
 * corrido. La versión apilada (rótulo arriba, valor abajo) cuesta el doble de
 * alto por dato, y en un modal el alto es lo único que no sobra: cada píxel que
 * se lleva la cabecera se lo saca al cronograma, que es el dato que se mira.
 */
function Dato({ label, valor, tip }: { label: string; valor: React.ReactNode; tip?: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 min-w-0" title={tip}>
      <span className="text-[9px] tracking-wide text-[var(--t-text-muted)] uppercase shrink-0">{label}</span>
      <span className="text-xs text-[var(--t-text-dim)] truncate">{valor}</span>
    </span>
  );
}

/** El rótulo de cada mitad del flujo: el cuadradito de color + qué es. */
function SubtituloFlujo({ color, texto }: { color: string; texto: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1 shrink-0">
      <span className="w-2 h-2 shrink-0" style={{ background: color }} />
      <span className="text-[9px] text-[var(--t-text-muted)] tracking-wide">{texto}</span>
    </div>
  );
}

/** El tooltip de los dos gráficos del flujo: uno solo, así no se despegan. */
const tooltipFlujo = (nombre: string) => ({
  contentStyle: {
    background: "var(--t-surface)",
    border: "1px solid var(--t-border-2)",
    fontSize: 11,
    fontFamily: "JetBrains Mono, monospace",
  },
  labelStyle: { color: "var(--t-text-dim)" },
  labelFormatter: (v: unknown) => fmtFechaCorta(String(v)),
  formatter: (v: unknown) => [fmt2(Number(v), 3), nombre] as [string, string],
});

/** Fila label → valor. Es la unidad de la FICHA: se lee de arriba hacia abajo. */
function Fila({ label, valor, tip }: { label: string; valor: React.ReactNode; tip?: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 px-2 py-1 border-b border-[var(--t-border)] last:border-b-0"
      title={tip}
    >
      <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] shrink-0">{label}</span>
      <span className="text-xs text-[var(--t-text-dim)] text-right truncate">{valor}</span>
    </div>
  );
}

export function BonoModal({ ticker, onClose }: Props) {
  const [data, setData] = useState<BonoDetalle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Por default el gráfico muestra lo que FALTA COBRAR, que es lo que se opera.
  // El histórico se puede prender: sirve para ver el perfil de amortización
  // completo de un bono que ya viene pagando.
  const [soloFuturos, setSoloFuturos] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(
          `/api/cotizaciones/bono/${encodeURIComponent(ticker)}`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as BonoDetalle;
        if (!cancelled) setData(j);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ticker]);

  // Esc cierra, igual que el resto de los modales de la app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const flujos = useMemo(
    () => (data?.flujos || []).filter((f) => !soloFuturos || f.futuro),
    [data?.flujos, soloFuturos],
  );

  // El gráfico apila amortización e interés: son cosas distintas para quien mira
  // (una devuelve capital, la otra no) y el total sigue siendo la altura de la
  // barra. Un único total escondería el perfil de amortización, que es justo lo
  // que distingue a un bullet de un amortizante con la misma duration.
  const chart = useMemo(
    () => flujos.map((f) => ({
      fecha: f.fecha,
      amortizacion: +f.amortizacion.toFixed(4),
      interes: +f.interes.toFixed(4),
      futuro: f.futuro,
    })),
    [flujos],
  );

  const ficha = data?.ficha;
  // La pata PRINCIPAL para el bloque de tasas: la del `ajuste` del bono. Un dual
  // tiene dos y las dos se muestran, cada una con su tasa y su procedencia.
  const patas: PataBono[] = data?.patas || [];

  // La FICHA, en filas verticales. Lo condicional (industria, ley, CER) entra o
  // no entra según el bono — una fila vacía en una lista vertical se lee como un
  // dato faltante, no como un campo que no aplica.
  const filasFicha: { label: string; valor: React.ReactNode; tip?: string }[] = ficha ? [
    { label: "Símbolo", valor: data?.instrumento || "--", tip: "El símbolo que se le manda a Primary" },
    { label: "Emisor", valor: ficha.emisor || "--" },
    { label: "Tipo emisor", valor: ficha.emisor_tipo || "--" },
    ...(ficha.industria ? [{ label: "Industria", valor: ficha.industria }] : []),
    { label: "Tipo", valor: ficha.tipo || "--" },
    { label: "Moneda", valor: ficha.moneda || "--" },
    {
      label: "Ajuste",
      valor: ficha.ajuste_alt ? `${ficha.ajuste} + ${ficha.ajuste_alt}` : ficha.ajuste || "--",
      tip: ficha.ajuste_alt ? "Bono DUAL: tiene dos patas de rendimiento" : undefined,
    },
    ...(ficha.ley
      ? [{ label: "Ley", valor: ficha.ley === "local" ? "Local (Bonar)" : "NY (Global)" }]
      : []),
    { label: "Emisión", valor: ficha.fecha_emision ? fmtFechaCorta(ficha.fecha_emision) : "--" },
    { label: "Vencimiento", valor: ficha.fecha_vencimiento ? fmtFechaCorta(ficha.fecha_vencimiento) : "--" },
    { label: "Valor nominal", valor: fmt2(ficha.valor_nominal, 0) },
    { label: "Cupón anual", valor: ficha.cupon_anual == null ? "--" : fmt2(ficha.cupon_anual, 4) },
    ...(ficha.cer_emision != null
      ? [{ label: "CER emisión", valor: fmt2(ficha.cer_emision, 4) }]
      : []),
    ...(ficha.flujo_vencimiento != null
      ? [{
          label: "Pago final",
          valor: fmt2(ficha.flujo_vencimiento, 2),
          tip: "Pago al vencimiento por 100 VN (bullet)",
        }]
      : []),
    ...(ficha.cer_fijado
      ? [{
          label: "CER",
          valor: "FIJADO",
          tip: "Su CER de liquidación ya está publicado: se comporta como tasa fija.",
        }]
      : []),
  ] : [];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[var(--t-panel)]/70 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] w-full max-w-6xl h-[88vh] max-h-[88vh] flex flex-col"
      >
        {/* ── cabecera ── */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--t-border-2)] shrink-0">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="text-[var(--t-accent)] font-semibold tracking-wide">{ticker}</span>
            {ficha?.emisor && (
              <span className="text-[10px] text-[var(--t-text-dim)] truncate">{ficha.emisor}</span>
            )}
            {ficha?.fecha_vencimiento && (
              <span className="text-[10px] text-[var(--t-text-muted)]">
                VTO {fmtFechaCorta(ficha.fecha_vencimiento)}
              </span>
            )}
            {/* La RAMA es con qué fórmula el motor valúa este bono. Se muestra
                porque es cómo se descubre, desde la pantalla, que un bono quedó
                mal clasificado — hasta ahora había que abrir el motor. */}
            {data?.rama && (
              <span
                className="text-[9px] text-[var(--t-text-muted)] border border-[var(--t-border-2)] px-1"
                title="Rama de cálculo del motor: la fórmula con la que se valúa este bono y con la que se arma este cronograma."
              >
                {data.rama.toUpperCase()}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[var(--t-text-dim)] hover:text-[var(--t-accent)] text-sm px-2 shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden p-3 flex flex-col gap-3">
          {loading ? (
            <p className="text-[var(--t-text-muted)] text-xs text-center py-8">cargando…</p>
          ) : error ? (
            <p className="text-[var(--t-neg)] text-xs text-center py-8">error: {error}</p>
          ) : data?.error ? (
            <p className="text-[var(--t-text-muted)] text-xs text-center py-8">{data.error}</p>
          ) : (
            <>
              {/* ── TASAS Y RIESGO ── una fila por pata. Un dual tiene DOS y
                  rinden distinto de verdad; mostrar una sola es el bug que la
                  tabla ya resolvió, no se reintroduce acá. */}
              {patas.map((p) => (
                <div
                  key={`${p.pill}-${p.pata}`}
                  className="shrink-0 border border-[var(--t-border-2)] px-2 py-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1"
                >
                  <span className="text-[10px] tracking-wide text-[var(--t-accent)] shrink-0">
                    {p.pill.replace(/_/g, " ").toUpperCase()}
                  </span>
                  <span className="text-[9px] text-[var(--t-text-muted)] shrink-0">{p.lado}</span>
                  {/* De dónde salió la tasa. `null` = del motor, live. */}
                  <span
                    className="text-[9px] text-[var(--t-text-muted)] shrink-0"
                    title={
                      p.tea_fuente === "1816"
                        ? "Tasa de 1816 (actualiza cada 30 min). Esta pata todavía no la calcula el motor, así que no es live."
                        : "Tasa del motor: Primary, live."
                    }
                  >
                    {p.tea_fuente === "1816"
                      ? `1816${p.tea_fecha ? ` · ${fmtFechaCorta(p.tea_fecha)}` : ""}`
                      : "LIVE"}
                  </span>
                  {p.tasa_ruido && (
                    <span
                      className="text-[9px] text-[var(--t-text-muted)] opacity-70 shrink-0"
                      title="Vence en pocos días: anualizar ese plazo infla la tasa. No es comparable con el resto de la curva."
                    >
                      TASA RUIDO
                    </span>
                  )}
                  <span className="w-px self-stretch bg-[var(--t-border-2)]" />
                  <Dato label="Last" valor={fmt2(p.metrics?.last_price)} />
                  <Dato label="TEA" valor={pct(p.metrics?.TEA)} />
                  <Dato
                    label="TNA"
                    valor={
                      p.metrics?.TNA !== undefined
                        ? pct(p.metrics.TNA, 1)
                        : p.metrics?.TEA !== undefined
                          ? `${((Math.pow(1 + p.metrics.TEA, 1 / 12) - 1) * 12 * 100).toFixed(1)}%`
                          : "--"
                    }
                    tip="Si el proveedor la publica, gana la suya; si no, se deriva de la TEA como en la tabla (TEM × 12)."
                  />
                  <Dato label="TEM" valor={pct(p.metrics?.TEM)} />
                  <Dato label="Duration" valor={fmt2(p.metrics?.duration)} />
                  <Dato label="Mod dur" valor={fmt2(p.metrics?.mod_duration)} />
                  <Dato label="Convexity" valor={fmt2(p.metrics?.convexity)} />
                  <Dato label="Paridad" valor={fmt2(p.metrics?.paridad)} />
                  {p.margen != null && (
                    <Dato
                      label="Margen s/TAMAR"
                      valor={pct(p.margen)}
                      tip="Cuánto paga este bono por encima de la tasa de referencia del BCRA. Fuente 1816."
                    />
                  )}
                  {p.tc_breakeven != null && (
                    <Dato
                      label="TC BE"
                      valor={Math.round(p.tc_breakeven).toLocaleString("es-AR")}
                      tip="TC al que este bono empata contra comprar MEP hoy y esperar al vencimiento."
                    />
                  )}
                  <Dato label="Vol nom" valor={fmt2(p.metrics?.total_nominals, 0)} />
                </div>
              ))}

              {/* ── EL CUERPO, mitad y mitad ── izquierda la FICHA a todo lo
                  alto; derecha el gráfico arriba y el cronograma abajo. En
                  pantallas chicas se apila y scrollea el modal, como antes. */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,37fr)_minmax(0,63fr)] lg:grid-rows-[minmax(0,1fr)] gap-3 lg:flex-1 lg:min-h-0">

              {/* ── FICHA ── el lomo con el rótulo en vertical y las filas
                  label→valor. Ocupa toda la altura de su mitad. */}
              {ficha && (
                <div className="flex min-h-0 border border-[var(--t-border-2)] order-2 lg:order-1">
                  <div className="shrink-0 flex items-start justify-center px-1.5 pt-2 border-r border-[var(--t-border-2)] bg-[var(--t-surface)]">
                    <span
                      className="text-[10px] tracking-[0.35em] text-[var(--t-accent)]"
                      style={{ writingMode: "vertical-rl" }}
                    >
                      FICHA
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">
                    {filasFicha.map((f) => (
                      <Fila key={f.label} label={f.label} valor={f.valor} tip={f.tip} />
                    ))}
                  </div>
                </div>
              )}

              {/* ── la mitad derecha: gráfico arriba, cronograma abajo ── */}
              <div className="flex flex-col gap-3 min-h-0 order-1 lg:order-2">

              {/* ── FLUJO DE FONDOS ── */}
              <div className="border border-[var(--t-border-2)] p-2 flex flex-col min-h-0 lg:flex-1">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap shrink-0">
                  <span className="text-[10px] tracking-wide text-[var(--t-accent)]">
                    FLUJO DE FONDOS
                  </span>
                  <span className="text-[9px] text-[var(--t-text-muted)]">
                    {data?.unidad_flujo}
                  </span>
                  <button
                    onClick={() => setSoloFuturos((v) => !v)}
                    className={`ml-auto px-2 py-0.5 text-[10px] font-semibold tracking-wide border transition-colors ${
                      soloFuturos
                        ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                        : "bg-transparent text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]"
                    }`}
                    title="Mostrar solo los pagos que faltan cobrar, o el cronograma completo desde la emisión"
                  >
                    SOLO FUTUROS
                  </button>
                </div>

                {/* La NOTA no es decorativa: en un CER los montos son
                    contractuales y lo que se cobra es cada uno por
                    CER(liq)/CER(emisión). Sin decirlo, el gráfico se lee como si
                    el bono pagara la mitad de lo que paga. */}
                {data?.nota_flujo && (
                  <p className="text-[9px] text-[var(--t-text-muted)] mb-2 leading-snug">
                    {data.nota_flujo}
                  </p>
                )}

                {chart.length === 0 ? (
                  <p className="text-[var(--t-text-muted)] text-xs text-center py-6">
                    {soloFuturos
                      ? "No quedan pagos futuros cargados para este bono."
                      : "Sin cronograma cargado para este bono."}
                  </p>
                ) : (
                  /* DOS paneles con el MISMO eje de fechas y cada uno su propia
                     escala — el mismo criterio que SIMULAR INVERSIÓN. Apilado en
                     una sola escala, en un bullet la amortización (100) aplasta
                     al cupón (0,50) y la renta se dibuja pegada al cero: parece
                     que el bono no paga nada hasta el vencimiento. El doble eje
                     Y no es la salida (misma unidad en dos escalas: el ojo
                     compara alturas que no son comparables). */
                  <div className="flex-1 min-h-0 flex flex-col gap-1">
                    <SubtituloFlujo color="var(--t-accent)" texto="CAPITAL — amortización" />
                    <div className="flex-1 min-h-[70px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chart} margin={{ top: 4, right: 12, bottom: 0, left: 4 }} syncId="flujo-bono">
                          <XAxis dataKey="fecha" tick={false} axisLine={{ stroke: "var(--t-border-2)" }} tickLine={false} height={4} />
                          <YAxis
                            tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                            axisLine={{ stroke: "var(--t-border-2)" }}
                            tickLine={false}
                            width={52}
                            tickFormatter={(v: number) => v.toFixed(0)}
                          />
                          <Tooltip {...tooltipFlujo("Amortización")} />
                          <Bar dataKey="amortizacion" isAnimationActive={false}>
                            {chart.map((c, i) => (
                              <Cell key={i} fill={c.futuro ? "var(--t-accent)" : "#5a6470"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <SubtituloFlujo color="#33ccaa" texto="RENTA — interés (en su propia escala)" />
                    <div className="flex-1 min-h-[80px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chart} margin={{ top: 4, right: 12, bottom: 24, left: 4 }} syncId="flujo-bono">
                          <XAxis
                            dataKey="fecha"
                            tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                            axisLine={{ stroke: "var(--t-border-2)" }}
                            tickLine={false}
                            angle={-35}
                            textAnchor="end"
                            height={40}
                            tickFormatter={fmtFechaCorta}
                            interval={Math.max(0, Math.floor(chart.length / 10))}
                          />
                          <YAxis
                            tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                            axisLine={{ stroke: "var(--t-border-2)" }}
                            tickLine={false}
                            width={52}
                            tickFormatter={(v: number) => fmt2(v, v >= 10 ? 0 : 2)}
                          />
                          <Tooltip {...tooltipFlujo("Interés")} />
                          <Bar dataKey="interes" isAnimationActive={false}>
                            {chart.map((c, i) => (
                              <Cell key={i} fill={c.futuro ? "#33ccaa" : "#3e4650"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {data?.resumen && (
                  <div className="shrink-0 flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-1.5 pt-1.5 border-t border-[var(--t-border-2)]">
                    <Dato label="Pagos futuros" valor={data.resumen.n_pagos_futuros} />
                    <Dato
                      label="Próximo pago"
                      valor={
                        data.resumen.proximo_pago
                          ? `${fmtFechaCorta(data.resumen.proximo_pago.fecha)} · ${fmt2(data.resumen.proximo_pago.monto, 3)}`
                          : "--"
                      }
                    />
                    <Dato
                      label="Último pago"
                      valor={
                        data.resumen.ultimo_pago
                          ? fmtFechaCorta(data.resumen.ultimo_pago.fecha)
                          : "--"
                      }
                    />
                    <Dato
                      label="Total a cobrar"
                      valor={fmt2(data.resumen.total_futuro, 2)}
                      tip="Suma nominal de los pagos que faltan, sin descontar. No es el valor presente."
                    />
                  </div>
                )}
              </div>

              {/* ── CRONOGRAMA ── el dato duro que respalda el gráfico ── */}
              {flujos.length > 0 && (
                <div className="border border-[var(--t-border-2)] p-2 flex flex-col min-h-0 lg:flex-1">
                  <div className="shrink-0 text-[10px] tracking-wide text-[var(--t-accent)] mb-2">
                    CRONOGRAMA
                    <span className="ml-2 text-[var(--t-text-muted)]">{flujos.length}</span>
                  </div>
                  <div className="max-h-[240px] lg:max-h-none lg:flex-1 lg:min-h-0 overflow-y-auto">
                    <table className="w-full">
                      <thead>
                        <tr>
                          <th className="!px-1 text-left">Fecha</th>
                          <th className="!px-1 text-right">Amortización</th>
                          <th className="!px-1 text-right">Interés</th>
                          <th className="!px-1 text-right">Total</th>
                          <th className="!px-1 text-right" title="Nominal que quedaba vivo antes de este pago">
                            Residual
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {flujos.map((f) => (
                          <tr key={f.fecha} className={f.futuro ? "" : "opacity-45"}>
                            <td className="!px-1 text-left">{fmtFechaCorta(f.fecha)}</td>
                            <td className="!px-1 text-right">{fmt2(f.amortizacion, 3)}</td>
                            <td className="!px-1 text-right">{fmt2(f.interes, 3)}</td>
                            <td className="!px-1 text-right font-medium">{fmt2(f.monto, 3)}</td>
                            <td className="!px-1 text-right">
                              {f.residual_previo_pct == null ? "--" : fmt2(f.residual_previo_pct, 2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              </div>{/* /mitad derecha */}
              </div>{/* /grilla 50-50 */}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
