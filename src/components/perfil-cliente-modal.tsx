"use client";

import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { fetchJson } from "@/lib/fetch-json";
import { fmtMoney, fmtMoneyFull } from "@/lib/fmt-money";
import { useViewportKey } from "@/lib/use-viewport-key";

// Ficha operativa de UN cliente. Tres cosas y en este orden:
//
//   1. la ÚLTIMA operación, en una línea
//   2. el ARANCEL MES A MES, en barras
//   3. EN QUÉ OPERA — el share del volumen por tipo de operación
//
// **Componente aparte a propósito**: el share por tipo se va a reusar en otras
// pantallas, así que el modal no sabe nada de SE ESTÁN APAGANDO ni de ninguna
// lista. Recibe un `id_cuenta` y nada más.
//
// El backend manda TODO calculado —incluidos los porcentajes y los meses en cero—
// porque es el número que se va a mostrar en más de un lado: dos pantallas que lo
// derivan cada una terminan mostrando dos porcentajes distintos del mismo cliente.

type Ultima = {
  boleto: string | null; fecha: string | null; dias: number | null;
  operacion: string | null; operacion_label: string; tipo_operacion: string | null;
  instrumento: string | null; mercado: string | null; moneda: string | null;
  bruto: number | null; arancel: number | null; etapa: string | null; es_cierre: boolean;
};
type PuntoMes = {
  mes: string; label: string; fin: string;
  arancel: number; volumen: number; n_boletos: number;
};
type Share = {
  operacion: string | null; label: string; volumen: number; pct: number;
  n_boletos: number; n_boletos_cierre: number; arancel: number; solo_arancel: boolean;
};
type PuntoAum = { mes: string; label: string; aum: number | null; foto: string | null };
type Posicion = { unidad: string; valuacion: number; pct: number };
type Fusion = { de: string; a: string; arancel: number };
export type Perfil = {
  id_cuenta: string; denominacion: string; operador_nombre: string | null;
  nivel_1: string | null; nivel_3: string | null; estado: string | null;
  moneda: string; desde: string; hasta: string; meses: number;
  hoy: string;
  ultima_op: Ultima | null;
  serie_aranceles: PuntoMes[];
  serie_aum: PuntoAum[];
  tenencia: { fecha_snapshot: string | null; total: number; posiciones: Posicion[] };
  share_operacion: Share[];
  fusiones: Fusion[];
  totales: {
    arancel: number; arancel_por_mes: number; volumen: number;
    n_boletos: number; meses_operados: number;
  };
  fuentes: Record<string, string>;
};

// El encabezado y las filas del share comparten UNA sola definición de grilla:
// dos listas de columnas separadas se desalinean el día que alguien toca una.
const GRID_SHARE = { gridTemplateColumns: "minmax(96px, 1fr) 68px 44px 76px 76px" } as const;
const GRID_TEN = { gridTemplateColumns: "minmax(96px, 1fr) 92px 46px" } as const;
const GRID_SHARE_CLS = "grid items-center gap-2";

