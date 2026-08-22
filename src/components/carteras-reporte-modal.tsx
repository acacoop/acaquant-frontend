"use client";

// REPORTE DE CARTERA — el informe como documento, hoja por hoja.
//
// Mismo formato que el REPORTE FIN DE DÍA de Interbanking: se abre un modal y ya
// ves lo que va a salir, con el azul de la casa y el logo arriba de cada hoja.
// La diferencia es que acá el documento tiene VARIAS páginas, así que el modal
// las muestra apiladas —una debajo de la otra, con el marco de la hoja a la
// vista— en vez de una sola tabla.
//
// ⚠️ **Sale del MISMO payload que la pantalla** (`/api/valuaciones/{id}/vista`),
// que ya viene con todo calculado del backend. No recalcula nada y no vuelve a
// consultar: si el reporte armara sus propios números, sería una tercera versión
// de la verdad y el día que difiera nadie se entera. Lo único que pide aparte es
// la serie mensual de la hoja EVOLUCIÓN, que la pantalla tiene en otra tab.
//
// El PDF es **la impresión del navegador**, no una librería: `window.print()` con
// las reglas de `@media print` que van más abajo. Tres motivos concretos —
// cualquier lib de PDF es una dependencia grande para un botón, ninguna
// reproduce el CSS de esta app (variables, grid, temas) sin sorpresas, y el
// resultado de imprimir ES lo que se ve en el modal porque es el mismo DOM. El
// usuario elige "Guardar como PDF" en el diálogo del navegador.
//
// Las reglas de impresión viven acá adentro y no en `globals.css` a propósito:
// solo existen mientras el modal está abierto, así no hay forma de que alguien
// imprima otra pantalla y se encuentre con el CSS del reporte.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Cell, Pie, PieChart } from "recharts";

import { fetchJson } from "@/lib/fetch-json";
import { fmtFechaCorta, MESES_CORTOS } from "@/lib/fmt";
import { carteraColor } from "@/lib/carteras";
import { fmt0, fmt2, fmtPct } from "./ui/informe";

// El azul de la casa. Va literal y no como variable de tema: el reporte se
// imprime y se manda hacia afuera, así que no puede cambiar de color según cómo
// tenga la app el que lo genera.
const AZUL = "#094293";
const FIRMA = "Hecho en ACAQuant";

type Monto = { monto: number; monto_usd: number | null; ponderacion: number | null };
type Fila = { clave: string; monto: number; monto_usd: number | null; n: number; share: number | null };

/** Lo que el reporte necesita de la vista. Es un subconjunto del contrato de
 *  `/vista`: se declara acá para que el modal no dependa de campos que no usa. */
export type DatosReporte = {
  fecha: string | null;
  mep: number | null;
  a3500: number | null;
  historico: boolean;
  resumen: {
    actual: {
      fecha: string | null; mep: number | null; a3500: number | null;
      valuacion_ars: number; valuacion_usd: number | null; valuacion_a3500: number | null;
      carteras: (Monto & { cartera: string; label: string })[];
      otras_carteras: Monto | null;
      total_dolarizado: Monto; total_pesos: Monto;
      sin_clasificar: Monto & { claves: string[] };
      n_activos: number;
    };
    anterior: { fecha: string | null; valuacion_ars: number;
                carteras: (Monto & { cartera: string; label: string })[] } | null;
  };
  detalle: {
    bloques: {
      cartera: string; label: string; total: number; total_usd: number | null;
      ponderacion: number | null;
      filas: {
        unidad: string; ticker: string; emisor: string; calificacion: string;
        clase_activo: string; vencimiento: string | null;
        cantidad: number; precio: number; valuacion: number;
        share_cartera: number | null;
      }[];
    }[];
  };
  metricas: {
    total: number;
    por_clase: { cartera: string; label: string; total: number;
                 ponderacion: number | null; filas: Fila[] }[];
    por_emisor: Fila[]; por_calificacion: Fila[];
  };
};

type MesResumen = {
  mes: string; ultimo_dia: string; valuacion_cierre: number;
  flujo_neto: number; delta_real: number | null;
  tem_periodo: number | null; twr_base100: number;
};

