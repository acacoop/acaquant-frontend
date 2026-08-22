"use client";

// NEGOCIO → CARTERAS — el INFORME de una cuenta (`/valuaciones`).
//
// Reemplaza a la tab PORTAFOLIO, que era un tablero de cuatro paneles apretados
// donde había que buscar cada número. Ahora se lee como el informe de ACA, que
// es la forma en que la mesa ya mira una cartera:
//
//   RESUMEN   → cuánto vale, cómo se compone y contra el mes anterior
//   ACTIVOS   → el detalle título por título, un cuadro por cartera
//   MÉTRICAS  → la misma plata abierta por clase de activo, emisor y calificación
//
// **El front NO calcula NADA.** Montos, ponderaciones, share, totales por moneda
// y los espejos en dólares vienen resueltos de `/api/valuaciones/{id}/vista`
// (`api/services/carteras_informe.py`). Es a propósito y es el mismo criterio
// que rige en `/aca`: con la fórmula duplicada acá, la pantalla podía
// contradecir al informe y ninguna de las dos versiones sería la verdad. De
// yapa, el PDF que sale de estas tres tabs usa ESE payload — no una segunda
// implementación que se desincroniza sola.
//
// Las tres tabs comparten UN fetch: el componente se queda montado al cambiar de
// tab (el shell lo renderiza desde la misma rama), así moverse entre RESUMEN y
// MÉTRICAS no vuelve a pegarle a la base ni a correr el motor de PnL.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import dynamic from "next/dynamic";

import { carteraColor, carteraShort } from "@/lib/carteras";
import { fetchJson } from "@/lib/fetch-json";
import { fmtFechaCorta } from "@/lib/fmt";
import { exportToXlsx, timestampSuffix } from "@/lib/xlsx-export";
import { fmt0, fmt2, fmtPct, Panel } from "./ui/informe";

// El reporte se baja recién al abrirlo: son cuatro hojas de maquetado que la
// mayoría de las veces nadie mira, y pagarlas en cada carga de la vista sería
// gastar en algo que casi nunca se usa. Sin SSR porque no aporta nada al HTML
// inicial — es un modal.
const CarterasReporteModal = dynamic(
  () => import("@/components/carteras-reporte-modal").then((m) => m.CarterasReporteModal),
  { ssr: false },
);

// ── Contrato /api/valuaciones/{id}/vista ───────────────────────────────────
type Monto = { monto: number; monto_usd: number | null; ponderacion: number | null };
type CarteraMonto = Monto & { cartera: string; label: string };
type SinClasificar = Monto & { claves: string[] };
type Bloque = {
  fecha: string | null; mep: number | null; a3500: number | null;
  valuacion_ars: number; valuacion_usd: number | null; valuacion_a3500: number | null;
  carteras: CarteraMonto[]; otras_carteras: Monto | null;
  total_dolarizado: Monto; total_pesos: Monto; sin_clasificar: SinClasificar;
  n_activos: number;
};
export type PosicionInforme = {
  unidad: string; ticker: string; emisor: string; clase_activo: string;
  cartera: string; calificacion: string; vencimiento: string | null;
  cantidad: number; precio: number; fuente_precio: string;
  valuacion: number; valuacion_usd: number | null;
  share: number | null; share_cartera: number | null;
  costo: number | null; pnl: number | null; gan_pct: number | null;
  costo_usd: number | null; pnl_usd: number | null; gan_pct_usd: number | null;
};
type BloqueActivos = {
  cartera: string; label: string; total: number; total_usd: number | null;
  ponderacion: number | null; filas: PosicionInforme[];
};
type MetricaFila = { clave: string; monto: number; monto_usd: number | null; n: number; share: number | null };
type BloqueClase = { cartera: string; label: string; total: number; total_usd: number | null;
                     ponderacion: number | null; filas: MetricaFila[] };
type Vista = {
  id_cuenta: string;
  fecha: string | null; fecha_anterior: string | null;
  mep: number | null; a3500: number | null;
  horizonte: "t0" | "t1" | null; historico: boolean;
  resumen: { actual: Bloque; anterior: Bloque | null };
  detalle: { bloques: BloqueActivos[]; huerfanos: string[]; total: number; total_usd: number | null };
  metricas: {
    total: number; total_usd: number | null;
    por_clase: BloqueClase[]; por_emisor: MetricaFila[]; por_calificacion: MetricaFila[];
  };
  pnl_disponible: boolean;
  costo_total: number | null; pnl_total: number | null;
  costo_total_usd: number | null; pnl_total_usd: number | null;
  n: number;
};

export type InformeTab = "resumen" | "activos" | "metricas";

// ── Operar desde una posición (deep-link a Trading) ─────────────────────────
// Click derecho en una fila de ACTIVOS → "OPERAR" → /operar con la cuenta y el
// asset cargados. Venía de la tabla de posiciones de la vieja tab PORTAFOLIO; se
// mudó con ella. No se opera efectivo (ARS / USD / USDC): no hay nada que
// comprar ni vender. El FCI va a la tab FCI con el buscador prefilleado, porque
// un fondo no se opera por ticker.
const _CASH = new Set(["MONEDA", "MONEDAS"]);

