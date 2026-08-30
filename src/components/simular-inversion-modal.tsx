"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BonoCurva, SimulacionInversion } from "@/lib/types";
import { fmtFechaCorta } from "@/lib/fmt";
import { NumeroInput } from "@/components/numero-input";

// Modal SIMULAR INVERSIÓN — se abre desde la barra de tabs de /renta-fija.
//
// Tres inputs: BONO (el universo es el MISMO de la tab CURVAS — los tickers del
// payload de curvas-vista), IMPORTE y PRECIO. El precio arranca en el LAST del
// snapshot (viene del backend como `precio_referencia`) y es editable: al
// cambiarlo, la TEA/TIR y todo el cuadro se recalculan EN EL BACKEND con el
// mismo motor que produce la tasa de la tabla (`calcular_campos` con el precio
// inyectado). El front no deriva un solo número — si acá hubiera otra fórmula,
// el día que difieran el modal y la tabla mostrarían dos tasas para el mismo
// bono y nadie se enteraría.
//
// Layout: izquierda = los datos del bono (ficha + tasas al precio simulado),
// derecha = el mapa del flujo de fondos (cuánto entra y cuándo), escalado al
// importe. Deuda asumida: el fetch es un GET con debounce de 400 ms — cada
// tecleo NO pega al backend.

interface Props {
  bonos: BonoCurva[];         // el payload de curvas-vista (la tab CURVAS)
  onClose: () => void;
}

const DEBOUNCE_MS = 400;

const fmt2 = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? "--" : v.toLocaleString("es-AR", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });
const pct = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? "--" : `${(v * 100).toFixed(d)}%`;