/**
 * `805` + `"[805] MOLLO NICOLAS EZEQUIEL"` → `"805 · MOLLO NICOLAS EZEQUIEL"`.
 *
 * La denominación que manda Aunesa YA TRAE el número de comitente adelante,
 * entre corchetes. Concatenarla con el id daba «805 · [805] MOLLO NICOLAS
 * EZEQUIEL» en la cabecera de todas las hojas. Se saca el prefijo en vez de
 * dejar de mostrar el id, porque el id es lo que la mesa usa para identificar la
 * cuenta y el nombre solo no alcanza (hay homónimos).
 */
export function tituloCuenta(idCuenta: string, nombre?: string): string {
  const limpio = (nombre || "").replace(/^\s*\[[^\]]*\]\s*/, "").trim();
  return limpio ? `${idCuenta} · ${limpio}` : idCuenta;
}

const mesLargo = (m: string) => {
  const [y, mm] = (m || "").split("-");
  return y && mm ? `${MESES_CORTOS[Number(mm) - 1] ?? mm} ${y.slice(2)}` : "—";
};

// ── Cuántas carteras entran en una hoja ────────────────────────────────────
//
// **El problema que resuelve.** La primera versión imprimía UNA HOJA POR
// CARTERA. Con la cartera típica —tres o cuatro carteras de pocos títulos— eso
// da cuatro hojas con dos renglones cada una y el resto en blanco. Y al revés,
// una cartera de 200 títulos igual iba a una hoja sola y la partía el navegador
// donde le quedaba cómodo, sin repetir de qué cartera era la continuación.
//
// **La escala.** No se cuenta en carteras ni en hojas: se cuenta en RENGLONES,
// que es lo único que escala igual para una cuenta con 5 títulos y para una con
// 300. La hoja tiene `CAPACIDAD` renglones útiles y cada cartera cuesta sus
// filas más `ALTO_CABECERA` (su título y el encabezado de la tabla). Las
// carteras se van metiendo EN ORDEN —el orden es por monto y decirlo distinto
// que la pantalla sería otro informe— y se abre hoja nueva recién cuando no
// entra nada más.
//
// **Cuándo se parte una cartera.** Si no entra entera pero en la hoja quedan al
// menos `CORTE_MINIMO` renglones, se corta: entra lo que entra y sigue en la
// hoja siguiente marcada «(cont.)». Ese mínimo existe para no dejar el título de
// una cartera con dos filas colgando al pie de una hoja, que se lee peor que
// empezarla limpia en la próxima.
//
// Los dos números están CALIBRADOS contra el PDF real (se genera y se cuentan
// páginas), no estimados: ver la nota de `Hoja` sobre el alto útil.

/**
 * Renglones de tabla que entran en una hoja A4 apaisada, debajo de la cabecera
 * azul y arriba del pie.
 *
 * **MEDIDO, no estimado.** Se generó el PDF con una cartera de N títulos y se
 * contaron sus páginas contra la cantidad de hojas del modal: con 38 renglones
 * las dos cifras coinciden y con 42 aparece una página de más (una hoja se
 * desborda). Queda en 36 —dos menos que el máximo que entra— como margen para
 * una fila más alta de lo normal: un emisor largo, un ticker de FCI con el
 * nombre completo del fondo.
 *
 * Si algún día se cambia el tamaño de letra de la tabla o el alto de la
 * cabecera, este número hay que volver a medirlo: no se deduce del CSS.
 */
const CAPACIDAD = 36;
/** Lo que cuesta abrir una cartera DENTRO de la hoja: su renglón gris de título
 *  (más el aire que lo separa de la cartera anterior). Bajó de 3 a 2 el
 *  2026-08-22, cuando el encabezado de columnas dejó de repetirse por cartera y
 *  pasó a ir UNA vez por hoja — ver `FILA_ENCABEZADO`. */
const ALTO_CABECERA = 2;
/** Lo que cuesta el encabezado de columnas de la hoja: va una sola vez arriba. */
const FILA_ENCABEZADO = 1;
/** Menos renglones libres que esto y la cartera arranca en la hoja siguiente. */
const CORTE_MINIMO = 5;

type BloqueActivos = DatosReporte["detalle"]["bloques"][number];
type ParteHoja = { bloque: BloqueActivos; filas: BloqueActivos["filas"]; desde: number; cont: boolean };
export type HojaActivos = { partes: ParteHoja[] };

