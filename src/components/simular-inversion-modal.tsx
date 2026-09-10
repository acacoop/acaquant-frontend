"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DatoFlujo, FlujoFondosChart } from "@/components/flujo-fondos-chart";
import type { BonoCurva, SimulacionInversion } from "@/lib/types";
import { fmtFechaCorta } from "@/lib/fmt";
import { NumeroInput } from "@/components/numero-input";
import { Dato, fmt0, fmt2, Panel } from "@/components/ui/informe";

// Modal SIMULAR INVERSIÓN — se abre desde la barra de tabs de /renta-fija.
//
// Tres inputs: BONO (combobox TIPEABLE — el <select> nativo no deja escribir el
// ticker; el universo es el MISMO de la tab CURVAS), IMPORTE y PRECIO. El precio
// arranca en el LAST del snapshot (`precio_referencia`) y es editable: al
// cambiarlo, la TIR/TEA y todo el cuadro se recalculan EN EL BACKEND con el
// mismo motor que produce la tasa de la tabla (`calcular_campos` con el precio
// inyectado). El front no deriva un solo número.
//
// El diseño usa las piezas de INFORME (`ui/informe.tsx`: Panel con cabecera
// azul + Dato) — es la identidad visual de "esto se lee como un informe", la
// misma de /aca y CARTERAS. Layout: fila de Datos grandes (el resultado) y
// después RESULTADO/FLUJO en dos columnas.
//
// La FICHA del bono NO vive acá: es exactamente la misma que muestra el modal
// del BONO (`bono-modal.tsx`), y repetirla obligaba a scrollear el simulador
// para llegar a datos que ya se leen en otra pantalla. Acá se contesta una sola
// pregunta —*si pongo esta plata a este precio, cuánto rinde y cuándo cobro*—
// y todo lo que no la conteste es ruido.

interface Props {
  bonos: BonoCurva[];         // el payload de curvas-vista (la tab CURVAS)
  onClose: () => void;
}

const DEBOUNCE_MS = 400;

const pctSigned = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? "—" : `${(v * 100).toFixed(d)}%`;

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

/** Rótulo de cada panel del flujo: el swatch + qué es, pegado a SU chart. */
/** Fila label → valor. Es la unidad de TASAS AL PRECIO: se lee en vertical. */
function Fila({ label, valor, tip }: { label: string; valor: React.ReactNode; tip?: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 px-3 py-1.5 border-b border-[var(--t-border)] last:border-b-0"
      title={tip}
    >
      <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] shrink-0">{label}</span>
      <span className="text-xs text-[var(--t-text)] tabular-nums text-right truncate">{valor}</span>
    </div>
  );
}

/** Combobox tipeable de bonos. Las sugerencias aparecen SOLO cuando hay algo
 *  escrito (feedback del user 2026-09-10: abrir la lista entera al enfocar,
 *  221 bonos en orden cronológico, era confuso y no se entendía qué era eso).
 *  Se busca por el TICKER (lo que la mesa tipea), empezando por lo escrito
 *  primero y conteniendo después; Enter elige el primero. */
