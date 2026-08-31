"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

import { fetchJson } from "@/lib/fetch-json";
import { usePersistedState } from "@/lib/use-persisted-state";
import { useViewportKey } from "@/lib/use-viewport-key";
import { exportToXlsx, timestampSuffix } from "@/lib/xlsx-export";
import type { Filtros } from "./profundidad-clientes-view";

// Tab ALTA DE CUENTAS (dentro de PROFUNDIDAD DE CLIENTES).
//
// El histórico COMPLETO de altas de `clientes.comitentes`. El GRÁFICO ocupa el 100 %
// del alto; la tabla con los mismos números vive detrás de un pill, no partiendo la
// pantalla al medio.
//
// **DOBLE EJE, decidido por el user (2026-08-31) después de plantearle el problema.**
// Las barras del flujo (decenas) y la curva del acumulado (miles) van juntas, con un
// segundo eje Y a la derecha. Lo que hay que saber: en un gráfico de doble eje el
// punto donde una serie "cruza" a la otra lo decide la escala que se eligió, no los
// datos — dos escalas distintas se pueden acomodar para que la curva pase por arriba
// o por abajo de las barras a gusto. Por eso acá:
//
//   · **cada eje lleva el color de SU serie** (izquierda = altas, derecha = acumulado
//     en rojo). Es lo único que impide leer un valor contra la escala equivocada.
//   · **el acumulado lleva su número escrito en cada punto**, así el dato no depende
//     de medirlo contra un eje.
//   · la leyenda está siempre: con dos series, la identidad no puede ser solo el color.
//
// Nada se deriva acá: las barras, el acumulado, el % del total y el rango salen
// del backend, de la misma query.

type Fila = {
  periodo: string; label: string; ini: string; fin: string; en_curso: boolean;
  altas: number; acumulado: number; pct_del_total: number;
};
type Resp = {
  granularidad: Gran; solo_activas: boolean; filas: Fila[];
  total: number; sin_alta: number;
  primera_alta: string | null; ultima_alta: string | null;
  meta: { advertencias: string[] };
};
type Gran = "mes" | "trimestre" | "ano";
type Panel = "grafico" | "tabla";

const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-AR");
const fmtFecha = (iso: string | null) =>
  !iso ? "—" : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const arrQS = (key: string, vals: string[]) =>
  (vals ?? []).map((v) => `&${key}=${encodeURIComponent(v)}`).join("");