export function paginarActivos(bloques: BloqueActivos[]): HojaActivos[] {
  const hojas: HojaActivos[] = [];
  let actual: ParteHoja[] = [];
  let libre = CAPACIDAD - FILA_ENCABEZADO;

  const cerrar = () => {
    if (actual.length) hojas.push({ partes: actual });
    actual = [];
    libre = CAPACIDAD - FILA_ENCABEZADO;
  };

  for (const b of bloques) {
    if (!b.filas.length) continue;      // una cartera vacía no abre cuadro
    let i = 0;
    let cont = false;
    while (i < b.filas.length) {
      const cabenAca = libre - ALTO_CABECERA;
      // No entra ni el título con unas pocas filas → hoja nueva.
      if (cabenAca < CORTE_MINIMO) {
        cerrar();
        continue;
      }
      const n = Math.min(b.filas.length - i, cabenAca);
      actual.push({ bloque: b, filas: b.filas.slice(i, i + n), desde: i, cont });
      libre -= ALTO_CABECERA + n;
      i += n;
      cont = true;                       // lo que siga de ESTA cartera va marcado
      if (i < b.filas.length) cerrar();  // quedó cola: sigue en la próxima hoja
    }
  }
  cerrar();
  return hojas;
}

// ── El modal ───────────────────────────────────────────────────────────────

