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
    por_clase: { cartera: string; label: string; total: number; filas: Fila[] }[];
    por_emisor: Fila[]; por_calificacion: Fila[];
  };
};

type MesResumen = {
  mes: string; ultimo_dia: string; valuacion_cierre: number;
  flujo_neto: number; delta_real: number | null;
  tem_periodo: number | null; twr_base100: number;
};

const mesLargo = (m: string) => {
  const [y, mm] = (m || "").split("-");
  return y && mm ? `${MESES_CORTOS[Number(mm) - 1] ?? mm} ${y.slice(2)}` : "—";
};

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
  const titulo = `${idCuenta}${nombreCuenta ? ` · ${nombreCuenta}` : ""}`;
  const fecha = fmtFechaCorta(datos.fecha);

  // Una hoja por cartera en ACTIVOS: es el corte natural del documento y evita
  // tener que paginar a mano. Una cartera con muchos títulos crece más que un A4
  // y el navegador la parte solo al imprimir.
  const hojas = useMemo(() => datos.detalle.bloques.filter((b) => b.filas.length), [datos]);

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

          <div className="grid grid-cols-2 gap-6">
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
                  ? `Comparativo · cierre al ${fmtFechaCorta(datos.resumen.anterior.fecha)}`
                  : "Comparativo"}
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
        </Hoja>

        {hojas.map((b, i) => (
          <Hoja key={b.cartera || "_sin"} n={2 + i}
                titulo={`Activos · ${b.label}`} cuenta={titulo} fecha={fecha}>
            <div className="flex items-baseline gap-3 mb-2">
              <TituloBloque>{b.label}</TituloBloque>
              <span className="ml-auto text-[11px] tabular-nums font-semibold">
                {fmt0(b.total)} · {fmtPct(b.ponderacion)} de la cartera
              </span>
            </div>
            <table className="w-full text-[9px]">
              <thead>
                <tr className="text-[8px] uppercase text-neutral-500 border-b border-neutral-300">
                  <th className="text-left py-1">Ticker</th>
                  <th className="text-left py-1">Emisor</th>
                  <th className="text-center py-1">Calif.</th>
                  <th className="text-center py-1">Clase</th>
                  <th className="text-center py-1">Venc.</th>
                  <th className="text-right py-1">Cantidad</th>
                  <th className="text-right py-1">Precio</th>
                  <th className="text-right py-1">Valuación</th>
                  <th className="text-right py-1 w-14">% Cart.</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {b.filas.map((f) => (
                  <tr key={f.unidad} className="border-b border-neutral-200">
                    <td className="py-0.5">{f.ticker}</td>
                    <td className="py-0.5 text-neutral-600">{f.emisor}</td>
                    <td className="py-0.5 text-center text-neutral-600">{f.calificacion}</td>
                    <td className="py-0.5 text-center text-neutral-600">{f.clase_activo}</td>
                    <td className="py-0.5 text-center text-neutral-600">
                      {f.vencimiento ? fmtFechaCorta(f.vencimiento) : "—"}
                    </td>
                    <td className="py-0.5 text-right">{fmt2(f.cantidad, 2)}</td>
                    <td className="py-0.5 text-right">{fmt2(f.precio, 2)}</td>
                    <td className="py-0.5 text-right">{fmt0(f.valuacion)}</td>
                    <td className="py-0.5 text-right text-neutral-500">{fmtPct(f.share_cartera)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Hoja>
        ))}

        <Hoja n={2 + hojas.length} titulo="Métricas" cuenta={titulo} fecha={fecha}>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <TituloBloque>Por clase de activo</TituloBloque>
              {datos.metricas.por_clase.map((b) => (
                <div key={b.cartera} className="mb-2">
                  <div className="flex items-baseline gap-2 text-[9px] font-semibold border-b border-neutral-300 py-0.5">
                    <span>{b.label}</span>
                    <span className="ml-auto tabular-nums">{fmt0(b.total)}</span>
                  </div>
                  <TablaHoja filas={b.filas} />
                </div>
              ))}
            </div>
            <div>
              <TituloBloque>Por emisor</TituloBloque>
              <TablaHoja filas={datos.metricas.por_emisor} />
            </div>
            <div>
              <TituloBloque>Por calificación</TituloBloque>
              <TablaHoja filas={datos.metricas.por_calificacion} />
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
    <section className="hoja bg-white text-neutral-900 shadow-lg"
             style={{ width: "297mm", minHeight: "205mm" }}>
      <header className="flex items-center gap-3 px-6 py-3 text-white" style={{ background: AZUL }}>
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

function TablaHoja({ filas }: { filas: Fila[] }) {
  if (!filas.length) return <p className="text-[9px] text-neutral-500">Sin filas.</p>;
  return (
    <table className="w-full text-[9px]">
      <tbody className="tabular-nums">
        {filas.map((f) => (
          <tr key={f.clave} className="border-b border-neutral-200">
            <td className="py-0.5">{f.clave}</td>
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