function BonoCombo({ bonos, selected, onChange }: {
  bonos: BonoCurva[]; selected: string; onChange: (ticker: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const sel = bonos.find((b) => b.ticker_corto === selected) ?? null;
  const display = open
    ? query
    : sel
      ? `${sel.ticker_corto}${sel.vencimiento ? ` · ${fmtFechaCorta(sel.vencimiento)}` : ""}`
      : "";

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const empieza = bonos.filter((b) => b.ticker_corto.toUpperCase().startsWith(q));
    const contiene = bonos.filter(
      (b) => !b.ticker_corto.toUpperCase().startsWith(q) && b.ticker_corto.toUpperCase().includes(q),
    );
    return [...empieza, ...contiene].slice(0, 12);
  }, [bonos, query]);
  const abierta = open && query.trim().length > 0;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (b: BonoCurva) => {
    onChange(b.ticker_corto);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative w-56">
      <input
        value={display}
        placeholder="tipeá un ticker (ej. AL30)"
        autoFocus
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setQuery(""); setOpen(true); }}   // abre, pero sin texto no lista nada
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered.length > 0) pick(filtered[0]);
          else if (e.key === "Escape") setOpen(false);
        }}
        className="w-full bg-[var(--t-panel)] border border-[var(--t-border-2)] px-2 py-1 text-xs text-[var(--t-text)] focus:border-[var(--t-accent)] outline-none"
      />
      {abierta && (
        <div className="absolute z-50 top-full left-0 right-0 mt-0.5 max-h-72 overflow-y-auto bg-[var(--t-panel)] border border-[var(--t-border-2)] shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-2 py-1 text-[10px] text-[var(--t-text-muted)] italic">ningún ticker empieza así</div>
          ) : (
            filtered.map((b) => (
              <button
                key={b.ticker_corto}
                type="button"
                onClick={() => pick(b)}
                className={`flex w-full items-baseline justify-between text-left px-2 py-1 text-[11px] hover:bg-[var(--t-accent)]/10 ${
                  b.ticker_corto === selected ? "text-[var(--t-accent)]" : "text-[var(--t-text)]"
                }`}
              >
                <span className="font-semibold">{b.ticker_corto}</span>
                <span className="text-[var(--t-text-muted)] text-[9px] ml-2 shrink-0">
                  {b.lado}{b.vencimiento ? ` · ${fmtFechaCorta(b.vencimiento)}` : ""}
                  {b.metrics?.last_price ? "" : " · sin precio"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function SimularInversionModal({ bonos, onClose }: Props) {
  // El universo del combobox: los tickers de la tab CURVAS, DEDUPE por
  // ticker_corto (un dual llega repetido, una fila por pata), ARS primero y
  // cronológico. Los sin precio live entran igual — se simula tipeando uno.
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

  // Borrar el importe limpia el cuadro desde el HANDLER (no en el effect:
  // setState sincrónico en un effect dispara renders en cascada — regla del lint).
  const cambiarImporte = (raw: string) => {
    setImporte(raw);
    if (!num(raw)) setData(null);
  };

  // EL fetch: uno solo, con debounce, cancelable. Sin precio manda solo
  // ticker+importe y el backend usa el last (que devuelve como referencia).
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
        className="bg-[var(--t-surface)] border border-[var(--t-border-2)] w-full max-w-6xl max-h-[92vh] flex flex-col"
      >
        {/* ── cabecera: título + los TRES inputs ── */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--t-border-2)] bg-[var(--t-panel)] shrink-0 flex-wrap">
          <span className="text-[var(--t-accent)] font-semibold tracking-wide shrink-0">
            SIMULAR INVERSIÓN
          </span>

          <label className="flex items-center gap-1.5 text-[10px] text-[var(--t-text-muted)]">
            BONO
            <BonoCombo bonos={universo} selected={ticker} onChange={elegirBono} />
          </label>

          <label className="flex items-center gap-1.5 text-[10px] text-[var(--t-text-muted)]">
            IMPORTE
            <NumeroInput value={importe} onChange={cambiarImporte} className={inputCls} placeholder="1.000.000" />
            {data?.moneda_precio && (
              <span className="text-[9px]" title="La moneda en que cotiza la pata elegida — el importe se asume en esa moneda.">
                {data.moneda_precio}
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
              Tipeá un ticker para simular. El universo es el mismo de la tab CURVAS.
            </p>
          ) : error ? (
            <p className="text-[var(--t-neg)] text-xs text-center py-10">error: {error}</p>
          ) : data?.error ? (
            <p className="text-[var(--t-text-muted)] text-xs text-center py-10">{data.error}</p>
          ) : !sim ? (
            <p className="text-[var(--t-text-muted)] text-xs text-center py-10">
              {num(importe) ? "calculando…" : "Ingresá un importe para simular."}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Los avisos del backend, arriba de todo: un número calculado con
                  CER proyectado o sin MEP no se puede leer igual que uno firme. */}
              {(data?.warnings ?? []).length > 0 && (
                <div className="space-y-0.5">
                  {(data?.warnings ?? []).map((w) => (
                    <p key={w} className="text-[9px] text-[var(--t-text-muted)] leading-snug">
                      ⚠ {WARNINGS[w] ?? w}
                    </p>
                  ))}
                </div>
              )}

              {/* ── EL RESULTADO, en grande: la fila que contesta la pregunta ── */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <Dato
                  label="TIR / TEA"
                  valor={pctSigned(sim.metrics.TEA)}
                  title="Tasa efectiva anual al precio simulado — el mismo motor que calcula la de la tabla."
                />
                <Dato
                  label={`Invertís (${data?.moneda_precio ?? "—"})`}
                  valor={fmt0(sim.importe)}
                  sub={`${fmt0(sim.vn_nominal)} nominales a ${fmt2(sim.precio)}`}
                />
                <Dato
                  label={`Cobrás (${data?.moneda_flujo ?? "—"})`}
                  valor={fmt0(sim.total_a_cobrar)}
                  sub={`${sim.n_pagos} pago${sim.n_pagos === 1 ? "" : "s"} · sin descontar`}
                />
                <Dato
                  label="Ganancia"
                  valor={sim.ganancia == null ? "—" : fmt0(sim.ganancia)}
                  tono={sim.ganancia == null ? null : sim.ganancia >= 0 ? "pos" : "neg"}
                  sub={sim.rendimiento_directo == null ? undefined : `${pctSigned(sim.rendimiento_directo)} directo`}
                  title="Total a cobrar − importe (en la moneda de los flujos)."
                />
                <Dato
                  label="Rend. al vto"
                  valor={pctSigned(sim.rendimiento_al_vto)}
                  sub={sim.dias_al_vto != null ? `${sim.dias_al_vto} días` : undefined}
                  title="La TEA llevada al plazo del bono: (1+TEA)^(días/365) − 1."
                />
                <Dato
                  label="Duration"
                  valor={fmt2(sim.metrics.duration)}
                  sub={sim.metrics.mod_duration != null ? `mod ${fmt2(sim.metrics.mod_duration)}` : undefined}
                />
              </div>

              {/* ── RESULTADO detallado + FLUJO DE FONDOS ── */}
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 items-start">
                <div className="flex flex-col gap-3 min-w-0">
                  <Panel titulo={`TASAS AL PRECIO ${fmt2(sim.precio)}`}>
                    <Fila label="TIR / TEA" valor={<b className="text-[var(--t-accent)]">{pctSigned(sim.metrics.TEA)}</b>} />
                    <Fila label="TNA" valor={pctSigned(sim.metrics.TNA, 1)} />
                    <Fila label="TEM" valor={pctSigned(sim.metrics.TEM)} />
                    <Fila label="Duration" valor={fmt2(sim.metrics.duration)} />
                    <Fila label="Mod duration" valor={fmt2(sim.metrics.mod_duration)} />
                    <Fila label="Paridad" valor={fmt2(sim.metrics.paridad)} />
                    {data?.moneda_precio !== data?.moneda_flujo && sim.importe_en_moneda_flujo != null && (
                      <Fila
                        label={`Importe en ${data?.moneda_flujo}`}
                        valor={fmt0(sim.importe_en_moneda_flujo)}
                        tip="El importe pasado a la moneda de los flujos vía MEP live, para poder comparar."
                      />
                    )}
                  </Panel>

                  {/* CUÁNDO COBRO: el dato duro que respalda el gráfico */}
                  {sim.flujos.length > 0 && (
                    <Panel
                      titulo="CUÁNDO COBRO"
                      extra={<span className="text-[10px] text-white/80">{sim.n_pagos} pago{sim.n_pagos === 1 ? "" : "s"}</span>}
                    >
                      <div className="max-h-[220px] overflow-y-auto">
                        <table className="w-full">
                          <thead>
                            <tr>
                              <th className="!px-3 text-left">Fecha</th>
                              <th className="!px-2 text-right">Amortización</th>
                              <th className="!px-2 text-right">Interés</th>
                              <th className="!px-3 text-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sim.flujos.map((f) => (
                              <tr key={f.fecha}>
                                <td className="!px-3 text-left">{fmtFechaCorta(f.fecha)}</td>
                                <td className="!px-2 text-right">{fmt0(f.amortizacion)}</td>
                                <td className="!px-2 text-right">{fmt0(f.interes)}</td>
                                <td className="!px-3 text-right font-medium">{fmt0(f.monto)}</td>
                              </tr>
                            ))}
                            <tr className="border-t border-[var(--t-border-2)]">
                              <td className="!px-3 text-left font-semibold text-[var(--t-text)]">TOTAL</td>
                              <td className="!px-2" />
                              <td className="!px-2" />
                              <td className="!px-3 text-right font-semibold text-[var(--t-text)]">
                                {fmt0(sim.total_a_cobrar)}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  )}
                </div>

                {/* El mismo gráfico que la FICHA DEL BONO (`flujo-fondos-chart.tsx`):
                    capital en barras contra el eje izquierdo, cupones en línea con
                    el número encima contra el derecho. Acá en MONTOS, escalados al
                    importe, no por 100 VN. */}
                <Panel
                  titulo="FLUJO DE FONDOS"
                  extra={
                    <span className="text-[10px] text-white/80">
                      {data?.moneda_flujo ?? ""} · {fmt0(sim.vn_nominal)} VN
                      {sim.cer_proyectado ? " · CER proyectado" : ""}
                    </span>
                  }
                >
                  {chart.length === 0 ? (
                    <p className="text-[var(--t-text-muted)] text-xs text-center py-6">
                      No quedan pagos futuros cargados para este bono.
                    </p>
                  ) : (
                    <div className="p-2 flex flex-col">
                      <div className="h-[340px] flex flex-col">
                        <FlujoFondosChart puntos={chart} decimales={0} ejeCompacto />
                      </div>
                      <div className="shrink-0 flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-1.5 pt-1.5 border-t border-[var(--t-border-2)]">
                        <DatoFlujo label="Pagos futuros" valor={sim.n_pagos} />
                        <DatoFlujo
                          label="Próximo pago"
                          valor={`${fmtFechaCorta(sim.flujos[0].fecha)} · ${fmt0(sim.flujos[0].monto)}`}
                        />
                        <DatoFlujo
                          label="Último pago"
                          valor={fmtFechaCorta(sim.flujos[sim.flujos.length - 1].fecha)}
                        />
                        <DatoFlujo
                          label="Total a cobrar"
                          valor={fmt0(sim.total_a_cobrar)}
                          tip="Suma nominal de los pagos que faltan, sin descontar. No es el valor presente."
                        />
                      </div>
                    </div>
                  )}
                </Panel>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