export function CarterasReporteModal({ datos, idCuenta, nombreCuenta, onCerrar }: {
  datos: DatosReporte; idCuenta: string; nombreCuenta?: string; onCerrar: () => void;
}) {
  const [meses, setMeses] = useState<MesResumen[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  // La hoja EVOLUCIÓN es lo único que el payload de la vista no trae (vive en
  // otra tab). Se pide al abrir el modal, una sola vez. Si falla, la hoja dice
  // que no se pudo y el resto del reporte sale igual: un informe incompleto es
  // mejor que ningún informe, siempre que se vea cuál es el pedazo que falta.
  useEffect(() => {
    let vivo = true;
    fetchJson<{ meses: MesResumen[] }>(
      `/api/valuaciones/${encodeURIComponent(idCuenta)}/mensual`)
      .then((d) => { if (vivo) setMeses(d.meses || []); })
      .catch(() => { if (vivo) setMeses([]); });
    return () => { vivo = false; };
  }, [idCuenta]);

  const a = datos.resumen.actual;
  const titulo = tituloCuenta(idCuenta, nombreCuenta);
  const fecha = fmtFechaCorta(datos.fecha);

  const hojas = useMemo(() => paginarActivos(datos.detalle.bloques), [datos]);

  // ⚠️ **Portal a `<body>`, y no es cosmético: sin esto el PDF sale de UNA
  // página.** El modal se renderiza adentro de la vista, que cuelga de un
  // `<main class="overflow-hidden">` dentro de un `body` de alto fijo. Al
  // imprimir, un ancestro con `overflow:hidden` RECORTA todo lo que pase de la
  // primera pantalla y el navegador no pagina nada. Medido: 6 hojas en el modal
  // → 1 página en el PDF. Colgado de `body`, las reglas de `@media print` pueden
  // apagar a sus hermanos y el documento pagina solo.
  return createPortal(
    <div className="reporte-overlay fixed inset-0 z-[60] bg-black/60 flex items-start justify-center p-2 overflow-auto"
         onClick={onCerrar}>
      <style>{CSS_IMPRESION}</style>
      <div onClick={(e) => e.stopPropagation()}
           className="my-2 flex flex-col items-center gap-3" id="reporte-imprimible">

        {/* Barra del modal — NO sale impresa */}
        <div className="no-imprimir sticky top-0 z-10 w-full max-w-[297mm] flex items-center gap-3 px-3 py-2 text-white"
             style={{ background: AZUL }}>
          <span className="text-[12px] font-semibold tracking-wide uppercase">Reporte de cartera</span>
          <span className="text-[12px] text-white/80">{titulo} · {fecha}</span>
          <button onClick={() => window.print()}
                  className="ml-auto px-2 py-0.5 text-[11px] uppercase tracking-wide border border-white/40 hover:bg-white/10"
                  title="Abre el diálogo de impresión — elegí «Guardar como PDF»">
            Imprimir / PDF
          </button>
          <button onClick={onCerrar} className="px-2 py-0.5 text-white/80 hover:text-white hover:bg-white/10"
                  title="Cerrar (Esc)">✕</button>
        </div>

        <Hoja n={1} titulo="Resumen ejecutivo" cuenta={titulo} fecha={fecha}>
          <div className="grid grid-cols-4 border border-neutral-300 divide-x divide-neutral-300 mb-4">
            <DatoHoja label="Posición al" valor={fmtFechaCorta(a.fecha)} sub={`${a.n_activos} títulos`} />
            <DatoHoja label="Valuación ARS" valor={fmt0(a.valuacion_ars)} />
            <DatoHoja label="Valuación USD" valor={fmt0(a.valuacion_usd)}
                      sub={a.mep ? `MEP ${fmt2(a.mep)}` : "sin MEP"} />
            <DatoHoja label="Valuación oficial" valor={fmt0(a.valuacion_a3500)}
                      sub={a.a3500 ? `A3500 ${fmt2(a.a3500)}` : "sin A3500"} />
          </div>

          {/* Mismo reparto que la pantalla: la torta a la izquierda y los dos
              cuadros apilados a la derecha. El informe impreso y el de la
              pantalla tienen que verse como el mismo documento — si no, el que
              lo recibe no puede seguirlo mientras alguien se lo explica sobre la
              app. */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <TituloBloque>Composición al {fmtFechaCorta(a.fecha)}</TituloBloque>
              <TortaCarteras carteras={a.carteras} />
            </div>

            <div className="flex flex-col gap-4">
            <div>
              <TituloBloque>Composición por cartera</TituloBloque>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-[8px] uppercase text-neutral-500 border-b border-neutral-300">
                    <th className="text-left py-1">Cartera</th>
                    <th className="text-right py-1">Monto ARS</th>
                    <th className="text-right py-1 w-16">Ponder.</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {a.carteras.map((c, i) => (
                    <tr key={c.cartera} className="border-b border-neutral-200">
                      <td className="py-1">
                        <span className="inline-block w-2 h-2 mr-2 align-middle"
                              style={{ background: carteraColor(c.cartera, i) }} />
                        {c.label}
                      </td>
                      <td className="text-right py-1">{fmt0(c.monto)}</td>
                      <td className="text-right py-1 text-neutral-500">{fmtPct(c.ponderacion)}</td>
                    </tr>
                  ))}
                  {a.otras_carteras && (
                    <tr className="border-b border-neutral-200">
                      <td className="py-1">Otras</td>
                      <td className="text-right py-1">{fmt0(a.otras_carteras.monto)}</td>
                      <td className="text-right py-1 text-neutral-500">{fmtPct(a.otras_carteras.ponderacion)}</td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-neutral-400 font-semibold">
                    <td className="py-1">Total Dolarizado</td>
                    <td className="text-right py-1">{fmt0(a.total_dolarizado.monto)}</td>
                    <td className="text-right py-1">{fmtPct(a.total_dolarizado.ponderacion)}</td>
                  </tr>
                  <tr className="font-semibold border-b border-neutral-200">
                    <td className="py-1">Total Pesos</td>
                    <td className="text-right py-1">{fmt0(a.total_pesos.monto)}</td>
                    <td className="text-right py-1">{fmtPct(a.total_pesos.ponderacion)}</td>
                  </tr>
                  {a.sin_clasificar.monto !== 0 && (
                    <tr>
                      <td className="py-1 text-amber-700">Sin clasificar</td>
                      <td className="text-right py-1 text-amber-700">{fmt0(a.sin_clasificar.monto)}</td>
                      <td className="text-right py-1 text-amber-700">{fmtPct(a.sin_clasificar.ponderacion)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <TituloBloque>
                {datos.resumen.anterior
                  ? `Cierre anterior · ${fmtFechaCorta(datos.resumen.anterior.fecha)}`
                  : "Cierre anterior"}
              </TituloBloque>
              {datos.resumen.anterior ? (
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-[8px] uppercase text-neutral-500 border-b border-neutral-300">
                      <th className="text-left py-1">Cartera</th>
                      <th className="text-right py-1">Monto ARS</th>
                      <th className="text-right py-1 w-16">Ponder.</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {datos.resumen.anterior.carteras.map((c) => (
                      <tr key={c.cartera} className="border-b border-neutral-200">
                        <td className="py-1">{c.label}</td>
                        <td className="text-right py-1">{fmt0(c.monto)}</td>
                        <td className="text-right py-1 text-neutral-500">{fmtPct(c.ponderacion)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-neutral-400 font-semibold">
                      <td className="py-1">Total</td>
                      <td className="text-right py-1">{fmt0(datos.resumen.anterior.valuacion_ars)}</td>
                      <td className="text-right py-1">100,0%</td>
                    </tr>
                  </tbody>
                </table>
              ) : (
                <p className="text-[10px] text-neutral-500">
                  No hay un cierre de mes anterior para comparar.
                </p>
              )}
            </div>
            </div>
          </div>
        </Hoja>

        {hojas.map((hoja, i) => (
          <Hoja key={i} n={2 + i}
                titulo={`Activos${hojas.length > 1 ? ` (${i + 1}/${hojas.length})` : ""}`}
                cuenta={titulo} fecha={fecha}>
            {/* UNA tabla por hoja: los nombres de columna van una sola vez
                arriba y cada cartera es un renglón gris a todo el ancho. Antes
                cada cartera repetía su propio encabezado — con seis carteras eso
                es seis veces la misma línea, y lo que se repite deja de leerse.
                De yapa las columnas quedan alineadas de punta a punta de la
                hoja, así se comparan dos títulos de carteras distintas sin
                mover la vista. */}
            <table className="w-full text-[9px]">
              {/* ⚠️ El azul va en cada `th` y NO en el `tr`: `globals.css` le pone
                  a todo `th` un `background-color` propio y ese fondo pinta
                  ENCIMA del de la fila — puesto en el `tr`, la barra salía gris
                  con el texto en azul en vez del azul de la casa en blanco. */}
              <thead>
                <tr className="text-[8px] uppercase tracking-wide">
                  {["Ticker", "Emisor", "Calif.", "Clase", "Venc.",
                    "Cantidad", "Precio", "Valuación", "% Cart."].map((c, k) => (
                    <th key={c}
                        className={`px-2 py-1 ${k <= 1 ? "text-left" : k <= 4 ? "text-center" : "text-right"}`}
                        style={{ background: AZUL, color: "#fff",
                                 printColorAdjust: "exact",
                                 WebkitPrintColorAdjust: "exact" } as React.CSSProperties}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              {hoja.partes.map((parte) => (
                <tbody key={`${parte.bloque.cartera}-${parte.desde}`} className="tabular-nums">
                  {/* El total va en CELDAS de la tabla y no en un `colSpan` con
                      flex: con flex cae donde lo deja el layout, no en la
                      columna VALUACIÓN, y queda descalzado de los títulos de
                      abajo — que es todo el punto de tener una sola tabla. */}
                  <tr style={{ printColorAdjust: "exact",
                               WebkitPrintColorAdjust: "exact" } as React.CSSProperties}>
                    <td colSpan={7} className="px-2 py-1 bg-neutral-100 border-y border-neutral-300">
                      <span className="text-[10px] font-semibold" style={{ color: AZUL }}>
                        {parte.bloque.label}
                        {parte.cont && <span className="font-normal text-neutral-500"> (cont.)</span>}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right font-semibold bg-neutral-100 border-y border-neutral-300">
                      {fmt0(parte.bloque.total)}
                    </td>
                    <td className="px-2 py-1 text-right text-neutral-500 bg-neutral-100 border-y border-neutral-300">
                      {fmtPct(parte.bloque.ponderacion)}
                    </td>
                  </tr>
                  {parte.filas.map((f) => (
                    <tr key={f.unidad} className="border-b border-neutral-200">
                      <td className="px-2 py-0.5">{f.ticker}</td>
                      <td className="px-2 py-0.5 text-neutral-600">{f.emisor}</td>
                      <td className="px-2 py-0.5 text-center text-neutral-600">{f.calificacion}</td>
                      <td className="px-2 py-0.5 text-center text-neutral-600">{f.clase_activo}</td>
                      <td className="px-2 py-0.5 text-center text-neutral-600">
                        {f.vencimiento ? fmtFechaCorta(f.vencimiento) : "—"}
                      </td>
                      <td className="px-2 py-0.5 text-right">{fmt2(f.cantidad, 2)}</td>
                      <td className="px-2 py-0.5 text-right">{fmt2(f.precio, 2)}</td>
                      <td className="px-2 py-0.5 text-right">{fmt0(f.valuacion)}</td>
                      <td className="px-2 py-0.5 text-right text-neutral-500">{fmtPct(f.share_cartera)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </Hoja>
        ))}

        <Hoja n={2 + hojas.length} titulo="Métricas" cuenta={titulo} fecha={fecha}>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <TituloBloque>Por clase de activo</TituloBloque>
              {/* Mismo criterio que la pantalla: cada cartera es un bloque con
                  aire alrededor, y la que tiene UNA sola clase se colapsa en un
                  renglón — repetir la misma cifra dos veces («Cartera HD» y
                  debajo «HD 100,0%») es lo que hacía dudar de si eran dos cosas
                  distintas. */}
              {datos.metricas.por_clase.filter((b) => b.filas.length).map((b) => {
                const unica = b.filas.length === 1 ? b.filas[0] : null;
                return (
                  <div key={b.cartera} className="mb-3">
                    <div className="flex items-baseline gap-2 text-[9px] font-semibold border-b border-neutral-400 py-0.5">
                      <span>{b.label}</span>
                      {unica && (
                        <span className="font-normal text-neutral-500">
                          · {etiquetaHoja(unica.clave, "Sin clase")}
                        </span>
                      )}
                      <span className="ml-auto tabular-nums">{fmt0(b.total)}</span>
                      <span className="w-10 text-right tabular-nums text-neutral-500">
                        {fmtPct(b.ponderacion)}
                      </span>
                    </div>
                    {!unica && <TablaHoja filas={b.filas} vacio="Sin clase" sangria />}
                  </div>
                );
              })}
            </div>
            <div>
              <TituloBloque>Por emisor</TituloBloque>
              <TablaHoja filas={datos.metricas.por_emisor} vacio="Sin emisor" />
            </div>
            <div>
              <TituloBloque>Por calificación</TituloBloque>
              <TablaHoja filas={datos.metricas.por_calificacion} vacio="Sin calificación" />
            </div>
          </div>
        </Hoja>

        <Hoja n={3 + hojas.length} titulo="Evolución" cuenta={titulo} fecha={fecha}>
          <TituloBloque>Cierre mensual</TituloBloque>
          {meses === null ? (
            <p className="text-[10px] text-neutral-500">Cargando la serie mensual…</p>
          ) : meses.length === 0 ? (
            <p className="text-[10px] text-neutral-500">
              No se pudo traer la serie mensual de esta cuenta.
            </p>
          ) : (
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-[8px] uppercase text-neutral-500 border-b border-neutral-300">
                  <th className="text-left py-1">Mes</th>
                  <th className="text-right py-1">Cierre</th>
                  <th className="text-right py-1">Flujo neto</th>
                  <th className="text-right py-1">Δ real</th>
                  <th className="text-right py-1">TEM</th>
                  <th className="text-right py-1">Base 100</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {meses.slice(0, 14).map((m) => (
                  <tr key={m.mes} className="border-b border-neutral-200">
                    <td className="py-1">{mesLargo(m.mes)}</td>
                    <td className="text-right py-1">{fmt0(m.valuacion_cierre)}</td>
                    <td className="text-right py-1">{fmt0(m.flujo_neto)}</td>
                    <td className="text-right py-1">{fmt0(m.delta_real)}</td>
                    <td className="text-right py-1">{fmtPct(m.tem_periodo, 2)}</td>
                    <td className="text-right py-1">{fmt2(m.twr_base100, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Hoja>
      </div>
    </div>,
    document.body,
  );
}

// ── Piezas de la hoja ──────────────────────────────────────────────────────

/**
 * Una hoja A4 apaisada. **Siempre en claro**, con colores literales y no
 * variables de tema: esto se imprime y se manda hacia afuera, así que no puede
 * salir con fondo negro porque quien lo generó tenía la app en oscuro.
 *
 * `min-height` y no `height`: una cartera con muchos títulos crece y el
 * navegador la parte sola al imprimir. Forzar el alto la recortaría en silencio,
 * que es la peor forma de perder datos en un informe.
 */
function Hoja({ n, titulo, cuenta, fecha, children }: {
  n: number; titulo: string; cuenta: string; fecha: string; children: React.ReactNode;
}) {
  return (
    // 205mm y no 210: el alto ÚTIL de un A4 apaisado es 210mm justos, así que
    // pedir 210 hace que cualquier redondeo (un borde, el padding del pie)
    // empuje unos píxeles a una segunda página y el PDF salga con hojas en
    // blanco intercaladas. Medido: con 210mm, 6 hojas daban 7 páginas.
    <section className="hoja sin-marca-de-agua bg-white text-neutral-900 shadow-lg"
             style={{ width: "297mm", minHeight: "205mm",
                      printColorAdjust: "exact",
                      WebkitPrintColorAdjust: "exact" } as React.CSSProperties}>
      {/* ⚠️ `printColorAdjust: exact` NO es decorativo: sin eso el navegador
          imprime SIN fondos salvo que el usuario tilde «Gráficos de fondo» en el
          diálogo, y nadie lo tilda. Sin fondo, la barra azul desaparece y el
          texto blanco queda blanco sobre blanco — la hoja sale con el título
          fantasma y sin logo, que es exactamente como salió el primer PDF. */}
      <header className="flex items-center gap-3 px-6 py-3 text-white"
              style={{ background: AZUL, printColorAdjust: "exact",
                       WebkitPrintColorAdjust: "exact" } as React.CSSProperties}>
        {/* eslint-disable-next-line @next/next/no-img-element -- se imprime; el
            wrapper de next/image complica el layout de la hoja */}
        <img src="/logo-login.png" alt="ACA Valores" className="h-7 w-auto" />
        <div className="h-5 w-px bg-white/25" />
        <span className="text-[13px] font-semibold tracking-wide uppercase">{titulo}</span>
        <span className="ml-auto text-[11px] text-white/85">{cuenta}</span>
        <span className="text-[11px] text-white/85">{fecha}</span>
      </header>
      <div className="px-6 py-4">{children}</div>
      <footer className="px-6 pb-3 pt-1 flex items-baseline text-[8px] text-neutral-400">
        <span>{FIRMA}</span>
        <span className="ml-auto">Hoja {n}</span>
      </footer>
    </section>
  );
}

/**
 * La torta de la hoja 1 — la misma que la pantalla, con las porciones y el
 * porcentaje escrito en la leyenda.
 *
 * ⚠️ **Medidas FIJAS, no `ResponsiveContainer`.** El contenedor responsivo mide
 * su caja con un `ResizeObserver` y dibuja recién después: en una hoja que se
 * está por imprimir eso es una carrera que a veces pierde y deja el SVG en cero.
 * La hoja tiene un ancho conocido (297mm), así que el gráfico puede tener
 * medidas exactas y dibujarse en el primer render. Es el único lugar de la app
 * donde conviene lo fijo sobre lo responsivo, y el motivo es la impresión.
 *
 * Solo se dibujan las carteras con monto POSITIVO: una cartera en negativo
 * (efectivo en descubierto) no es una porción de nada. El porcentaje es la
 * `ponderacion` que ya viene del backend, la misma que imprime el cuadro de al
 * lado — calcularlo acá sería tener el mismo número en dos lugares.
 */
function TortaCarteras({ carteras }: {
  carteras: (Monto & { cartera: string; label: string })[];
}) {
  const datos = carteras
    .filter((c) => c.monto > 0)
    .map((c) => ({ name: c.label, value: c.monto, cartera: c.cartera, pond: c.ponderacion }));

  if (!datos.length) {
    return <p className="text-[10px] text-neutral-500">Sin carteras con monto positivo.</p>;
  }
  return (
    <div className="flex items-center gap-6">
      <PieChart width={250} height={250}>
        <Pie data={datos} dataKey="value" nameKey="name" cx={120} cy={120}
             innerRadius={52} outerRadius={110} paddingAngle={1} stroke="#fff"
             isAnimationActive={false}>
          {datos.map((d, i) => (
            <Cell key={d.cartera} fill={carteraColor(d.cartera, i)} />
          ))}
        </Pie>
      </PieChart>
      {/* La leyenda es HTML propio y no el <Legend> de recharts por dos motivos:
          la librería la ordena por cómo quedaron dibujados los sectores —no por
          el orden del cuadro de al lado, y dos listas de lo mismo en distinto
          orden hacen que alguien lea mal el informe—, y además en la versión 3
          ya no se le puede pasar el contenido armado. */}
      <ul className="text-[10px] leading-relaxed">
        {datos.map((d, i) => (
          <li key={d.cartera} className="flex items-baseline gap-2">
            <span className="inline-block w-2.5 h-2.5 shrink-0"
                  style={{ background: carteraColor(d.cartera, i) }} />
            <span className="text-neutral-700">{d.name}</span>
            <span className="ml-auto pl-3 tabular-nums font-semibold">{fmtPct(d.pond)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TituloBloque({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: AZUL }}>
      {children}
    </h3>
  );
}

function DatoHoja({ label, valor, sub }: { label: string; valor: string; sub?: string }) {
  return (
    <div className="px-3 py-2">
      <div className="text-[8px] uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-[15px] font-semibold tabular-nums leading-tight">{valor}</div>
      {sub && <div className="text-[8px] text-neutral-500 tabular-nums">{sub}</div>}
    </div>
  );
}

/** El maestro escribe «-» cuando el campo está vacío, y un guión suelto en una
 *  lista de emisores no se entiende. Se dice qué falta. */
function etiquetaHoja(clave: string, vacio: string): string {
  const c = (clave || "").trim();
  return c === "" || c === "-" || c === "—" ? vacio : c;
}

function TablaHoja({ filas, vacio, sangria = false }: {
  filas: Fila[]; vacio: string; sangria?: boolean;
}) {
  if (!filas.length) return <p className="text-[9px] text-neutral-500">Sin filas.</p>;
  return (
    <table className="w-full text-[9px]">
      <tbody className="tabular-nums">
        {filas.map((f) => (
          <tr key={f.clave} className="border-b border-neutral-200">
            <td className={`py-0.5 ${sangria ? "pl-3" : ""}`}>{etiquetaHoja(f.clave, vacio)}</td>
            <td className="py-0.5 text-right">{fmt0(f.monto)}</td>
            <td className="py-0.5 text-right w-12 text-neutral-500">{fmtPct(f.share)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Impresión ──────────────────────────────────────────────────────────────
//
// El reporte es hijo directo de `<body>` (portal), así que para imprimir alcanza
// con apagar a sus hermanos y sacarle al overlay todo lo que impide paginar:
// `position: fixed`, el `overflow` y el alto de pantalla. Los tres juntos son lo
// que hacía que el PDF saliera de una sola página con seis hojas adentro.
//
// Se probó primero con `visibility: hidden` sobre `body *` para no tocar el
// layout. No alcanza: la propiedad esconde, pero el elemento sigue ocupando y
// recortando. Lo que pagina es sacar la app del flujo.
const CSS_IMPRESION = `
@media print {
  @page { size: A4 landscape; margin: 0; }
  html, body {
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }
  body > *:not(.reporte-overlay) { display: none !important; }
  .reporte-overlay {
    position: static !important;
    display: block !important;
    overflow: visible !important;
    background: none !important;
    padding: 0 !important;
  }
  /* ⚠️ Acá había un \`.reporte-overlay > *\` con \`display: block\`, y le pegaba
     TAMBIÉN al <style> con estas mismas reglas: un bloque vacío al final del
     documento, o sea una hoja en blanco de más en el PDF (medido: 6 hojas → 7
     páginas). Se apunta al contenedor por id y el <style> queda como está. */
  #reporte-imprimible { margin: 0 !important; display: block !important; }
  .reporte-overlay > style { display: none !important; }
  .no-imprimir { display: none !important; }
  /* La marca de agua global que la app le pone a todos los charts no va en el
     reporte: la hoja YA lleva el logo en la barra azul de arriba, y repetirlo
     detrás de la torta lo único que hace es taparle la leyenda.
     (Sin acentos graves en este comentario: está adentro de un template
     literal y lo cerrarían.) */
  .hoja .recharts-wrapper::before { display: none !important; }
  .hoja, .hoja * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .hoja {
    box-shadow: none !important;
    margin: 0 !important;
    break-after: page;
    break-inside: auto;
  }
  .hoja:last-child { break-after: auto; }
  /* Una tabla larga no parte una fila al medio, y repite su cabecera si cae en
     más de una página. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
}
`;