// Crudo del NumeroInput ("1234567,89") → número. NaN/<=0 → null.
const num = (raw: string): number | null => {
  const v = parseFloat(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
};

// Los avisos del backend, en castellano. Uno desconocido se muestra tal cual:
// taparlo sería esconder justo lo que el service quiso decir.
const WARNINGS: Record<string, string> = {
  mep_faltante: "Sin MEP live: no se puede convertir entre la moneda del precio y la de los flujos.",
  a3500_faltante: "Sin A3500 live: el motor no puede valuar este dólar-linked ahora.",
  motor_no_calculo: "El motor no pudo calcular tasas con este precio (los flujos igual se muestran).",
  cer_proyectado_constante:
    "CER: los pagos sin CER de liquidación publicado se proyectan con el último CER constante (sin proyección de inflación).",
  cer_sin_serie: "Sin serie CER cargada: no se pudieron ajustar los flujos.",
};

function Dato({ label, valor, tip }: { label: string; valor: React.ReactNode; tip?: string }) {
  return (
    <div className="min-w-0" title={tip}>
      <div className="text-[9px] tracking-wide text-[var(--t-text-muted)] uppercase">{label}</div>
      <div className="text-xs text-[var(--t-text-dim)] truncate">{valor}</div>
    </div>
  );
}

export function SimularInversionModal({ bonos, onClose }: Props) {
  // ── el universo del selector: los tickers de la tab CURVAS, DEDUPE por
  // ticker_corto (un dual llega repetido, una fila por pata) y agrupado por
  // lado. Los sin precio live entran igual — se puede simular tipeando uno.
  const universo = useMemo(() => {
    const vistos = new Set<string>();
    const out: BonoCurva[] = [];
    for (const b of bonos) {
      if (!b.ticker_corto || vistos.has(b.ticker_corto)) continue;
      vistos.add(b.ticker_corto);
      out.push(b);
    }
    out.sort((a, c) =>
      a.lado === c.lado
        ? String(a.vencimiento || "9999").localeCompare(String(c.vencimiento || "9999"))
        : a.lado === "ARS" ? -1 : 1);
    return out;
  }, [bonos]);

  const [ticker, setTicker] = useState<string>("");
  const [importe, setImporte] = useState<string>("1000000");
  const [precio, setPrecio] = useState<string>("");
  const [data, setData] = useState<SimulacionInversion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Al elegir bono el precio se resetea y el PRIMER response lo precarga con el
  // last (la "referencia"). Después de eso el precio es del usuario y no se pisa.
  const precargar = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const elegirBono = (tk: string) => {
    setTicker(tk);
    setPrecio("");
    setData(null);
    setError(null);
    precargar.current = true;
  };

  // ── EL fetch: uno solo, con debounce, cancelable. Sin precio manda solo
  // ticker+importe y el backend usa el last (que además devuelve como
  // referencia para precargar el input).
  // Borrar el importe limpia el cuadro desde el HANDLER (no acá adentro:
  // setState sincrónico en un effect dispara renders en cascada — regla del lint).
  const cambiarImporte = (raw: string) => {
    setImporte(raw);
    if (!num(raw)) setData(null);
  };

  useEffect(() => {
    if (!ticker) return;
    const imp = num(importe);
    if (!imp) return;
    const px = num(precio);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        setCargando(true);
        setError(null);
        const qs = new URLSearchParams({ ticker, importe: String(imp) });
        if (px) qs.set("precio", String(px));
        const r = await fetch(`/api/analitica/simular-inversion?${qs}`, {
          cache: "no-store", signal: ctl.signal,
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as SimulacionInversion;
        if (ctl.signal.aborted) return;
        setData(j);
        if (precargar.current && !j.error && j.precio_referencia) {
          // ',' decimal: el contrato del NumeroInput es el crudo es-AR.
          setPrecio(String(j.precio_referencia).replace(".", ","));
          precargar.current = false;
        }
      } catch (e) {
        if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : "error");
      } finally {
        if (!ctl.signal.aborted) setCargando(false);
      }
    }, DEBOUNCE_MS);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [ticker, importe, precio]);

  const sim = data && !data.error ? data.simulacion : null;
  const ficha = data && !data.error ? data.ficha : null;

  const chart = useMemo(
    () => (sim?.flujos || []).map((f) => ({
      fecha: f.fecha,
      amortizacion: +f.amortizacion.toFixed(2),
      interes: +f.interes.toFixed(2),
    })),
    [sim?.flujos],
  );

  const inputCls =
    "w-28 bg-transparent border border-[var(--t-border-2)] px-2 py-1 text-xs text-right " +
    "text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[var(--t-panel)]/70 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border-2)] w-full max-w-6xl max-h-[90vh] flex flex-col"
      >
        {/* ── cabecera: título + los TRES inputs ── */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border-2)] shrink-0 flex-wrap">
          <span className="text-[var(--t-accent)] font-semibold tracking-wide">
            SIMULAR INVERSIÓN
          </span>

          <label className="flex items-center gap-1.5 text-[10px] text-[var(--t-text-muted)]">
            BONO
            <select
              value={ticker}
              onChange={(e) => elegirBono(e.target.value)}
              className="bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-1 text-xs text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none"
            >
              <option value="">— elegir —</option>
              {(["ARS", "USD"] as const).map((lado) => (
                <optgroup key={lado} label={lado}>
                  {universo.filter((b) => b.lado === lado).map((b) => (
                    <option key={b.ticker_corto} value={b.ticker_corto}>
                      {b.ticker_corto}
                      {b.vencimiento ? ` · ${fmtFechaCorta(b.vencimiento)}` : ""}
                      {b.metrics?.last_price ? "" : " · sin precio"}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-[10px] text-[var(--t-text-muted)]">
            IMPORTE
            <NumeroInput value={importe} onChange={cambiarImporte} className={inputCls} placeholder="1.000.000" />
            {data?.moneda_precio && (
              <span className="text-[9px]" title="La moneda en que cotiza la pata elegida — el importe se asume en esa moneda.">
                {data?.moneda_precio}
              </span>
            )}
          </label>

          <label className="flex items-center gap-1.5 text-[10px] text-[var(--t-text-muted)]">
            PRECIO
            <NumeroInput value={precio} onChange={setPrecio} className={inputCls} placeholder="last" />
          </label>
          {/* La REFERENCIA: el last vive al lado del input para que se vea
              cuánto se está pisando — y un click lo devuelve. */}
          {data?.precio_referencia != null && (
            <button
              onClick={() => setPrecio(String(data.precio_referencia).replace(".", ","))}
              className="text-[9px] text-[var(--t-text-muted)] hover:text-[var(--t-accent)] border border-[var(--t-border-2)] px-1.5 py-0.5"
              title="Último precio operado (snapshot live). Click para volver al last."
            >
              LAST {fmt2(data.precio_referencia)}
            </button>
          )}
          {data?.rama && !data.error && (
            <span
              className="text-[9px] text-[var(--t-text-muted)] border border-[var(--t-border-2)] px-1"
              title="Rama de cálculo del motor: la fórmula con la que se valúa este bono."
            >
              {data.rama.toUpperCase()}
            </span>
          )}
          {cargando && <span className="text-[9px] text-[var(--t-text-muted)]">calculando…</span>}

          <button
            onClick={onClose}
            className="ml-auto text-[var(--t-text-dim)] hover:text-[var(--t-accent)] text-sm px-2 shrink-0"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {!ticker ? (
            <p className="text-[var(--t-text-muted)] text-xs text-center py-10">
              Elegí un bono para simular. El universo es el mismo de la tab CURVAS.
            </p>
          ) : error ? (
            <p className="text-[var(--t-neg)] text-xs text-center py-10">error: {error}</p>
          ) : data?.error ? (
            <p className="text-[var(--t-text-muted)] text-xs text-center py-10">{data.error}</p>
          ) : !sim || !ficha ? (
            <p className="text-[var(--t-text-muted)] text-xs text-center py-10">
              {num(importe) ? "cargando…" : "Ingresá un importe para simular."}
            </p>
          ) : (
            <>
              {/* Los avisos del backend, arriba de todo: un número calculado con
                  CER proyectado o sin MEP no se puede leer igual que uno firme. */}
              {(data?.warnings ?? []).length > 0 && (
                <div className="mb-2 space-y-0.5">
                  {(data?.warnings ?? []).map((w) => (
                    <p key={w} className="text-[9px] text-[var(--t-text-muted)] leading-snug">
                      ⚠ {WARNINGS[w] ?? w}
                    </p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {/* ══ IZQUIERDA: los datos del bono ══ */}
                <div className="flex flex-col gap-3 min-w-0">
                  {/* resultado al precio simulado */}
                  <div className="border border-[var(--t-accent)]/40 p-2">
                    <div className="text-[10px] tracking-wide text-[var(--t-accent)] mb-2">
                      RESULTADO AL PRECIO {fmt2(sim.precio)}
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-3 gap-y-2">
                      <Dato label="TIR / TEA" valor={<span className="text-[var(--t-accent)] font-semibold">{pct(sim.metrics.TEA)}</span>}
                        tip="Tasa efectiva anual al precio simulado — el mismo motor que calcula la de la tabla." />
                      <Dato label="TNA" valor={pct(sim.metrics.TNA, 1)} />
                      <Dato label="TEM" valor={pct(sim.metrics.TEM)} />
                      <Dato label="Duration" valor={fmt2(sim.metrics.duration)} />
                      <Dato label="Mod dur" valor={fmt2(sim.metrics.mod_duration)} />
                      <Dato label="Paridad" valor={fmt2(sim.metrics.paridad)} />
                      <Dato label="Días al vto" valor={sim.dias_al_vto ?? "--"} />
                      <Dato label="Rend. al vto" valor={pct(sim.rendimiento_al_vto)}
                        tip="La TEA llevada al plazo del bono: (1+TEA)^(días/365) − 1." />
                    </div>
                  </div>

                  {/* la compra */}
                  <div className="border border-[var(--t-border-2)] p-2">
                    <div className="text-[10px] tracking-wide text-[var(--t-accent)] mb-2">LA COMPRA</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
                      <Dato label={`Importe (${data?.moneda_precio ?? "--"})`} valor={fmt2(sim.importe, 0)} />
                      <Dato label="Nominales (VN)" valor={fmt2(sim.vn_nominal, 0)}
                        tip="importe × 100 / precio — cuántos nominales compra este importe." />
                      <Dato label={`Total a cobrar (${data?.moneda_flujo ?? "--"})`}
                        valor={<span className="font-semibold text-[var(--t-text)]">{fmt2(sim.total_a_cobrar, 0)}</span>}
                        tip="Suma nominal de todos los pagos futuros, sin descontar. No es valor presente." />
                      {sim.importe_en_moneda_flujo != null
                        && data?.moneda_precio !== data?.moneda_flujo && (
                        <Dato label={`Importe en ${data?.moneda_flujo}`} valor={fmt2(sim.importe_en_moneda_flujo, 0)}
                          tip="El importe pasado a la moneda de los flujos vía MEP live, para poder comparar." />
                      )}
                      <Dato label="Ganancia" valor={
                        sim.ganancia == null ? "--" : (
                          <span className={sim.ganancia >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}>
                            {fmt2(sim.ganancia, 0)}
                          </span>
                        )}
                        tip="Total a cobrar − importe (en la moneda de los flujos)." />
                      <Dato label="Rend. directo" valor={pct(sim.rendimiento_directo)}
                        tip="Total a cobrar / importe − 1. Sin anualizar." />
                    </div>
                  </div>

                  {/* ficha */}
                  <div className="border border-[var(--t-border-2)] p-2">
                    <div className="text-[10px] tracking-wide text-[var(--t-accent)] mb-2">FICHA</div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2">
                      <Dato label="Símbolo" valor={data?.instrumento || "--"} tip="El símbolo que se le manda a Primary" />
                      <Dato label="Emisor" valor={ficha.emisor || "--"} />
                      <Dato label="Tipo emisor" valor={ficha.emisor_tipo || "--"} />
                      <Dato label="Tipo" valor={ficha.tipo || "--"} />
                      <Dato label="Moneda" valor={ficha.moneda || "--"} />
                      <Dato label="Ajuste"
                        valor={ficha.ajuste_alt ? `${ficha.ajuste} + ${ficha.ajuste_alt}` : ficha.ajuste || "--"}
                        tip={ficha.ajuste_alt ? "Bono DUAL: tiene dos patas de rendimiento" : undefined} />
                      {ficha.ley && (
                        <Dato label="Ley" valor={ficha.ley === "local" ? "Local (Bonar)" : "NY (Global)"} />
                      )}
                      <Dato label="Emisión" valor={ficha.fecha_emision ? fmtFechaCorta(ficha.fecha_emision) : "--"} />
                      <Dato label="Vencimiento" valor={ficha.fecha_vencimiento ? fmtFechaCorta(ficha.fecha_vencimiento) : "--"} />
                      <Dato label="Valor nominal" valor={fmt2(ficha.valor_nominal, 0)} />
                      <Dato label="Cupón anual" valor={ficha.cupon_anual == null ? "--" : fmt2(ficha.cupon_anual, 4)} />
                      {ficha.cer_emision != null && <Dato label="CER emisión" valor={fmt2(ficha.cer_emision, 4)} />}
                      {ficha.flujo_vencimiento != null && (
                        <Dato label="Pago final" valor={fmt2(ficha.flujo_vencimiento, 2)}
                          tip="Pago al vencimiento por 100 VN (bullet)" />
                      )}
                    </div>
                  </div>
                </div>

                {/* ══ DERECHA: el mapa del flujo de fondos ══ */}
                <div className="flex flex-col gap-3 min-w-0">
                  <div className="border border-[var(--t-border-2)] p-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] tracking-wide text-[var(--t-accent)]">
                        FLUJO DE FONDOS
                      </span>
                      <span className="text-[9px] text-[var(--t-text-muted)]">
                        {data?.moneda_flujo ?? ""} · escalado a {fmt2(sim.vn_nominal, 0)} VN
                        {sim.cer_proyectado ? " · CER proyectado" : ""}
                      </span>
                    </div>
                    {chart.length === 0 ? (
                      <p className="text-[var(--t-text-muted)] text-xs text-center py-6">
                        No quedan pagos futuros cargados para este bono.
                      </p>
                    ) : (
                      <div className="h-[260px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chart} margin={{ top: 8, right: 12, bottom: 28, left: 4 }}>
                            <XAxis
                              dataKey="fecha"
                              tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                              axisLine={{ stroke: "var(--t-border-2)" }}
                              tickLine={false}
                              angle={-35}
                              textAnchor="end"
                              height={44}
                              tickFormatter={fmtFechaCorta}
                              interval={Math.max(0, Math.floor(chart.length / 12))}
                            />
                            <YAxis
                              tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                              axisLine={{ stroke: "var(--t-border-2)" }}
                              tickLine={false}
                              width={64}
                              tickFormatter={(v: number) => v.toLocaleString("es-AR", { notation: "compact" })}
                            />
                            <Tooltip
                              contentStyle={{
                                background: "var(--t-surface)",
                                border: "1px solid var(--t-border-2)",
                                fontSize: 11,
                                fontFamily: "JetBrains Mono, monospace",
                              }}
                              labelStyle={{ color: "var(--t-text-dim)" }}
                              labelFormatter={(v) => fmtFechaCorta(String(v))}
                              formatter={(v, n) => [
                                fmt2(Number(v), 0),
                                n === "amortizacion" ? "Amortización" : "Interés",
                              ]}
                            />
                            {/* Apiladas, mismo criterio que la FICHA: la altura
                                total es lo que entra ese día; el desglose
                                distingue capital de renta. */}
                            <Bar dataKey="amortizacion" stackId="f" fill="var(--t-accent)" isAnimationActive={false} />
                            <Bar dataKey="interes" stackId="f" fill="#33ccaa" isAnimationActive={false} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* cronograma escalado: el dato duro que respalda el gráfico */}
                  {sim.flujos.length > 0 && (
                    <div className="border border-[var(--t-border-2)] p-2 min-h-0">
                      <div className="text-[10px] tracking-wide text-[var(--t-accent)] mb-2">
                        CUÁNDO COBRO
                        <span className="ml-2 text-[var(--t-text-muted)]">{sim.n_pagos} pagos</span>
                      </div>
                      <div className="max-h-[280px] overflow-y-auto">
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th className="!px-1 text-left">Fecha</th>
                              <th className="!px-1 text-right">Amortización</th>
                              <th className="!px-1 text-right">Interés</th>
                              <th className="!px-1 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sim.flujos.map((f) => (
                              <tr key={f.fecha}>
                                <td className="!px-1 text-left">{fmtFechaCorta(f.fecha)}</td>
                                <td className="!px-1 text-right">{fmt2(f.amortizacion, 0)}</td>
                                <td className="!px-1 text-right">{fmt2(f.interes, 0)}</td>
                                <td className="!px-1 text-right font-medium">{fmt2(f.monto, 0)}</td>
                              </tr>
                            ))}
                            <tr className="border-t border-[var(--t-border-2)]">
                              <td className="!px-1 text-left font-semibold text-[var(--t-text)]">TOTAL</td>
                              <td className="!px-1" />
                              <td className="!px-1" />
                              <td className="!px-1 text-right font-semibold text-[var(--t-text)]">
                                {fmt2(sim.total_a_cobrar, 0)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
