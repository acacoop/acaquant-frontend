"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { usePersistedState } from "@/lib/use-persisted-state";

/**
 * Back Office → Tesorería → SALDO AL2.
 *
 * Los movimientos bancarios cuyo BANCO es FERSI SA (`[00001713]`), de los últimos N
 * días (default 60). A diferencia de la tab MOVIMIENTOS —live contra Aunesa, un día
 * por vez— esto lee el HISTÓRICO persistido (`operaciones.tesoreria_movimientos`,
 * lo escribe `jobs.tesoreria_movimientos`): la serie de 60 días implicaría 60
 * llamadas a Aunesa por pantallazo.
 *
 * Layout pedido: mitad izquierda de la pantalla, partida 50/50 — arriba la tabla
 * (con sub-tabs TODAS / FÍSICA / JURÍDICA), abajo el gráfico de la sumatoria
 * (barras = neto del día, línea = acumulado).
 *
 * Las monedas NO se mezclan: el selector ARS/USD filtra antes de sumar.
 */

type Mov = {
  id: string; fecha: string; hora: string | null; tipo: string | null;
  monto: number; unidad: string | null; estado: string | null;
  cuenta: string | null; cuenta_operativa: string | null; riel: string | null;
  persona: string | null; persona_tipo: string | null;
  persona_doc: string | null; persona_cuit: string | null;
};
type Punto = {
  fecha: string; ingresos: number; egresos: number; neto: number; acumulado: number; n: number;
};
type Resp = {
  banco_codigo: string; desde: string; hasta: string; dias: number;
  unidades: string[]; movimientos: Mov[]; n: number; serie: Punto[];
  resumen: { ingresos: number; egresos: number; neto: number; n: number };
  actualizado_at: string;
};

type Persona = "todas" | "fisica" | "juridica";

const PERSONAS: { k: Persona; label: string }[] = [
  { k: "todas", label: "todas" },
  { k: "fisica", label: "física" },
  { k: "juridica", label: "jurídica" },
];
const VENTANAS = [30, 60, 90] as const;

const fmt = (v: number) =>
  v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (v: number) => v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const signo = (v: number) => (v >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]");