function _esCash(p: PosicionInforme): boolean {
  return _CASH.has((p.clase_activo || "").toUpperCase())
    || _CASH.has((p.cartera || "").toUpperCase());
}

function _esFci(p: PosicionInforme): boolean {
  return (p.clase_activo || "").toUpperCase() === "FCI"
    || (p.cartera || "").toUpperCase().includes("FCI");
}

// "[1114] CAFCI684-1114 - FCI Balanz Capital Ahorro - Clase A"
//   → "Balanz Capital Ahorro - Clase A"
function _fciSearchSeed(p: PosicionInforme): string {
  let t = p.ticker || "";
  t = t.replace(/^\s*\[[^\]]*\]\s*/, "");        // "[1114] "
  t = t.replace(/^\s*CAFCI[\w-]*\s*-\s*/i, "");  // "CAFCI684-1114 - "
  t = t.replace(/^\s*FCI\s+/i, "");              // "FCI " inicial
  return t.trim() || p.emisor || "";
}

function _operarHref(p: PosicionInforme, idCuenta: string): string {
  const acc = encodeURIComponent(idCuenta);
  return _esFci(p)
    ? `/operar?tab=fci&account=${acc}&fci=${encodeURIComponent(_fciSearchSeed(p))}`
    : `/operar?account=${acc}&ticker=${encodeURIComponent(p.ticker)}`;
}

// ── Piezas ─────────────────────────────────────────────────────────────────

const BTN =
  "px-2 py-0.5 text-[10px] tracking-wide border border-[var(--t-border-2)] " +
  "text-[var(--t-text-dim)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]";
const BTN_ON =
  "px-2 py-0.5 text-[10px] tracking-wide border border-[var(--t-accent)] " +
  "bg-[var(--t-accent)] text-[var(--t-on-accent)]";

/** Una celda de la cinta de arriba. Sin borde propio: el borde lo pone el
 *  `divide-x` del contenedor, que es lo que hace que las cuatro se lean como una
 *  sola pieza. `ancho` es para las que llevan un número grande. */
function Celda({ label, valor, sub, ancho = false }: {
  label: string; valor: string; sub?: string; ancho?: boolean;
}) {
  return (
    <div className={`px-4 py-2 ${ancho ? "min-w-[11rem]" : "min-w-[8.5rem]"} flex-1`}>
      <div className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">{label}</div>
      <div className="text-[17px] font-semibold text-[var(--t-text)] tabular-nums leading-tight">{valor}</div>
      {sub && <div className="text-[9px] text-[var(--t-text-muted)] tabular-nums">{sub}</div>}
    </div>
  );
}

/** El monto de un agregado en la moneda elegida. Sin MEP el USD es null, y el
 *  toggle está deshabilitado, así que nunca se muestra un 0 falso. */
const enMoneda = (m: { monto: number; monto_usd: number | null }, usd: boolean) =>
  usd ? m.monto_usd : m.monto;

// ── Vista ──────────────────────────────────────────────────────────────────