const fmtFecha = (iso: string | null | undefined) =>
  !iso ? "—" : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function PerfilClienteModal(
  { idCuenta, meses = 12, moneda = "ARS", hasta, onCerrar }:
  { idCuenta: string; meses?: number; moneda?: string; hasta?: string; onCerrar: () => void },
) {
  const [d, setD] = useState<Perfil | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  useEffect(() => {
    let vivo = true;
    const qs = new URLSearchParams({ id_cuenta: idCuenta, meses: String(meses), moneda });
    if (hasta) qs.set("hasta", hasta);
    void (async () => {
      try {
        const r = await fetchJson<Perfil>(`/api/operaciones/comercial/cliente/perfil?${qs}`);
        if (vivo) setD(r);
      } catch (e) {
        if (vivo) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { vivo = false; };
  }, [idCuenta, meses, moneda, hasta]);

  const u = d?.ultima_op ?? null;
  const maxPct = Math.max(1, ...(d?.share_operacion ?? []).map((s) => s.pct));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}>
      <div className="w-full max-w-[1280px] max-h-[90vh] flex flex-col bg-[var(--t-panel)]
                      border border-[var(--t-border-2)] shadow-2xl" onClick={(e) => e.stopPropagation()}>

        <div className="px-3 py-2 bg-[#094293] text-white flex items-center gap-2 shrink-0">
          <span className="flex-1 text-[11px] uppercase tracking-widest font-semibold truncate">
            [{idCuenta}] {d?.denominacion ?? "cargando…"}
          </span>
          <button onClick={onCerrar} className="text-[12px] px-2 hover:opacity-70"
            aria-label="Cerrar">✕</button>
        </div>

        {err && <div className="px-4 py-3 text-[11px] text-[var(--t-neg)]">{err}</div>}
        {!d && !err && <div className="px-4 py-6 text-[11px] text-[var(--t-text-muted)]">cargando…</div>}

        {d && (
          <div className="flex-1 min-h-0 overflow-auto">

            {/* ── 1) LA ÚLTIMA OPERACIÓN, en una línea ────────────────────── */}
            <Seccion titulo="Última operación"
              derecha={d.operador_nombre ? `${d.operador_nombre}${d.nivel_3 ? ` · ${d.nivel_3}` : ""}` : undefined}>
              {u ? (
                // Una sola línea y chica: acá lo que se busca es CUÁNDO fue y QUÉ
                // fue. El importe y el arancel de ese boleto suelto no dicen nada
                // —el arancel del período está en el gráfico de al lado— y eran lo
                // que hacía que la línea no entrara y se partiera en dos.
                <div className="flex items-baseline gap-2 flex-wrap text-[11.5px]">
                  <span className="font-semibold tabular-nums">{fmtFecha(u.fecha)}</span>
                  {u.dias != null && (
                    <span className="text-[var(--t-text-muted)]">
                      hace {u.dias} {u.dias === 1 ? "día" : "días"}
                    </span>
                  )}
                  <Punto />
                  <span>{u.tipo_operacion || u.operacion_label}</span>
                  <Punto />
                  <span className="font-medium truncate max-w-[46ch]" title={u.instrumento ?? ""}>
                    {u.instrumento || "—"}
                  </span>
                  {u.mercado && <><Punto /><span className="text-[var(--t-text-dim)]">{u.mercado}</span></>}
                  <span className="ml-auto text-[9.5px] font-mono text-[var(--t-text-muted)]">
                    boleto {u.boleto ?? "—"}{u.es_cierre ? " · cierre" : ""}
                  </span>
                </div>
              ) : (
                <div className="text-[11.5px] text-[var(--t-text-muted)]">
                  la cuenta no registra boletos — nunca operó
                </div>
              )}
            </Seccion>

            {/* ── 2) LOS DOS GRÁFICOS, LADO A LADO ────────────────────────────
                Cada uno más chico que el de antes: dos preguntas distintas —cuánto
                deja y cuánta plata tiene— caben en el alto que ocupaba una sola.
                Comparten el eje X (los mismos meses) pero NUNCA el eje Y: son
                escalas de cosas distintas y superponerlas es de manual. */}
            <div className="grid gap-0 border-b border-[var(--t-border)]"
              style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Grafico titulo={`Arancel por mes · últimos ${d.meses}`}
                derecha={`${fmtMoneyFull(d.totales.arancel)} · operó ${d.totales.meses_operados}/${d.meses}`}
                borde>
                <BarChart data={d.serie_aranceles} barCategoryGap="20%"
                  margin={{ top: 6, right: 6, bottom: 2, left: 0 }}>
                  <CartesianGrid stroke="var(--t-border)" vertical={false} />
                  <EjeX /><EjeY />
                  <Tip formatter={(v, _n, item) => {
                    const pto = (item as { payload?: PuntoMes })?.payload;
                    return [`${fmtMoneyFull(Number(v ?? 0))} · ${pto?.n_boletos ?? 0} boletos`,
                            "Arancel"];
                  }} />
                  <Bar dataKey="arancel" fill="var(--t-accent)" radius={[3, 3, 0, 0]}
                    maxBarSize={34} isAnimationActive={false} />
                </BarChart>
              </Grafico>

              {/* Un mes sin foto de tenencia llega como `null` y recharts deja el
                  hueco: es lo correcto. Dibujarlo en cero sería inventar una caída
                  a cero que nunca pasó. */}
              <Grafico titulo="AuM del cliente · fin de cada mes"
                derecha={d.tenencia.fecha_snapshot
                  ? `hoy ${fmtMoneyFull(d.tenencia.total)}` : "sin foto"}>
                <BarChart data={d.serie_aum} barCategoryGap="20%"
                  margin={{ top: 6, right: 6, bottom: 2, left: 0 }}>
                  <CartesianGrid stroke="var(--t-border)" vertical={false} />
                  <EjeX /><EjeY />
                  <Tip formatter={(v, _n, item) => {
                    const pto = (item as { payload?: PuntoAum })?.payload;
                    if (pto?.aum == null) return ["sin foto de tenencia ese mes", "AuM"];
                    return [`${fmtMoneyFull(Number(v ?? 0))} · foto del ${fmtFecha(pto.foto)}`,
                            "AuM"];
                  }} />
                  <Bar dataKey="aum" fill="var(--t-text-dim)" radius={[3, 3, 0, 0]}
                    maxBarSize={34} isAnimationActive={false} />
                </BarChart>
              </Grafico>
            </div>

            {/* ── 3) LOS DOS INVENTARIOS, LADO A LADO ──────────────────────
                EN QUÉ OPERA y QUÉ TIENE HOY son la misma pregunta en dos tiempos
                (por dónde entra la plata / dónde está parada hoy), y ninguno de
                los dos necesita el ancho entero: la barra estirada de punta a
                punta no agregaba información, solo ancho. Compartir la banda deja
                que cada nombre entre completo en su mitad. */}
            <div className="grid gap-0 border-b border-[var(--t-border)]"
              style={{ gridTemplateColumns: "1fr 1fr" }}>

              <Seccion titulo="En qué opera · share del volumen"
                derecha={`${fmtMoneyFull(d.totales.volumen)} en ${d.meses} meses`} borde plano>
                {d.share_operacion.length === 0 ? (
                  <div className="text-[11.5px] text-[var(--t-text-muted)]">
                    sin operaciones en la ventana
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {/* Qué es cada número se dice UNA vez, en el encabezado. Repetir
                        la palabra «arancel» en cada fila leía como si fuera parte del
                        nombre del tipo de operación. */}
                    <div className={`${GRID_SHARE_CLS} text-[9px] uppercase tracking-widest
                                     text-[var(--t-text-muted)] pb-1 border-b border-[var(--t-border)]`}
                      style={GRID_SHARE}>
                      <span>Tipo de operación</span>
                      <span />
                      <span className="text-right">%</span>
                      <span className="text-right">Volumen</span>
                      <span className="text-right">Arancel</span>
                    </div>
                    {d.share_operacion.map((s) => (
                      <div key={s.operacion ?? s.label} className={`${GRID_SHARE_CLS} text-[11.5px]`}
                        style={GRID_SHARE}>
                        <span className="truncate" title={s.label}>{s.label}</span>
                        {/* La barra es escala relativa al mayor, para que un 3% se
                            vea; el número exacto está al lado y no se deduce de ella. */}
                        <span className="h-[9px] bg-[var(--t-surface)] block">
                          <span className="h-full bg-[var(--t-accent)] block"
                            style={{ width: `${Math.max(2, (s.pct / maxPct) * 100)}%` }} />
                        </span>
                        <span className="tabular-nums text-right font-semibold">
                          {s.pct.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%
                        </span>
                        <span className="tabular-nums text-right text-[var(--t-text-dim)]"
                          title={`${s.n_boletos} boletos · ${fmtMoneyFull(s.volumen)}`}>
                          {fmtMoney(s.volumen)}
                        </span>
                        <span className="tabular-nums text-right text-[var(--t-text-dim)]"
                          title={fmtMoneyFull(s.arancel)}>
                          {fmtMoney(s.arancel)}
                          {/* Un tipo puede dejar arancel SIN volumen propio: todo su
                              arancel vive en el cierre, que el volumen excluye. */}
                          {s.solo_arancel && (
                            <span className="ml-0.5 text-[var(--t-accent)]"
                              title="Todo su arancel está en el cierre, que no cuenta como volumen">*</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Seccion>

              {/* Una posición por línea, no en columnas: los nombres de la unidad
                  son largos («[#UBS301060001] #UBS3010600 01 - …») y partidos en dos
                  columnas se cortaban tanto que no se distinguía uno de otro. */}
              <Seccion titulo="Qué tiene hoy" plano
                derecha={d.tenencia.fecha_snapshot
                  ? `${fmtMoneyFull(d.tenencia.total)} · ${fmtFecha(d.tenencia.fecha_snapshot)}`
                  : undefined}>
                {d.tenencia.posiciones.length === 0 ? (
                  <div className="text-[11.5px] text-[var(--t-text-muted)]">
                    {d.tenencia.fecha_snapshot
                      ? "la cuenta no tiene posiciones en la última foto"
                      : "todavía no hay ninguna foto de tenencia"}
                  </div>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    <div className="grid items-center gap-3 text-[9px] uppercase tracking-widest
                                    text-[var(--t-text-muted)] pb-1 border-b border-[var(--t-border)]"
                      style={GRID_TEN}>
                      <span>Especie</span>
                      <span className="text-right">Valuación</span>
                      <span className="text-right">%</span>
                    </div>
                    {d.tenencia.posiciones.slice(0, 20).map((x) => (
                      <div key={x.unidad} className="grid items-baseline gap-3 text-[11.5px]"
                        style={GRID_TEN}>
                        <span className="truncate" title={x.unidad}>{x.unidad}</span>
                        <span className="tabular-nums text-right text-[var(--t-text-dim)]"
                          title={fmtMoneyFull(x.valuacion)}>
                          {fmtMoney(x.valuacion)}
                        </span>
                        <span className="tabular-nums text-right text-[var(--t-text-muted)]">
                          {x.pct}%
                        </span>
                      </div>
                    ))}
                    {d.tenencia.posiciones.length > 20 && (
                      <div className="text-[10px] text-[var(--t-text-muted)] pt-0.5">
                        … y {d.tenencia.posiciones.length - 20} posiciones más
                      </div>
                    )}
                  </div>
                )}
              </Seccion>
            </div>

            <div className="px-4 py-2 border-t border-[var(--t-border-2)] bg-[var(--t-surface)]
                            text-[9px] text-[var(--t-text-muted)] space-y-0.5">
              <div>Ventana {fmtFecha(d.desde)} → {fmtFecha(d.hasta)} · montos en {d.moneda}.</div>
              <div>Volumen: {d.fuentes.volumen}</div>
              <div>Arancel: {d.fuentes.arancel}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Seccion(
  { titulo, derecha, borde, plano, children }:
  { titulo: string; derecha?: string; borde?: boolean; plano?: boolean; children: React.ReactNode },
) {
  return (
    <section className={"px-4 py-3 min-w-0"
      + (plano ? "" : " border-b border-[var(--t-border)]")
      + (borde ? " border-r border-[var(--t-border)]" : "")}>
      <div className="flex items-baseline gap-3 mb-2">
        <h3 className="text-[9.5px] uppercase tracking-widest text-[var(--t-accent)] font-semibold">
          {titulo}
        </h3>
        {derecha && (
          <span className="ml-auto text-[10px] tabular-nums text-[var(--t-text-muted)] truncate">
            {derecha}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Marco de un gráfico: título, apunte a la derecha y el alto FIJO.
 *
 * El alto es fijo (y chico) a propósito: son dos gráficos al lado del otro y
 * si cada uno se estirara con su contenido dejarían de estar alineados por el
 * eje X, que es lo único que comparten (los mismos meses). El eje Y NO se
 * comparte — son escalas de cosas distintas.
 */
function Grafico(
  { titulo, derecha, borde, children }:
  { titulo: string; derecha?: string; borde?: boolean; children: React.ReactElement },
) {
  // recharts a veces mide 0 al montarse dentro de un overlay y no se recupera solo.
  const vk = useViewportKey();
  return (
    <section className={`px-4 py-3 min-w-0${borde ? " border-r border-[var(--t-border)]" : ""}`}>
      <div className="flex items-baseline gap-3 mb-2">
        <h3 className="text-[9.5px] uppercase tracking-widest text-[var(--t-accent)] font-semibold">
          {titulo}
        </h3>
        {derecha && (
          <span className="ml-auto text-[10px] tabular-nums text-[var(--t-text-muted)] truncate">
            {derecha}
          </span>
        )}
      </div>
      <div className="h-[150px]">
        <ResponsiveContainer key={vk} width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function EjeX() {
  return (
    <XAxis dataKey="label" tick={{ fill: "var(--t-text-muted)", fontSize: 9 }}
      axisLine={{ stroke: "var(--t-border-2)" }} tickLine={false} interval="preserveStartEnd" />
  );
}

function EjeY() {
  return (
    <YAxis tick={{ fill: "var(--t-text-muted)", fontSize: 9 }} axisLine={false} tickLine={false}
      width={52} tickFormatter={(v) => fmtMoney(Number(v))} />
  );
}

function Tip({ formatter }: { formatter: React.ComponentProps<typeof Tooltip>["formatter"] }) {
  return (
    <Tooltip cursor={{ fill: "var(--t-surface)", opacity: 0.5 }} formatter={formatter}
      contentStyle={{
        background: "var(--t-surface)", border: "1px solid var(--t-border-2)",
        fontSize: 11, fontFamily: "JetBrains Mono, monospace",
      }}
      labelStyle={{ color: "var(--t-text)" }} />
  );
}

function Punto() { return <span className="text-[var(--t-text-muted)] opacity-50">·</span>; }