export function TesoreriaAl2() {
  const [persona, setPersona] = usePersistedState<Persona>("tes.al2.persona", "todas");
  const [unidad, setUnidad] = usePersistedState("tes.al2.unidad", "ARS");
  const [dias, setDias] = usePersistedState<number>("tes.al2.dias", 60);
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async () => {
    setLoading(true);
    const url = `/api/back-office/tesoreria/al2?dias=${dias}&persona=${persona}`
      + `&unidad=${encodeURIComponent(unidad)}`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      const txt = await r.text();
      let body: unknown = null;
      try { body = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!alive.current) return;
      if (!r.ok) {
        const o = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
        setErr(String(o.error ?? o.detail ?? `HTTP ${r.status} — ${txt.slice(0, 200)}`));
      } else {
        setErr(null); setData(body as Resp);
      }
    } catch (e) {
      if (alive.current) setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [dias, persona, unidad]);

  useEffect(() => { cargar(); }, [cargar]);

  const movs = data?.movimientos ?? [];
  const serie = useMemo(
    () => (data?.serie ?? []).map((p) => ({ ...p, dia: ddmm(p.fecha) })),
    [data],
  );
  const unidades = data?.unidades?.length ? data.unidades : ["ARS"];
  const res = data?.resumen;

  return (
    <div className="flex-1 min-h-0 p-3">
      {/* La vista ocupa la MITAD izquierda; adentro, 50% tabla / 50% gráfico. */}
      <div className="h-full min-h-0 w-1/2 grid grid-rows-2 gap-3">
        {/* ARRIBA — tabla de movimientos del banco AL2 */}
        <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
          <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-[var(--t-text)]">SALDO AL2</span>
            <span className="text-[9px] text-[var(--t-text-muted)]">
              FERSI SA {data ? `· ${data.desde} → ${data.hasta}` : ""}
            </span>
            <div className="ml-auto flex items-center gap-1">
              {VENTANAS.map((d) => (
                <button key={d} onClick={() => setDias(d)}
                  className={"px-1.5 py-0.5 text-[9px] font-semibold border " + (dias === d
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                    : "text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]")}>
                  {d}d
                </button>
              ))}
              <span className="w-px h-3 bg-[var(--t-border)] mx-1" />
              {unidades.map((u) => (
                <button key={u} onClick={() => setUnidad(u)}
                  className={"px-1.5 py-0.5 text-[9px] font-semibold border " + (unidad === u
                    ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                    : "text-[var(--t-text-muted)] border-[var(--t-border-2)] hover:text-[var(--t-accent)]")}>
                  {u}
                </button>
              ))}
              <button onClick={cargar}
                className="ml-1 text-[9px] uppercase text-[var(--t-accent)] hover:underline">refrescar</button>
            </div>
          </div>

          {/* Sub-tabs de tipo de persona */}
          <div className="shrink-0 px-3 py-1 border-b border-[var(--t-border)] flex items-center gap-1">
            {PERSONAS.map((p) => (
              <button key={p.k} onClick={() => setPersona(p.k)}
                className={"px-2 py-0.5 text-[10px] uppercase tracking-widest font-semibold border " +
                  (persona === p.k
                    ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                    : "border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]")}>
                {p.label}
              </button>
            ))}
            <span className="ml-auto flex items-center gap-3 text-[10px] tabular-nums">
              <span className="text-[var(--t-pos)]">+{fmt(res?.ingresos ?? 0)}</span>
              <span className="text-[var(--t-neg)]">−{fmt(res?.egresos ?? 0)}</span>
              <span className={"font-semibold " + signo(res?.neto ?? 0)}>
                neto {fmt(res?.neto ?? 0)}
              </span>
              <span className="text-[9px] text-[var(--t-text-muted)]">{data?.n ?? 0} mov.</span>
            </span>
          </div>

          {err && (
            <div className="mx-3 mt-2 px-2 py-1.5 border border-[var(--t-neg)] bg-[var(--t-neg)]/10 text-[10px] text-[var(--t-neg)] shrink-0">
              {err}
              <div className="text-[9px] text-[var(--t-text-dim)] mt-0.5">
                Si menciona `tesoreria_movimientos`, falta correr `scripts.apply_schema` +
                el backfill `python -m jobs.tesoreria_movimientos --dias 60`.
              </div>
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-[10px] tabular-nums whitespace-nowrap">
              <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)] z-10">
                <tr className="border-b border-[var(--t-border)] text-left">
                  <th className="px-2 py-1">Fecha</th>
                  <th className="px-2 py-1">Hora</th>
                  <th className="px-2 py-1">Tipo</th>
                  <th className="px-2 py-1 text-right">Monto</th>
                  <th className="px-2 py-1">Cliente</th>
                  <th className="px-2 py-1">Pers.</th>
                  <th className="px-2 py-1">Cuenta</th>
                  <th className="px-2 py-1">Estado</th>
                </tr>
              </thead>
              <tbody>
                {movs.map((m) => (
                  <tr key={m.id} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    <td className="px-2 py-0.5 font-mono">{ddmm(m.fecha)}</td>
                    <td className="px-2 py-0.5 font-mono text-[var(--t-text-dim)]">{m.hora ?? "—"}</td>
                    <td className={"px-2 py-0.5 " + (m.tipo === "ingreso" ? "text-[var(--t-pos)]" : m.tipo === "egreso" ? "text-[var(--t-neg)]" : "")}>
                      {m.tipo ?? "—"}
                    </td>
                    <td className="px-2 py-0.5 text-right font-mono">{fmt(m.monto)}</td>
                    <td className="px-2 py-0.5 text-[var(--t-text-dim)] max-w-[200px] truncate" title={m.persona ?? ""}>
                      {m.persona ?? "—"}
                    </td>
                    <td className="px-2 py-0.5 text-[var(--t-text-muted)]">{m.persona_tipo ?? "—"}</td>
                    <td className="px-2 py-0.5 text-[var(--t-text-dim)]">{m.cuenta ?? "—"}</td>
                    <td className="px-2 py-0.5 text-[var(--t-text-muted)]">{m.estado ?? "—"}</td>
                  </tr>
                ))}
                {movs.length === 0 && !loading && !err && (
                  <tr><td colSpan={8} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                    sin movimientos de FERSI SA en la ventana
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ABAJO — sumatoria: neto por día (barras) + acumulado (línea) */}
        <div className="flex flex-col min-h-0 border border-[var(--t-border-2)] bg-[var(--t-panel)] overflow-hidden">
          <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[var(--t-text)]">SUMATORIA</span>
            <span className="text-[9px] text-[var(--t-text-muted)]">
              neto por día · acumulado en {unidad}
            </span>
            <span className={"ml-auto text-[11px] font-semibold tabular-nums " + signo(res?.neto ?? 0)}>
              {fmt(serie.length ? serie[serie.length - 1].acumulado : 0)}
            </span>
          </div>
          <div className="flex-1 min-h-0 p-2">
            {serie.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[10px] text-[var(--t-text-muted)]">
                sin datos para graficar
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--t-border)" />
                  <XAxis dataKey="dia" tick={{ fontSize: 9 }} />
                  <YAxis yAxisId="neto" tick={{ fontSize: 9 }} tickFormatter={fmt0} width={70} />
                  <YAxis yAxisId="acum" orientation="right" tick={{ fontSize: 9 }}
                    tickFormatter={fmt0} width={70} />
                  <Tooltip
                    formatter={(v, name) => [fmt(Number(v)), String(name)]}
                    contentStyle={{ fontSize: 10, background: "var(--t-panel)", border: "1px solid var(--t-border)" }} />
                  <Legend wrapperStyle={{ fontSize: 9 }} />
                  <Bar yAxisId="neto" dataKey="neto" name="neto del día">
                    {serie.map((p, i) => (
                      <Cell key={i} fill={p.neto < 0 ? "var(--t-neg)" : "var(--t-pos)"} />
                    ))}
                  </Bar>
                  <Line yAxisId="acum" type="monotone" dataKey="acumulado" name="acumulado"
                    stroke="var(--t-accent)" strokeWidth={1.5} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
