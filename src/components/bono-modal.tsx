"use client";

import { useEffect, useMemo, useState } from "react";
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
// **Layout: texto a la izquierda, el gráfico a la derecha, sin scroll de página.**
// Las TASAS van arriba a todo el ancho (es el titular) y abajo el cuerpo se
// parte en dos columnas: a la izquierda la FICHA (filas label→valor, con el
// rótulo FICHA en vertical sobre el lomo) y DEBAJO el CRONOGRAMA; a la derecha,
// a toda la altura, UN gráfico del flujo.
//
// El criterio es agrupar por CÓMO se lee, no por qué bloque es. Ficha y
// cronograma son texto y contestan lo mismo —qué bono es, qué paga— así que
// comparten columna: la ficha tiene un alto fijo por su cantidad de campos y lo
// que sobra se lo lleva la tabla. Antes la ficha ocupaba sola toda la columna
// izquierda (media columna vacía en cualquier bono) y el cronograma se repartía
// la derecha con el gráfico: las barras quedaban aplastadas contra la tabla, y
// la tabla estirada. Cada columna scrollea por dentro; el modal no se mueve.
//
// **El gráfico: un cronograma, dos escalas, dos FORMAS.** Capital y renta se
// llevan mal en un mismo eje (en un bullet, 100 contra 1,89) y por eso hubo dos
// paneles apilados un rato: partían en dos algo que es un solo cronograma. La
// salida es un gráfico con dos ejes, pero con cada serie dibujada DISTINTO —el
// capital en barras finas contra el eje izquierdo, la renta como línea de puntos
// con el número escrito encima contra el derecho—, que es lo que desarma la
// trampa del doble eje: nadie compara la altura de una línea contra la de una
// barra, y el cupón se lee por su número, no midiéndolo contra su escala.

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

  const ficha = data?.ficha;
  // La pata PRINCIPAL para el bloque de tasas: la del `ajuste` del bono. Un dual
  // tiene dos y las dos se muestran, cada una con su tasa y su procedencia.
  const patas: PataBono[] = data?.patas || [];

  // La FICHA, en filas verticales. Lo condicional (industria, ley, CER) entra o
  // no entra según el bono — una fila vacía en una lista vertical se lee como un
  // dato faltante, no como un campo que no aplica.
  // Sin SÍMBOLO (el ticker ya está en el título; el símbolo de mercado es un
  // dato de Primary, no de la mesa), sin TIPO EMISOR (repetía a TIPO y al
  // filtro de la tabla), sin AJUSTE ni CUPÓN ANUAL (pedido del user 2026-09-10:
  // el alto que se libera se lo lleva el CRONOGRAMA). Las patas del dual ya se
  // muestran en la tira de tasas de arriba.
  const filasFicha: { label: string; valor: React.ReactNode; tip?: string }[] = ficha ? [
    { label: "Emisor", valor: ficha.emisor || "--" },
    ...(ficha.industria ? [{ label: "Industria", valor: ficha.industria }] : []),
    { label: "Moneda", valor: ficha.moneda || "--" },
    ...(ficha.ley
      ? [{ label: "Ley", valor: ficha.ley === "local" ? "Local (Bonar)" : "NY (Global)" }]
      : []),
    { label: "Emisión", valor: ficha.fecha_emision ? fmtFechaCorta(ficha.fecha_emision) : "--" },
    { label: "Vencimiento", valor: ficha.fecha_vencimiento ? fmtFechaCorta(ficha.fecha_vencimiento) : "--" },
    { label: "Valor nominal", valor: fmt2(ficha.valor_nominal, 0) },
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
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] w-full max-w-6xl max-h-[88vh] flex flex-col"
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

        {/* El modal mide lo que su CONTENIDO mide (pedido del user 2026-09-10:
            una Lecap con un solo pago dejaba media pantalla negra) y recién a
            partir del 88 % del alto se achica y scrollea el cronograma. Por eso
            el cuerpo y la grilla llevan `flex-[0_1_auto]` (base = contenido,
            pueden ACHICARSE, no se estiran) y no `flex-1`: con base 0 dentro de
            un contenedor de alto automático, el cuerpo mediría cero. */}
        <div className="flex-[0_1_auto] min-h-0 overflow-y-auto lg:overflow-hidden p-3 flex flex-col gap-3">
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

              {/* ── EL CUERPO ── a la izquierda la FICHA (texto, alto natural);
                  a la derecha, a toda la altura, el CRONOGRAMA con lo que se
                  va cobrando. El gráfico del flujo se sacó el 2026-09-10
                  (paso 27): dos escalas en un dibujo no se leían y una sola
                  aplastaba los cupones; la tabla con ACUMULADO dice lo mismo
                  sin ambigüedad. */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,34fr)_minmax(0,66fr)] lg:grid-rows-[minmax(0,1fr)] gap-3 lg:flex-[0_1_auto] lg:min-h-0">

              {/* ── COLUMNA IZQUIERDA: la ficha ── */}
              <div className="flex flex-col gap-3 min-h-0 order-2 lg:order-1">
                {ficha && (
                  <div className="flex shrink-0 min-h-0 border border-[var(--t-border-2)]">
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
              </div>{/* /columna izquierda */}

              {/* ── COLUMNA DERECHA: CRONOGRAMA a toda la altura ── */}
              <div className="border border-[var(--t-border-2)] p-2 flex flex-col min-h-0 order-1 lg:order-2">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap shrink-0">
                  <span className="text-[10px] tracking-wide text-[var(--t-accent)]">
                    CRONOGRAMA
                    <span className="ml-2 text-[var(--t-text-muted)]">{flujos.length}</span>
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
                    CER(liq)/CER(emisión). Sin decirlo, la tabla se lee como si
                    el bono pagara la mitad de lo que paga. */}
                {data?.nota_flujo && (
                  <p className="text-[9px] text-[var(--t-text-muted)] mb-2 leading-snug">
                    {data.nota_flujo}
                  </p>
                )}

                {flujos.length === 0 ? (
                  <p className="text-[var(--t-text-muted)] text-xs text-center py-6">
                    {soloFuturos
                      ? "No quedan pagos futuros cargados para este bono."
                      : "Sin cronograma cargado para este bono."}
                  </p>
                ) : (
                  <div className="flex-[1_1_auto] min-h-0 overflow-y-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 bg-[var(--t-surface)]">
                        <tr>
                          <th className="!px-1 text-left">Fecha</th>
                          <th className="!px-1 text-right">Amortización</th>
                          <th className="!px-1 text-right">Interés</th>
                          <th className="!px-1 text-right">Total</th>
                          <th className="!px-1 text-right" title="Lo cobrado hasta este pago inclusive, sumando solo los pagos futuros">
                            Acumulado
                          </th>
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
                            <td className="!px-1 text-right text-[var(--t-accent)] font-medium">
                              {f.acumulado == null ? "--" : fmt2(f.acumulado, 2)}
                            </td>
                            <td className="!px-1 text-right">
                              {f.residual_previo_pct == null ? "--" : fmt2(f.residual_previo_pct, 2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
              </div>{/* /columna derecha */}

              </div>{/* /grilla ficha | cronograma */}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