function Pills<T extends string>(
  { valor, onChange, opciones }:
  { valor: T; onChange: (v: T) => void; opciones: readonly (readonly [T, string, string?])[] },
) {
  return (
    <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)] shrink-0">
      {opciones.map(([v, t, ayuda]) => (
        <button key={v} onClick={() => onChange(v)} title={ayuda}
          className={"px-2 py-0.5 text-[10px] uppercase tracking-wider " +
            (valor === v ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
              : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function AltaCuentasView(
  { conmutador, ...filtros }: { conmutador: React.ReactNode } & Filtros,
) {
  const f: Filtros = filtros;
  const [gran, setGran] = usePersistedState<Gran>("altas.granularidad", "trimestre");
  // El gráfico ocupa el 100% (pedido del user). La tabla no se borra —es donde los
  // números se leen exactos y se cotejan— pero vive detrás de un click en vez de
  // comerse la mitad del alto.
  const [panel, setPanel] = usePersistedState<Panel>("altas.panel", "grafico");
  // Default: TODAS las comitentes. Una cuenta abierta en 2019 y cerrada en 2022 fue
  // un alta de 2019 — filtrar por estado hace que el pasado se achique cada vez que
  // alguien cierra una cuenta, y un histórico que cambia hacia atrás no sirve.
  const [soloActivas, setSoloActivas] = usePersistedState<boolean>("altas.solo_activas", false);
  const vk = useViewportKey();
  // El <svg> que dibuja recharts: la imagen se arma serializando ESE, no
  // redibujando el gráfico. Dos dibujos del mismo gráfico se separan con el tiempo.
  const graf = useRef<HTMLDivElement>(null);
  const [copia, setCopia] = useState<string | null>(null);

  const qs = arrQS("operador", f.operador) + arrQS("nivel_1", f.nivel1)
    + arrQS("nivel_2", f.nivel2) + arrQS("nivel_3", f.nivel3)
    + arrQS("nivel_4", f.nivel4) + arrQS("nivel_5", f.nivel5)
    + arrQS("referido", f.referido) + arrQS("division", f.division);
  const url = `/api/operaciones/comercial/altas-historico?granularidad=${gran}`
    + `&solo_activas=${soloActivas}${qs}`;

  // La respuesta viaja con la url que la produjo → "cargando" se DERIVA en vez de
  // ser un tercer estado que hay que acordarse de apagar (mismo patrón que Por mes).
  const [res, setRes] = useState<{ url: string; d: Resp | null; err: string | null } | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetchJson<Resp>(url);
        if (vivo) setRes({ url, d: r, err: null });
      } catch (e) {
        if (vivo) setRes({ url, d: null, err: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { vivo = false; };
  }, [url]);

  const fresco = res?.url === url ? res : null;
  const d = fresco?.d ?? res?.d ?? null;
  const err = fresco?.err ?? null;
  const cargando = !fresco;
  const filas = d?.filas ?? [];

  const copiarImagen = async () => {
    // ⚠️ `.recharts-wrapper > svg` — el hijo DIRECTO del wrapper. Los iconitos de
    // la leyenda de recharts también son `<svg>` **y también llevan la clase
    // `recharts-surface`**, así que ni `svg` ni `svg.recharts-surface` alcanzan:
    // con cualquiera de los dos el primero que matchea puede ser el icono, y la
    // imagen sale con un cuadradito de 14px estirado a todo el ancho (pasó).
    const svg = graf.current?.querySelector(".recharts-wrapper > svg");
    if (!svg) return;
    setCopia("…");
    // Import diferido: el módulo solo hace falta al apretar el botón, y así no
    // viaja en el bundle de la vista.
    const { copiarGrafico } = await import("@/lib/grafico-imagen");
    const r = await copiarGrafico({
      svg: svg as SVGSVGElement,
      titulo: "Alta de cuentas",
      fecha: `${gran === "ano" ? "por año" : gran === "trimestre" ? "por trimestre" : "por mes"}`
        + `  ·  ${fmtFecha(d?.primera_alta ?? null)} → ${fmtFecha(d?.ultima_alta ?? null)}`,
      logoUrl: "/logo-login.png",
      archivo: `alta-de-cuentas-${gran}-${timestampSuffix()}.png`,
      // La leyenda de recharts es HTML y NO viaja en el SVG: si no se declara acá,
      // la imagen sale sin leyenda y nadie se entera.
      leyenda: [
        { label: "Altas del período", color: "var(--t-brand)", forma: "barra" },
        { label: "Base acumulada", color: "var(--t-neg)", forma: "linea" },
      ],
      // El contexto viaja con la imagen: sin esto, el que la recibe no sabe si son
      // todas las cuentas o solo las activas, ni cuántas quedaron afuera.
      pie: [
        `${fmtInt(d?.total ?? 0)} altas en total`
        + (soloActivas ? "  ·  SOLO cuentas hoy activas" : "  ·  todas las comitentes"),
        ...(d?.meta.advertencias ?? []),
      ],
    });
    setCopia(r === "copiado" ? "copiado ✓" : r === "descargado" ? "descargado ✓" : "no se pudo");
    setTimeout(() => setCopia(null), 2500);
  };

  const exportar = () => void exportToXlsx({
    filename: `alta-de-cuentas-${gran}-${timestampSuffix()}.xlsx`,
    sheets: [{ name: "Altas", rows: filas, columns: [
      { header: "Período", key: "label", format: "text", width: 12 },
      { header: "Desde", key: "ini", format: "text", width: 12 },
      { header: "Hasta", key: "fin", format: "text", width: 12 },
      { header: "Altas", key: "altas", format: "integer" },
      { header: "Acumulado", key: "acumulado", format: "integer", width: 12 },
      { header: "% del total", key: "pct_del_total", format: "number" },
    ] }],
  });


  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* ── Barra ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border-2)] shrink-0 flex-wrap">
        {conmutador}
        <span className="text-[10px] text-[var(--t-text-dim)]">
          {d ? (
            <>
              <b className="text-[var(--t-text)] tabular-nums">{fmtInt(d.total)}</b> altas
              {" · "}{fmtFecha(d.primera_alta)} → {fmtFecha(d.ultima_alta)}
            </>
          ) : "…"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Pills<Panel> valor={panel} onChange={setPanel} opciones={[
            ["grafico", "Gráfico", "Altas por período + la curva del acumulado"],
            ["tabla", "Tabla", "Los mismos números, exactos, para cotejar"],
          ]} />
          <Pills<Gran> valor={gran} onChange={setGran} opciones={[
            ["mes", "Mes"], ["trimestre", "Trim."], ["ano", "Año"],
          ]} />
          <button
            onClick={() => setSoloActivas(!soloActivas)}
            title={soloActivas
              ? "Contando SOLO las cuentas hoy activas: el pasado se ve más chico de lo que fue."
              : "Contando TODAS las comitentes, cerradas incluidas. Un alta de 2019 sigue siendo un alta de 2019."}
            className={"px-2 py-0.5 text-[10px] uppercase tracking-wider border border-[var(--t-border-2)] " +
              (soloActivas ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>
            Solo activas
          </button>
          {cargando && <span className="text-[9px] text-[var(--t-text-muted)]">cargando…</span>}
          {err && <span className="text-[9px] text-[#ff7777]">{err}</span>}
          {panel === "grafico" && (
            <button onClick={() => void copiarImagen()} disabled={!filas.length}
              title="Copia el gráfico como imagen (con el logo y el contexto) para pegarlo en un mail. Si el navegador no deja copiar, lo descarga."
              className="text-[10px] px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-40">
              {copia ?? "⧉ Copiar imagen"}
            </button>
          )}
          <button onClick={exportar} disabled={!filas.length}
            className="text-[10px] px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-40">
            ↓ XLSX
          </button>
        </div>
      </div>

      {/* ── EL GRÁFICO: 100% del alto ─────────────────────────────────────── */}
      {panel === "grafico" && (
      <div className="flex-1 min-h-0 flex flex-col">
        <div ref={graf} className="flex-1 min-h-0 p-2">
          {!filas.length ? (
            <div className="h-full flex items-center justify-center text-[11px] text-[var(--t-text-muted)]">
              {cargando ? "cargando…" : err ? "no se pudo leer" : "sin altas para mostrar"}
            </div>
          ) : (
            <ResponsiveContainer key={`${vk}-${gran}`} width="100%" height="100%">
              <ComposedChart data={filas} margin={{ top: 20, right: 8, bottom: 4, left: 4 }}>
                <CartesianGrid stroke="var(--t-border)" vertical={false} />
                {/* fontWeight en el tick y no por CSS: recharts lo escribe como
                    atributo del <text>, así viaja en el SVG serializado. Una regla
                    CSS de la app no llega a la imagen. */}
                <XAxis dataKey="label" tick={{ fill: "var(--t-text-dim)", fontSize: 10, fontWeight: 700 }}
                  axisLine={{ stroke: "var(--t-border-2)" }} tickLine={false}
                  interval="preserveStartEnd" minTickGap={8} />
                {/* Cada eje con el COLOR de su serie. Con dos escalas distintas es lo
                    único que impide leer un valor contra la que no le corresponde. */}
                <YAxis yAxisId="altas" tick={{ fill: "var(--t-brand)", fontSize: 10, fontWeight: 700 }} width={44}
                  axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis yAxisId="acum" orientation="right"
                  tick={{ fill: "var(--t-neg)", fontSize: 10, fontWeight: 700 }} width={56}
                  axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "var(--t-surface)", border: "1px solid var(--t-border-2)", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}
                  labelStyle={{ color: "var(--t-text-dim)" }}
                  cursor={{ fill: "color-mix(in srgb, var(--t-text) 8%, transparent)" }}
                  formatter={(v, name, it: { payload?: Fila }) => (
                    name === "Acumulado"
                      ? [`${fmtInt(Number(v))} cuentas`, "Base acumulada"]
                      : [`${fmtInt(Number(v))} altas · ${it?.payload?.pct_del_total ?? 0}% del total`,
                         "Altas del período"])} />
                <Legend verticalAlign="bottom" align="center" height={22}
                  wrapperStyle={{ fontSize: 10, color: "var(--t-text-dim)" }} />
                {/* Punta redondeada arriba, anclada a la línea de base. */}
                <Bar yAxisId="altas" dataKey="altas" name="Altas" fill="var(--t-brand)"
                  isAnimationActive={false} radius={[4, 4, 0, 0]} />
                <Line yAxisId="acum" type="monotone" dataKey="acumulado" name="Acumulado"
                  stroke="var(--t-neg)" strokeWidth={2} isAnimationActive={false}
                  dot={{ r: 2, fill: "var(--t-neg)", strokeWidth: 0 }}>
                  {/* El número escrito en CADA punto: así el acumulado se lee sin
                      medirlo contra el eje derecho, que es la parte frágil de tener
                      dos escalas. Con granularidad mensual y muchos años se pisan —
                      ahí conviene TRIM. o AÑO. */}
                  <LabelList dataKey="acumulado" position="top" offset={8} fontSize={10}
                    fontWeight={700} fill="var(--t-neg)" formatter={(v) => fmtInt(Number(v))} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      )}

      {/* ── LA TABLA: los mismos números, exactos ─────────────────────────── */}
      {panel === "tabla" && (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-[12px]">
            <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)] z-10">
              <tr className="border-b border-[var(--t-border-2)]">
                <th className="px-3 py-2 text-left font-normal w-[22%]">Período</th>
                <th className="px-3 py-2 text-right font-normal"
                  title="Cuentas dadas de alta DENTRO del período.">Altas</th>
                <th className="px-3 py-2 text-right font-normal"
                  title="Base construida hasta el último día del período (la sumatoria).">Acumulado</th>
                <th className="px-3 py-2 text-right font-normal"
                  title="Qué parte de la base total se construyó en este período.">% del total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.periodo} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                  <td className="px-3 py-1.5 whitespace-nowrap" title={`${r.ini} → ${r.fin}`}>
                    <span className="font-semibold">{r.label}</span>
                    {r.en_curso && (
                      <span className="ml-1.5 text-[8px] px-1 border border-[var(--t-accent)] text-[var(--t-accent)] uppercase tracking-wide"
                        title="El período todavía no terminó: pueden entrar más altas.">
                        en curso
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(r.altas)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--t-text-dim)]">{fmtInt(r.acumulado)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--t-text-muted)]">
                    {r.pct_del_total.toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                  </td>
                </tr>
              ))}
              {!filas.length && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-[var(--t-text-muted)] text-[11px]">
                  {cargando ? "cargando…" : err ? "no se pudo leer la tabla" : "sin altas para mostrar"}
                </td></tr>
              )}
            </tbody>
            {!!filas.length && d && (
              <tfoot className="sticky bottom-0 bg-[var(--t-surface)]">
                <tr className="border-t-2 border-[var(--t-border-2)] font-semibold">
                  <td className="px-3 py-1.5">
                    TOTAL
                    <span className="ml-1.5 text-[9px] font-normal text-[var(--t-text-muted)]">
                      {filas.length} períodos
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtInt(d.total)}</td>
                  {/* El acumulado NO se suma: la última fila YA es el total.
                      Sumar la columna daría un número enorme y sin sentido. */}
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--t-text-muted)]"
                    title="No se suma: el acumulado de la última fila ya ES el total.">—</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-[var(--t-text-muted)]">100,0%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {d && (
          <div className="px-3 py-1.5 border-t border-[var(--t-border-2)] bg-[var(--t-surface)] text-[9px] text-[var(--t-text-muted)] shrink-0 space-y-0.5">
            {d.meta.advertencias.map((a) => <div key={a}>⚠ {a}</div>)}
          </div>
        )}
      </div>
      )}

      {/* Las advertencias también bajo el gráfico: en la vista donde MÁS se lee es
          donde no pueden faltar (qué universo se está contando, cuántas cuentas no
          tienen fecha de alta). */}
      {panel === "grafico" && d && (
        <div className="px-3 py-1.5 border-t border-[var(--t-border-2)] bg-[var(--t-surface)] text-[9px] text-[var(--t-text-muted)] shrink-0 space-y-0.5">
          {d.meta.advertencias.map((a) => <div key={a}>⚠ {a}</div>)}
        </div>
      )}
    </div>
  );
}