export function CarterasInformeView({ idCuenta, nombreCuenta, tab }: {
  idCuenta: string; nombreCuenta?: string; tab: InformeTab;
}) {
  const [data, setData] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  // Fecha del snapshot. null = HOY (posición live). Con fecha es histórico y el
  // horizonte deja de aplicar: un día pasado ya liquidó todo.
  const [fecha, setFecha] = useState<string | null>(null);
  const [horizonte, setHorizonte] = useState<"t0" | "t1">("t1");
  const [usdPedido, setUsd] = useState(false);
  const [reporte, setReporte] = useState(false);

  // El fetch va DERECHO en el efecto y el spinner lo prenden los handlers.
  //
  // Parece un rodeo y no lo es: si el efecto llamara a una función que hace
  // `setCargando(true)`, ese setState corre de forma SÍNCRONA dentro del efecto
  // y encadena un render de más en cada carga. Acá el estado ya nace en
  // `cargando: true` y los setState caen en el `.then`, que es asíncrono.
  useEffect(() => {
    let vivo = true;
    const q = new URLSearchParams();
    if (fecha) q.set("fecha", fecha);
    else q.set("horizonte", horizonte);
    fetchJson<Vista>(`/api/valuaciones/${encodeURIComponent(idCuenta)}/vista?${q}`)
      .then((d) => {
        if (!vivo) return;
        setData(d);
        setError(null);
      })
      .catch((e) => { if (vivo) setError(String(e instanceof Error ? e.message : e)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [idCuenta, fecha, horizonte]);

  // Cambiar de fecha o de horizonte dispara el efecto de arriba; el spinner se
  // prende acá, que es donde empieza la espera desde el punto de vista del que
  // hizo click.
  const verFecha = (f: string | null) => { setCargando(true); setFecha(f); };
  const verHorizonte = (h: "t0" | "t1") => { setCargando(true); setHorizonte(h); };

  // Sin MEP para esa fecha no hay espejo en dólares. El toggle queda apagado y
  // la moneda EFECTIVA se deriva — no se corrige el estado con un efecto: una
  // fecha sin MEP no tiene que borrar la preferencia del usuario, que vuelve a
  // valer sola en cuanto elige una fecha que sí lo tiene.
  const hayUsd = !!data?.mep;
  const usd = usdPedido && hayUsd;

  if (error) {
    return (
      <div className="p-6 text-[12px] text-[var(--t-neg)]">
        No se pudo cargar el informe de la cuenta {idCuenta}: {error}
      </div>
    );
  }
  if (!data) {
    return <div className="p-6 text-[12px] text-[var(--t-text-muted)]">Cargando informe…</div>;
  }

  const a = data.resumen.actual;

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* ── Controles del informe (la cuenta y las tabs viven en la barra de arriba) ── */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-surface)]">
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Posición al</span>
        <input
          type="date"
          value={fecha ?? (data.fecha ?? "")}
          onChange={(e) => verFecha(e.target.value || null)}
          title="Ver la tenencia a una fecha. Sin snapshot exacto se resuelve el cierre anterior más cercano."
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] text-[10px] px-2 py-0.5 text-[var(--t-text)] focus:border-[var(--t-accent)] focus:outline-none"
        />
        {fecha && (
          <button onClick={() => verFecha(null)} className={BTN} title="Volver a la posición de hoy">
            HOY ✕
          </button>
        )}
        {!fecha && (
          <div className="flex gap-1" title="T1 = con lo concertado hoy adentro (lo que vale el cliente) · T0 = liquidada a hoy (lo que está en custodia)">
            {(["t0", "t1"] as const).map((h) => (
              <button key={h} onClick={() => verHorizonte(h)}
                      className={horizonte === h ? BTN_ON : BTN}>
                {h.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1 ml-2" title={hayUsd ? undefined : "Sin MEP para esa fecha"}>
          {(["ARS", "USD"] as const).map((m) => (
            <button key={m} onClick={() => setUsd(m === "USD")}
                    disabled={m === "USD" && !hayUsd}
                    className={`${(m === "USD") === usd ? BTN_ON : BTN} disabled:opacity-40 disabled:cursor-not-allowed`}>
              {m}
            </button>
          ))}
        </div>

        <span className="text-[10px] text-[var(--t-text-muted)]">
          {data.historico
            ? `foto conciliada del ${fmtFechaCorta(data.fecha)}`
            : `hoy · ${fmtFechaCorta(data.fecha)}`}
          {data.mep ? ` · MEP ${fmt2(data.mep)}` : " · sin MEP"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {cargando && <span className="text-[10px] text-[var(--t-text-muted)]">actualizando…</span>}
          <button className={BTN} onClick={() => setReporte(true)}
                  title="El informe como documento, hoja por hoja — se imprime o se guarda como PDF">
            REPORTE
          </button>
          <button className={BTN}
                  onClick={() => void exportarInforme(data, idCuenta, nombreCuenta)}>
            ⬇ EXCEL
          </button>
        </div>
      </div>

      {/* ── Cuerpo ── */}
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {data.n === 0 ? (
          <div className="text-[12px] text-[var(--t-text-muted)] max-w-2xl leading-relaxed">
            La cuenta {idCuenta} no tiene posiciones en {data.fecha
              ? `el ${fmtFechaCorta(data.fecha)}`
              : "el último snapshot"}. Probá otra fecha, o revisá que el backfill de
            tenencias haya corrido (Manager → OBSERVABILIDAD).
          </div>
        ) : tab === "resumen" ? (
          <TabResumen data={data} usd={usd} />
        ) : tab === "activos" ? (
          <TabActivos data={data} usd={usd} idCuenta={idCuenta} />
        ) : (
          <TabMetricas m={data.metricas} usd={usd} />
        )}
        {tab === "resumen" && a.sin_clasificar.monto > 0 && (
          <div className="mt-3 px-3 py-2 border border-[var(--t-accent)] text-[10px] text-[var(--t-text)]">
            {fmt0(a.sin_clasificar.monto)} sin regla de moneda ({a.sin_clasificar.claves.join(", ")}):
            no entra ni a Total Dolarizado ni a Total Pesos. Se resuelve agregando la regla en
            Manager → ACA — repartirlo por defecto haría que el cuadro cierre y esté mal.
          </div>
        )}
      </div>

      {reporte && (
        <CarterasReporteModal datos={data} idCuenta={idCuenta}
                              nombreCuenta={nombreCuenta}
                              onCerrar={() => setReporte(false)} />
      )}
    </div>
  );
}

// ── RESUMEN ────────────────────────────────────────────────────────────────

function TabResumen({ data, usd }: { data: Vista; usd: boolean }) {
  const a = data.resumen.actual;
  // La torta solo dibuja lo que suma: una cartera en negativo (efectivo en
  // descubierto) no es una porción de nada. El PORCENTAJE que se muestra es la
  // `ponderacion` que ya viene del backend —la misma que imprime el cuadro de al
  // lado— y no uno calculado acá: dos números que deberían ser el mismo,
  // calculados en dos lugares, es la forma de que un día no coincidan.
  const torta = useMemo(
    () => a.carteras.filter((c) => c.monto > 0)
      .map((c) => ({ name: c.label, value: c.monto, cartera: c.cartera, pond: c.ponderacion })),
    [a.carteras],
  );
  return (
    <div className="flex flex-col gap-3">
      {/* LA CINTA — cuánto vale la cuenta, a los tres cambios que se usan.
          Es UNA pieza continua (celdas separadas por una línea, sin aire entre
          medio) y no seis cards flotando: seis rectángulos con espacio alrededor
          se leen como seis cosas sueltas, y esto es UNA respuesta.
          COSTO / PNL / GANANCIA se sacaron a propósito (2026-08-21): la primera
          línea del informe contesta CUÁNTO VALE, no cuánto se ganó — el PnL está
          título por título en ACTIVOS y mes a mes en EVOLUCIÓN, que es donde se
          lo mira de verdad. */}
      <div className="flex flex-wrap border border-[var(--t-border)] bg-[var(--t-panel)] divide-x divide-[var(--t-border)]">
        <Celda label="Posición al" valor={fmtFechaCorta(a.fecha)}
               sub={`${a.n_activos} títulos${data.historico ? "" : ` · ${(data.horizonte ?? "t1").toUpperCase()}`}`} />
        <Celda label="Valuación ARS" valor={fmt0(a.valuacion_ars)} ancho />
        <Celda label="Valuación USD" valor={fmt0(a.valuacion_usd)}
               sub={a.mep ? `MEP ${fmt2(a.mep)}` : "sin MEP para esa fecha"} ancho />
        <Celda label="Valuación oficial" valor={fmt0(a.valuacion_a3500)}
               sub={a.a3500 ? `A3500 ${fmt2(a.a3500)}` : "sin A3500 para esa fecha"} ancho />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Panel titulo={`Composición al ${fmtFechaCorta(a.fecha)}`}>
          <div className="h-[300px] p-2 flex items-center gap-3">
            {torta.length === 0 ? (
              <div className="h-full w-full grid place-items-center text-[11px] text-[var(--t-text-muted)]">
                Sin posiciones con valuación.
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={torta} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="80%"
                           paddingAngle={1} stroke="var(--t-panel)">
                        {torta.map((t, i) => (
                          <Cell key={t.cartera} fill={carteraColor(t.cartera, i)} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "var(--t-panel)", border: "1px solid var(--t-border-2)", fontSize: 11 }}
                        formatter={(v, n) => {
                          const m = Number(v);
                          return [`${fmt0(m)} (${fmtPct(a.valuacion_ars ? m / a.valuacion_ars : null)})`, String(n)];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* La leyenda es HTML propio y no el <Legend> de recharts. Dos
                    motivos: la librería la ordena por cómo quedaron dibujados
                    los sectores y no por el orden del cuadro de al lado —dos
                    listas de lo mismo, una al lado de la otra y en distinto
                    orden, hacen que alguien lea mal el informe—, y así la
                    leyenda es IDÉNTICA a la de la hoja del reporte, que ya no
                    puede usar la de la librería. El porcentaje es la
                    `ponderacion` que viene del backend: la misma que imprime la
                    tabla, no una cuenta hecha acá. */}
                <ul className="shrink-0 pr-2 text-[11px] leading-relaxed">
                  {torta.map((t, i) => (
                    <li key={t.cartera} className="flex items-baseline gap-2">
                      <span className="inline-block w-2.5 h-2.5 shrink-0"
                            style={{ background: carteraColor(t.cartera, i) }} />
                      <span className="text-[var(--t-text)]">{t.name}</span>
                      <span className="ml-auto pl-3 tabular-nums font-semibold text-[var(--t-text-dim)]">
                        {fmtPct(t.pond)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Panel>

        {/* Los dos cuadros: el snapshot que se está viendo y el cierre del mes
            anterior. Mismas filas y mismo orden en los dos — un comparativo que
            enumera distinto de cada lado no se puede leer en paralelo. */}
        <div className="flex flex-col gap-3">
          <Cuadro titulo={`Al ${fmtFechaCorta(a.fecha)}`} bloque={a} usd={usd} />
          {data.resumen.anterior
            ? <Cuadro titulo={`Cierre anterior · ${fmtFechaCorta(data.fecha_anterior)}`}
                      bloque={data.resumen.anterior} usd={usd} />
            : <div className="px-3 py-2 border border-[var(--t-border)] bg-[var(--t-panel)] text-[10px] text-[var(--t-text-muted)]">
                No hay un cierre de mes anterior para comparar.
              </div>}
        </div>
      </div>
    </div>
  );
}

function Cuadro({ titulo, bloque, usd }: { titulo: string; bloque: Bloque; usd: boolean }) {
  const total = usd ? bloque.valuacion_usd : bloque.valuacion_ars;
  return (
    <Panel titulo={titulo}
           extra={<span className="text-[11px] text-white tabular-nums">{fmt0(total)}</span>}>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase text-[var(--t-text-muted)] bg-[var(--t-surface)]">
            <th className="text-left px-3 py-1 font-medium">Cartera</th>
            <th className="text-right px-3 py-1 font-medium">Monto {usd ? "USD" : "ARS"}</th>
            <th className="text-right px-3 py-1 font-medium">Ponderación</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {bloque.carteras.map((c, i) => (
            <tr key={c.cartera} className="border-t border-[var(--t-border)]">
              <td className="px-3 py-1 text-[var(--t-text)]">
                <span className="inline-block w-2 h-2 mr-2 align-middle"
                      style={{ background: carteraColor(c.cartera, i) }} />
                {c.label}
              </td>
              <td className="px-3 py-1 text-right">{fmt0(enMoneda(c, usd))}</td>
              <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">{fmtPct(c.ponderacion)}</td>
            </tr>
          ))}
          {bloque.otras_carteras && (
            <tr className="border-t border-[var(--t-border)]">
              <td className="px-3 py-1"
                  title="Carteras que existían en este cierre y no en el actual, más los títulos sin ficha en Manager → Títulos">
                Otras
              </td>
              <td className="px-3 py-1 text-right">{fmt0(enMoneda(bloque.otras_carteras, usd))}</td>
              <td className="px-3 py-1 text-right text-[var(--t-text-dim)]">
                {fmtPct(bloque.otras_carteras.ponderacion)}
              </td>
            </tr>
          )}
          <tr className="border-t-2 border-[var(--t-border-2)] font-semibold">
            <td className="px-3 py-1">Total Dolarizado</td>
            <td className="px-3 py-1 text-right">{fmt0(enMoneda(bloque.total_dolarizado, usd))}</td>
            <td className="px-3 py-1 text-right">{fmtPct(bloque.total_dolarizado.ponderacion)}</td>
          </tr>
          <tr className="border-t border-[var(--t-border)] font-semibold">
            <td className="px-3 py-1">Total Pesos</td>
            <td className="px-3 py-1 text-right">{fmt0(enMoneda(bloque.total_pesos, usd))}</td>
            <td className="px-3 py-1 text-right">{fmtPct(bloque.total_pesos.ponderacion)}</td>
          </tr>
          {bloque.sin_clasificar.monto > 0 && (
            <tr className="border-t border-[var(--t-border)] text-[var(--t-accent)]">
              <td className="px-3 py-1" title={bloque.sin_clasificar.claves.join(", ")}>Sin clasificar</td>
              <td className="px-3 py-1 text-right">{fmt0(enMoneda(bloque.sin_clasificar, usd))}</td>
              <td className="px-3 py-1 text-right">{fmtPct(bloque.sin_clasificar.ponderacion)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </Panel>
  );
}

// ── ACTIVOS ────────────────────────────────────────────────────────────────

// Anchos FIJOS compartidos por TODOS los cuadros de cartera. Sin esto cada tabla
// se dimensiona con su propio contenido y las mismas columnas arrancan en
// lugares distintos en cada cuadro — cuatro tablas sueltas en vez de un informe.
// TICKER se lleva el 25%: los FCI vienen con el nombre completo del fondo
// («FCI Balanz Capital Estrategia III - Clase A») y con el 14% que tenía antes
// quedaban todos cortados en el mismo lugar, o sea ilegibles justo en la cartera
// donde el ticker ES el nombre. Lo que sobraba salió de PNL y GAN %, que ya no
// se muestran acá.
const COLS_ACTIVOS = ["25%", "14%", "7%", "11%", "8%", "10%", "9%", "10%", "6%"];

// La tab NO tiene panel de auditoría (2026-08-21). Lo tuvo una versión y se
// sacó: esta vista es la CARTERA y los títulos que hay adentro. El PnL boleto
// por boleto es otra pregunta y ya tiene su pantalla —PNL TÍTULOS—, así que
// tenerlo también acá partía el ancho en dos para mostrar algo que vive al lado.
// Sin ese panel los cuadros por cartera usan la hoja entera, que es lo que hace
// legible una cartera de 200 títulos.
function TabActivos({ data, usd, idCuenta }: {
  data: Vista; usd: boolean; idCuenta: string;
}) {
  const router = useRouter();
  // Menú contextual (click derecho) para operar una posición. Se cierra con
  // cualquier click, scroll, resize o Escape: un menú flotante que sobrevive al
  // scroll queda apuntando a una fila que ya no está debajo.
  const [ctx, setCtx] = useState<{ x: number; y: number; pos: PosicionInforme } | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [ctx]);

  return (
    <div className="flex flex-col gap-3">
      {data.detalle.huerfanos.length > 0 && (
        <div className="px-3 py-2 border border-[var(--t-accent)] text-[10px] text-[var(--t-text)]">
          {data.detalle.huerfanos.length} título(s) sin ficha en Manager → Títulos
          ({data.detalle.huerfanos.slice(0, 8).join(", ")}
          {data.detalle.huerfanos.length > 8 ? "…" : ""}): suman al total pero no tienen
          cartera, así que van al cuadro «Sin cartera» y no entran a ninguna métrica por cartera.
        </div>
      )}
      {data.detalle.bloques.map((b) => (
        <Panel key={b.cartera || "_sin"} titulo={b.label}
               extra={
                 <span className="text-[11px] text-white tabular-nums">
                   {fmt0(usd ? b.total_usd : b.total)} · {fmtPct(b.ponderacion)}
                 </span>
               }>
          <table className="w-full text-[11px] table-fixed">
            <colgroup>{COLS_ACTIVOS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
            <thead>
              <tr className="text-[9px] uppercase text-[var(--t-text-muted)] bg-[var(--t-surface)]">
                <th className="text-left px-2 py-1 font-medium">Ticker</th>
                <th className="text-left px-2 py-1 font-medium">Emisor</th>
                <th className="text-center px-2 py-1 font-medium">Calif.</th>
                <th className="text-center px-2 py-1 font-medium">Clase Act.</th>
                <th className="text-center px-2 py-1 font-medium">Venc.</th>
                <th className="text-right px-2 py-1 font-medium">Cantidad</th>
                <th className="text-right px-2 py-1 font-medium">Precio</th>
                <th className="text-right px-2 py-1 font-medium">Valuación</th>
                <th className="text-right px-2 py-1 font-medium">% Cart.</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {b.filas.length === 0 && (
                <tr><td colSpan={9} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                  Sin títulos en esta cartera.
                </td></tr>
              )}
              {/* PNL y GAN % NO se muestran en esta tabla (2026-08-22). No se
                  borraron: el backend los sigue mandando por fila y el export a
                  Excel los sigue llevando — lo que se sacó es el ruido de la
                  pantalla. Esta vista contesta QUÉ TIENE la cartera y cuánto
                  vale; cuánto se ganó con cada título es la pregunta de PNL
                  TÍTULOS, que tiene el detalle boleto por boleto al lado. */}
              {b.filas.map((f) => {
                const val = usd ? f.valuacion_usd : f.valuacion;
                return (
                  <tr key={f.unidad}
                      onContextMenu={(e) => {
                        if (_esCash(f)) return;   // el efectivo no se opera
                        e.preventDefault();
                        setCtx({ x: e.clientX, y: e.clientY, pos: f });
                      }}
                      title="Click derecho para operar este título"
                      className="border-t border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    <td className="px-2 py-1 text-[var(--t-text)] truncate" title={f.unidad}>{f.ticker}</td>
                    <td className="px-2 py-1 text-[var(--t-text-dim)] truncate" title={f.emisor}>{f.emisor}</td>
                    <td className="px-2 py-1 text-center text-[var(--t-text-dim)]">{f.calificacion}</td>
                    <td className="px-2 py-1 text-center text-[var(--t-text-dim)] truncate">{f.clase_activo}</td>
                    <td className="px-2 py-1 text-center text-[var(--t-text-dim)]">
                      {f.vencimiento ? fmtFechaCorta(f.vencimiento) : "—"}
                    </td>
                    <td className="px-2 py-1 text-right">{fmt2(f.cantidad, 2)}</td>
                    <td className="px-2 py-1 text-right">{fmt2(f.precio, 2)}</td>
                    <td className="px-2 py-1 text-right">{fmt0(val)}</td>
                    <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{fmtPct(f.share_cartera)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ))}

      {ctx && (
        <div
          className="fixed z-50 min-w-[210px] bg-[var(--t-surface)] border border-[var(--t-border-2)] shadow-xl text-[11px]"
          style={{
            top: Math.min(ctx.y, (typeof window !== "undefined" ? window.innerHeight : 9999) - 120),
            left: Math.min(ctx.x, (typeof window !== "undefined" ? window.innerWidth : 9999) - 230),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-[var(--t-border)] text-[var(--t-text-dim)] flex items-center gap-1">
            <span className="text-[var(--t-accent)] font-semibold truncate max-w-[150px]" title={ctx.pos.ticker}>
              {ctx.pos.ticker}
            </span>
            <span className="text-[9px] uppercase">{ctx.pos.clase_activo}</span>
          </div>
          <button
            onClick={() => {
              const href = _operarHref(ctx.pos, idCuenta);
              setCtx(null);
              router.push(href);
            }}
            className="w-full text-left px-3 py-2 hover:bg-[var(--t-tint-amber)] text-[#ffcf66] flex items-center gap-2"
          >
            <span>▸</span>
            <span>
              OPERAR{_esFci(ctx.pos) ? " (FCI)" : ""} ·{" "}
              <span className="text-[var(--t-text-dim)]">cuenta {idCuenta}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

// ── MÉTRICAS ───────────────────────────────────────────────────────────────
//
// **Rediseño 2026-08-21.** Antes era una grilla de paneles, uno por cartera y
// uno por eje: cinco o seis cuadros de UNA fila cada uno, cada uno ocupando una
// celda entera de la grilla. El 80% de la pantalla era aire. El contenido estaba
// bien; el formato no: un panel con cabecera, borde y padding es un envase caro
// para tres números.
//
// Ahora son TRES columnas, una por EJE (clase de activo · emisor · calificación),
// y cada una es una lista continua. Lo que llena el espacio horizontal que
// sobraba es una BARRA proporcional: el mismo dato que el porcentaje, pero
// comparable de un vistazo sin leer cifra por cifra.
//
// La barra se escala contra la fila MÁS GRANDE del bloque, no contra 100%. Es a
// propósito: una cuenta con efectivo en descubierto tiene filas negativas, así
// que los shares no suman 100 y una barra sobre 100% dejaría todo el bloque
// aplastado contra la izquierda. Escalada al máximo del bloque, la comparación
// entre filas —que es lo que se mira— sigue siendo exacta.

function TabMetricas({ m, usd }: { m: Vista["metricas"]; usd: boolean }) {
  const total = usd ? m.total_usd : m.total;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
      <Panel titulo="Por clase de activo"
             extra={<span className="text-[11px] text-white tabular-nums">{fmt0(total)}</span>}>
        <PorClase bloques={m.por_clase} usd={usd} />
      </Panel>

      <Panel titulo="Por emisor"
             extra={<span className="text-[11px] text-white tabular-nums">{fmt0(total)}</span>}>
        <ListaMetrica filas={m.por_emisor} usd={usd} vacio="Sin emisor" />
      </Panel>

      <Panel titulo="Por calificación"
             extra={<span className="text-[11px] text-white tabular-nums">{fmt0(total)}</span>}>
        <ListaMetrica filas={m.por_calificacion} usd={usd} vacio="Sin calificación" />
      </Panel>
    </div>
  );
}

/**
 * La apertura por clase, agrupada por cartera.
 *
 * **Rehecho el 2026-08-22.** La versión anterior alternaba un renglón de cartera
 * y sus clases sin separación, y se leía como una lista de renglones todos
 * iguales: no se veía qué agrupaba a qué. Peor todavía, la mayoría de las
 * carteras tienen UNA sola clase, así que el cuadro repetía dos veces la misma
 * cifra («Cartera HD 275.257.885» y debajo «HD 275.257.885 100,0%»), que es
 * exactamente el ruido que hacía dudar de si eran dos cosas distintas.
 *
 * Ahora:
 *   · Cada cartera es un BLOQUE con aire alrededor. El espacio es lo único que
 *     dice «esto termina acá», y no hacía falta inventar nada más.
 *   · Una cartera de UNA sola clase se colapsa en un renglón: el nombre de la
 *     clase va al lado del de la cartera. Si hay una sola, el 100% no informa.
 *   · Los dos porcentajes son distintos y ahora se distinguen: el de la cartera
 *     es sobre la CUENTA y el de la clase sobre SU cartera.
 */
function PorClase({ bloques, usd }: { bloques: BloqueClase[]; usd: boolean }) {
  const conDatos = bloques.filter((b) => b.filas.length);
  if (!conDatos.length) return <Vacio />;
  return (
    <div className="p-2 flex flex-col gap-3">
      {conDatos.map((b, i) => {
        const unica = b.filas.length === 1 ? b.filas[0] : null;
        return (
          <div key={b.cartera}>
            <div className="flex items-baseline gap-2 px-2 py-1 bg-[var(--t-surface)] border-l-2"
                 style={{ borderColor: carteraColor(b.cartera, i) }}>
              <span className="text-[11px] font-semibold text-[var(--t-text)] tracking-wide">
                {b.label}
              </span>
              {unica && (
                <span className="text-[10px] text-[var(--t-text-dim)]">· {etiqueta(unica.clave, "Sin clase")}</span>
              )}
              <span className="ml-auto text-[11px] tabular-nums font-semibold">
                {fmt0(usd ? b.total_usd : b.total)}
              </span>
              <span className="w-14 text-right text-[10px] tabular-nums text-[var(--t-text-dim)]">
                {fmtPct(b.ponderacion)}
              </span>
            </div>
            {!unica && <ListaMetrica filas={b.filas} usd={usd} vacio="Sin clase" sangria />}
          </div>
        );
      })}
    </div>
  );
}

function Vacio() {
  return <div className="px-3 py-3 text-[11px] text-[var(--t-text-muted)]">Sin filas.</div>;
}

/** El maestro escribe «-» cuando el campo está vacío, y un guión suelto en una
 *  lista de emisores no se entiende. Se dice qué falta. */
function etiqueta(clave: string, vacio: string): string {
  const c = (clave || "").trim();
  return c === "" || c === "-" || c === "—" ? vacio : c;
}

function ListaMetrica({ filas, usd, vacio, sangria = false }: {
  filas: MetricaFila[]; usd: boolean; vacio: string; sangria?: boolean;
}) {
  // Escala del bloque: la fila de mayor valor absoluto marca el 100% de ancho.
  const tope = useMemo(
    () => Math.max(1, ...filas.map((f) => Math.abs(f.monto))),
    [filas],
  );
  if (filas.length === 0) return <Vacio />;
  return (
    <div>
      {filas.map((f) => {
        const neg = f.monto < 0;
        const ancho = Math.min(100, (Math.abs(f.monto) / tope) * 100);
        return (
          <div key={f.clave}
               className={`relative py-1 border-b border-[var(--t-border)] last:border-b-0 ${
                 sangria ? "pl-5 pr-2" : "px-3"}`}>
            {/* La barra va DETRÁS del texto, no en una columna aparte: así usa
                el ancho que sobraba en vez de robarle lugar a las cifras. */}
            <div aria-hidden
                 className={`absolute inset-y-0 left-0 ${neg ? "bg-[var(--t-neg)]/12" : "bg-[var(--t-accent)]/12"}`}
                 style={{ width: `${ancho}%` }} />
            <div className="relative flex items-baseline gap-2 text-[11px]">
              <span className="truncate text-[var(--t-text)]">{etiqueta(f.clave, vacio)}</span>
              <span className={`ml-auto tabular-nums shrink-0 ${neg ? "text-[var(--t-neg)]" : ""}`}>
                {fmt0(enMoneda(f, usd))}
              </span>
              <span className="tabular-nums shrink-0 w-14 text-right text-[var(--t-text-dim)]">
                {fmtPct(f.share)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────

/** Las tres tabs a Excel, una hoja cada una. Sale del MISMO payload que la
 *  pantalla, así el archivo no puede decir otra cosa que el informe. */
async function exportarInforme(d: Vista, idCuenta: string, nombreCuenta?: string) {
  const cab = `Cuenta ${idCuenta}${nombreCuenta ? ` — ${nombreCuenta}` : ""} · posición al ${d.fecha ?? "—"}`;
  const a = d.resumen.actual;
  await exportToXlsx({
    filename: `carteras-${idCuenta}-${timestampSuffix()}.xlsx`,
    sheets: [
      {
        name: "Resumen",
        title: cab,
        columns: [
          { key: "cartera", header: "Cartera", format: "text" },
          { key: "monto", header: "Monto ARS", format: "number" },
          { key: "monto_usd", header: "Monto USD", format: "number" },
          { key: "ponderacion", header: "Ponderación %", format: "percent" },
        ],
        rows: [
          ...a.carteras.map((c) => ({
            cartera: c.label, monto: c.monto, monto_usd: c.monto_usd,
            ponderacion: c.ponderacion == null ? null : c.ponderacion * 100,
          })),
          { cartera: "Total Dolarizado", monto: a.total_dolarizado.monto,
            monto_usd: a.total_dolarizado.monto_usd,
            ponderacion: a.total_dolarizado.ponderacion == null ? null : a.total_dolarizado.ponderacion * 100 },
          { cartera: "Total Pesos", monto: a.total_pesos.monto,
            monto_usd: a.total_pesos.monto_usd,
            ponderacion: a.total_pesos.ponderacion == null ? null : a.total_pesos.ponderacion * 100 },
          { cartera: "TOTAL", monto: a.valuacion_ars, monto_usd: a.valuacion_usd, ponderacion: 100 },
        ],
      },
      {
        name: "Activos",
        title: cab,
        columns: [
          { key: "cartera", header: "Cartera", format: "text" },
          { key: "ticker", header: "Ticker", format: "text" },
          { key: "emisor", header: "Emisor", format: "text" },
          { key: "calificacion", header: "Calif.", format: "text" },
          { key: "clase_activo", header: "Clase activo", format: "text" },
          { key: "vencimiento", header: "Vencimiento", format: "text" },
          { key: "cantidad", header: "Cantidad", format: "number" },
          { key: "precio", header: "Precio", format: "number" },
          { key: "valuacion", header: "Valuación ARS", format: "number" },
          { key: "valuacion_usd", header: "Valuación USD", format: "number" },
          { key: "share_cartera", header: "% Cartera", format: "percent" },
          { key: "costo", header: "Costo", format: "number" },
          { key: "pnl", header: "PnL", format: "number" },
          { key: "gan_pct", header: "Gan %", format: "percent" },
        ],
        rows: d.detalle.bloques.flatMap((b) => b.filas.map((f) => ({
          cartera: carteraShort(b.cartera || "SIN CLASIFICAR"),
          ticker: f.ticker, emisor: f.emisor, calificacion: f.calificacion,
          clase_activo: f.clase_activo, vencimiento: f.vencimiento,
          cantidad: f.cantidad, precio: f.precio,
          valuacion: f.valuacion, valuacion_usd: f.valuacion_usd,
          share_cartera: f.share_cartera == null ? null : f.share_cartera * 100,
          costo: f.costo, pnl: f.pnl, gan_pct: f.gan_pct,
        }))),
      },
      {
        name: "Metricas",
        title: cab,
        columns: [
          { key: "bloque", header: "Apertura", format: "text" },
          { key: "clave", header: "Clave", format: "text" },
          { key: "n", header: "Títulos", format: "integer" },
          { key: "monto", header: "Monto ARS", format: "number" },
          { key: "monto_usd", header: "Monto USD", format: "number" },
          { key: "share", header: "Share %", format: "percent" },
        ],
        rows: [
          ...d.metricas.por_clase.flatMap((b) => b.filas.map((f) => ({
            bloque: `${b.label} · clase`, clave: f.clave, n: f.n,
            monto: f.monto, monto_usd: f.monto_usd,
            share: f.share == null ? null : f.share * 100,
          }))),
          ...d.metricas.por_emisor.map((f) => ({
            bloque: "Emisor", clave: f.clave, n: f.n, monto: f.monto,
            monto_usd: f.monto_usd, share: f.share == null ? null : f.share * 100,
          })),
          ...d.metricas.por_calificacion.map((f) => ({
            bloque: "Calificación", clave: f.clave, n: f.n, monto: f.monto,
            monto_usd: f.monto_usd, share: f.share == null ? null : f.share * 100,
          })),
        ],
      },
    ],
  });
}
