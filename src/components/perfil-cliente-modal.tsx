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
  n_boletos: number; arancel: number; solo_arancel: boolean;
};
export type Perfil = {
  id_cuenta: string; denominacion: string; operador_nombre: string | null;
  nivel_1: string | null; nivel_3: string | null; estado: string | null;
  moneda: string; desde: string; hasta: string; meses: number;
  ultima_op: Ultima | null;
  serie_aranceles: PuntoMes[];
  share_operacion: Share[];
  totales: {
    arancel: number; arancel_por_mes: number; volumen: number;
    n_boletos: number; meses_operados: number;
  };
  fuentes: Record<string, string>;
};

const fmtFecha = (iso: string | null | undefined) =>
  !iso ? "—" : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function PerfilClienteModal(
  { idCuenta, meses = 12, moneda = "ARS", hasta, onCerrar }:
  { idCuenta: string; meses?: number; moneda?: string; hasta?: string; onCerrar: () => void },
) {
  const [d, setD] = useState<Perfil | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // recharts a veces mide 0 al montarse dentro de un overlay y no se recupera solo.
  const vk = useViewportKey();

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
      <div className="w-full max-w-[1000px] max-h-[88vh] flex flex-col bg-[var(--t-panel)]
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
                <div className="flex items-baseline gap-2.5 flex-wrap text-[13px]">
                  <span className="font-semibold tabular-nums">{fmtFecha(u.fecha)}</span>
                  {u.dias != null && (
                    <span className="text-[var(--t-text-muted)] text-[12px]">
                      hace {u.dias} {u.dias === 1 ? "día" : "días"}
                    </span>
                  )}
                  <Punto />
                  <span>{u.tipo_operacion || u.operacion_label}</span>
                  <Punto />
                  <span className="font-medium">{u.instrumento || "—"}</span>
                  {u.mercado && <><Punto /><span className="text-[var(--t-text-dim)]">{u.mercado}</span></>}
                  <Punto />
                  <span className="tabular-nums">{fmtMoneyFull(u.bruto)} {u.moneda}</span>
                  <Punto />
                  <span className="tabular-nums text-[var(--t-text-dim)]">
                    arancel {fmtMoneyFull(u.arancel)}
                  </span>
                  <span className="ml-auto text-[10px] font-mono text-[var(--t-text-muted)]">
                    boleto {u.boleto ?? "—"}{u.es_cierre ? " · cierre" : ""}
                  </span>
                </div>
              ) : (
                <div className="text-[12px] text-[var(--t-text-muted)]">
                  la cuenta no registra boletos — nunca operó
                </div>
              )}
            </Seccion>

            {/* ── 2) ARANCEL MES A MES ────────────────────────────────────── */}
            <Seccion titulo={`Arancel por mes · últimos ${d.meses}`}
              derecha={`total ${fmtMoneyFull(d.totales.arancel)} · ${fmtMoneyFull(d.totales.arancel_por_mes)} por mes · operó ${d.totales.meses_operados} de ${d.meses}`}>
              {/* Una sola serie → sin leyenda: el título dice qué es. El valor
                  exacto va en el hover, no repetido sobre cada barra. */}
              <div className="h-[190px] -ml-2">
                <ResponsiveContainer key={vk} width="100%" height="100%">
                  <BarChart data={d.serie_aranceles} barCategoryGap="22%"
                    margin={{ top: 6, right: 8, bottom: 4, left: 4 }}>
                    <CartesianGrid stroke="var(--t-border)" vertical={false} />
                    <XAxis dataKey="label" tickLine={false}
                      tick={{ fill: "var(--t-text-dim)", fontSize: 10 }}
                      axisLine={{ stroke: "var(--t-border-2)" }} />
                    <YAxis tickLine={false} width={62}
                      tick={{ fill: "var(--t-text-muted)", fontSize: 10 }}
                      axisLine={false}
                      tickFormatter={(v: number) => fmtMoney(v)} />
                    <Tooltip
                      cursor={{ fill: "var(--t-surface)" }}
                      contentStyle={{
                        background: "var(--t-panel)", border: "1px solid var(--t-border-2)",
                        borderRadius: 0, fontSize: 12,
                      }}
                      labelStyle={{ color: "var(--t-text)", fontWeight: 600 }}
                      itemStyle={{ color: "var(--t-text-dim)" }}
                      formatter={(v, _n, item) => {
                        const pto = (item as { payload?: PuntoMes })?.payload;
                        const n = typeof v === "number" ? v : Number(v ?? 0);
                        return [`${fmtMoneyFull(n)} · ${pto?.n_boletos ?? 0} boletos`, "Arancel"];
                      }} />
                    <Bar dataKey="arancel" fill="var(--t-accent)" radius={[3, 3, 0, 0]}
                      maxBarSize={46} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Seccion>

            {/* ── 3) EN QUÉ OPERA — share del volumen ─────────────────────── */}
            <Seccion titulo="En qué opera · share del volumen"
              derecha={`${fmtMoneyFull(d.totales.volumen)} operados en ${d.meses} meses`}>
              {d.share_operacion.length === 0 ? (
                <div className="text-[12px] text-[var(--t-text-muted)]">
                  sin operaciones en la ventana
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {d.share_operacion.map((s) => (
                    <div key={s.operacion ?? s.label}
                      className="grid items-center gap-3 text-[12.5px]"
                      style={{ gridTemplateColumns: "170px 1fr 62px 130px 130px" }}>
                      <span className="truncate" title={s.label}>{s.label}</span>
                      {/* La barra es escala relativa al mayor, para que un 3% se
                          vea; el número exacto está al lado y no se deduce de ella. */}
                      <span className="h-[10px] bg-[var(--t-surface)] block">
                        <span className="h-full bg-[var(--t-accent)] block"
                          style={{ width: `${Math.max(2, (s.pct / maxPct) * 100)}%` }} />
                      </span>
                      <span className="tabular-nums text-right font-semibold">
                        {s.pct.toLocaleString("es-AR", { minimumFractionDigits: 2 })}%
                      </span>
                      <span className="tabular-nums text-right text-[var(--t-text-dim)]"
                        title={`${s.n_boletos} boletos`}>
                        {fmtMoneyFull(s.volumen)}
                      </span>
                      <span className="tabular-nums text-right text-[var(--t-text-dim)]">
                        arancel {fmtMoneyFull(s.arancel)}
                        {/* Un tipo puede dejar arancel SIN volumen propio: todo su
                            arancel vive en el cierre, que el volumen excluye. */}
                        {s.solo_arancel && (
                          <span className="ml-1 text-[var(--t-accent)]"
                            title="Todo su arancel está en el cierre, que no cuenta como volumen">*</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Seccion>

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
  { titulo, derecha, children }:
  { titulo: string; derecha?: string; children: React.ReactNode },
) {
  return (
    <section className="px-4 py-3 border-b border-[var(--t-border)]">
      <div className="flex items-baseline gap-3 mb-2">
        <h3 className="text-[9.5px] uppercase tracking-widest text-[var(--t-accent)] font-semibold">
          {titulo}
        </h3>
        {derecha && (
          <span className="ml-auto text-[10px] tabular-nums text-[var(--t-text-muted)]">
            {derecha}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Punto() { return <span className="text-[var(--t-text-muted)] opacity-50">·</span>; }
