"use client";

// NEGOCIO → POSICIONES Y DIFERENCIAS.
//
// El reporte que la mesa manda por mail todos los días ("RESUMEN POSICIONES
// AGRO Y DÓLAR FUTURO"), servido desde lo que dice **la CÁMARA** (A3/ACyRSA).
//
// REEMPLAZA a la vieja tab DIFERENCIAS DIARIAS, que leía el TEXTO de
// `negocio_movimientos`. Eran los mismos pesos por otro camino: ahí la
// diferencia aparecía porque alguien la había registrado como movimiento, acá
// porque la cámara la liquidó. Cuando los dos no coincidían, no había forma de
// saber cuál mandaba.
//
// ⚠️ **ACÁ NO SE DERIVA NADA.** Ni un total, ni un neto, ni el acumulado: todo
// viene calculado del backend, de la misma query que dibuja cada lista. Es la
// misma regla que rige en el modal del AV AGENT, y por el mismo motivo — un
// contador sumado en el navegador no se puede verificar del lado del servidor.
//
// UN SOLO REQUEST (`/api/ap5/vista`) para toda la pantalla. No es ahorro de
// red: es que los bloques tienen que hablar de la MISMA fecha. Con llamadas
// separadas, el job corriendo en el medio dejaría el resumen en un día y el
// ranking en otro **sin que nada falle**.

import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/lib/fetch-json";
import { usePersistedState } from "@/lib/use-persisted-state";
import { fmt0, fmt2, Panel } from "./ui/informe";

// ── Lo que devuelve el backend (espejo de api/services/ap5_posiciones.py) ────
type Fecha = { fecha: string; filas: number; cuentas: number };
type DifHoy = { moneda: string; familia: string; importe: number; cuentas: number };
// `importe` ES el acumulado (no la diferencia del día): es lo que el reporte
// de la mesa rankea. Se llama así porque el nombre del campo lo fija su rol.
type RankItem = {
  cuenta: string; nombre: string; moneda: string; familia: string; grupo: string;
  importe: number; diaria: number;
  // El ARRASTRE de esta moneda y si lo cargó una persona. `cargado = false` con
  // arrastre 0 NO es lo mismo que un cero verificado — y esta vista se imprime.
  arrastre: number; cargado: boolean; fecha_arrastre: string | null;
};
// `tab` y `lado` los decide el BACKEND. La vista no compara strings de grupo —
// que es exactamente donde se rompió el 2026-08-25: la base decía COOPERATIVAS,
// acá estaba escrito "Cooperativas", no matcheaba, y TODO caía en el bloque de
// "sin clasificar" con los rankings correctos y el título equivocado.
type Ranking = {
  tab: TabFam; grupo: string; lado: "izq" | "der" | "otro";
  positivos: RankItem[]; negativos: RankItem[];
  total_positivo: number; total_negativo: number;
  cuentas: number; sin_cargar: number;
  // Cuántas filas tiene el ranking COMO MÁXIMO (lo manda el backend). La lista
  // reserva ESE alto aunque haya menos: si cada panel se encogiera a su
  // cantidad de filas, Cooperativas y MUNDO ACA quedarían de altos distintos.
  top: number;
};
type Instr = {
  familia: string; producto: string; etiqueta: string;
  unidad: string | null; moneda: string | null;
  compra: number | null; venta: number | null; neta: number | null;
  compra_contratos: number; venta_contratos: number; sin_multiplicador: number;
  acum_hoy: number; acum_ayer: number; diaria: number;
  acumulado_desde: string | null; fecha_anterior: string | null;
};
type Acum = {
  cuenta: string; nombre: string; grupo: string; moneda: string; familia: string;
  arrastre: number; cargado: boolean;
  fecha_arrastre: string | null; actualizado: string | null;
  movimiento: number; acumulado: number; diaria: number;
};
type Faltantes = {
  // Familias que NO entran en ninguna tab (hoy `otros`: el WTI, en barriles).
  fuera_de_tabs?: { familia: string; cuentas: number; simbolos: number }[];
  simbolos_sin_multiplicador?: { symbol: string; unidad: string | null; filas: number }[];
  cuentas_sin_nombre?: number; cuentas_sin_grupo?: number; cuentas?: number;
  cuentas_sin_cargar?: number;
};
type Vista = {
  fecha: string | null; fecha_anterior: string | null;
  fechas: Fecha[]; rankings: Ranking[]; grupos: string[];
  consolidado: Consolidado[];
  // El endpoint sigue trayendo estos tres bloques y la pantalla ya NO los
  // dibuja (2026-08-25: la vista es el reporte, y el reporte son los rankings).
  // Se tipan igual porque describen lo que la API devuelve de verdad — borrar el
  // tipo no borraría el campo, solo lo dejaría sin documentar.
  diferencias_hoy: DifHoy[]; por_instrumento: Instr[]; acumulado: Acum[];
  faltantes: Faltantes;
  requerimiento_margenes: Requerimiento;
  activo_integrado: Requerimiento;
};

/** El requerimiento de márgenes de las cuentas elegidas.
 *
 *  `cuentas_pedidas` / `cuentas_encontradas` los cuenta el BACKEND, no esta
 *  pantalla: una cuenta que dejó de venir se ve exactamente igual que una
 *  cuenta en cero, y este cuadro se imprime para gerencia. */
type Requerimiento = {
  fecha: string | null;
  por_moneda: { moneda: string; importe: number; filas: number }[];
  // Una fila por CONCEPTO (`Márgenes`, `Inicial A3`, …). `importe` es `margen`
  // con el signo ya dado vuelta — `primas` e `inter_temporal` viajan porque la
  // cámara los manda, pero NO son parte del número: `Márgenes` trae un
  // `inter_temporal` no nulo que no cuenta.
  detalle: {
    cuenta: string; cuenta_compensacion: string; concepto: string;
    moneda: string; importe: number; margen: number; primas: number;
    inter_temporal: number; referencias: number; titular: string | null;
  }[];
  // Qué conceptos suma esta card, y cuáles de ellos NO vinieron. Si la cámara
  // renombra `Inicial A3`, la card seguiría dibujando el número de los que sí
  // quedaron: el aviso es lo único que lo delata.
  conceptos: string[];
  conceptos_faltantes: string[];
  // Si esta card mira SÓLO las cuentas de `AP5_CUENTAS_REQUERIMIENTO` o TODAS.
  // El requerimiento filtra (es lo exigido a nuestras dos cuentas); el activo
  // integrado no (es lo depositado por el ALyC entero). Cuando no filtra,
  // `cuentas_pedidas` viene en 0 y no hay faltantes que avisar.
  filtra_cuentas: boolean;
  cuentas_pedidas: number;
  cuentas_encontradas: number;
  cuentas_faltantes: string[];
};

// El nombre de la familia, para los avisos. AGRO son trigo/soja/maíz (toneladas)
// y DÓLAR FUTURO el otro. `otros` (hoy el WTI, en barriles) NO tiene tab: se
// declara en la barra de faltantes, porque una posición sin pantalla es una
// posición que nadie mira.
const FAMILIA: Record<string, string> = { agro: "AGRO", dolar: "DÓLAR FUTURO", otros: "OTROS" };

// Las dos tabs del reporte. Qué familia cae en cuál lo decide el backend
// (`TAB_DE_FAMILIA`): `otros` —hoy el WTI, unidad `Bl`— va con AGRO pero
// conserva su etiqueta, para que se vea que no son toneladas.
type TabFam = "agro" | "dolar";
type Tab = TabFam | "consolidados";
const TABS: { id: Tab; label: string }[] = [
  { id: "agro", label: "FUTUROS AGRO" },
  { id: "dolar", label: "FUTUROS DÓLAR" },
  { id: "consolidados", label: "CONSOLIDADOS" },
];

// El cuadro POR INSTRUMENTO del mail: un bloque por (tab, moneda), con su TOTAL
// ya sumado por el backend. Acá NO se suma nada — este cuadro se imprime.
type ConsFila = {
  producto: string; etiqueta: string; unidad: string | null;
  compra: number | null; venta: number | null; neta: number | null;
  compra_contratos: number; venta_contratos: number; sin_multiplicador: number;
  acum_hoy: number; acum_ayer: number; diaria: number;
};
type ConsTotal = {
  compra: number; venta: number; neta: number;
  acum_hoy: number; acum_ayer: number; diaria: number; sin_multiplicador: number;
};
type Consolidado = {
  tab: TabFam; moneda: string; unidad: string | null; unidades: string[];
  filas: ConsFila[]; total: ConsTotal;
};

// Verde a favor, rojo en contra. Mismos tokens que el resto de la app.
const tono = (n: number) => (n > 0 ? "text-[var(--t-pos)]" : n < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]");

/** Fecha ISO → "21 ago 2026". Por regex y NO con `new Date(iso)`: eso es
 *  medianoche UTC y en ART (UTC−3) mostraba el día anterior. */
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}` : iso;
}

export function Ap5PosicionesView() {
  // La fecha y la tab persisten entre navegaciones: son ELECCIONES del usuario,
  // no data fetcheada (que es lo que usePersistedState no debe guardar).
  const [fecha, setFecha] = usePersistedState<string>("ap5.fecha", "");
  const [tab, setTab] = usePersistedState<Tab>("ap5.tab", "agro");
  const [v, setV] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Qué (fecha, recarga) es lo que está DIBUJADO. `cargando` se DERIVA de
  // comparar eso contra lo pedido, en vez de ser un booleano que alguien prende
  // y apaga: así el indicador no puede quedar encendido tras un error ni
  // apagado durante un refetch — los dos bugs clásicos de un flag a mano.
  const [dibujado, setDibujado] = useState<string | null>(null);
  const [editar, setEditar] = useState<RankItem | null>(null);

  // `recarga` es el disparador explícito del botón Reintentar y del guardado del
  // modal. Un contador y no una función: así el efecto tiene UNA sola razón de
  // correr (cambió la fecha, o alguien pidió recargar) y no hay que acordarse de
  // cancelar una respuesta vieja a mano en dos lugares distintos.
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);
  const pedido = `${fecha}|${recarga}`;
  const cargando = dibujado !== pedido;

  useEffect(() => {
    // La guarda de carrera: si cambia la fecha mientras vuela un request, la
    // respuesta vieja NO puede pisar a la nueva. Sin esto, tocar dos veces el
    // selector deja en pantalla el día equivocado y nada falla.
    let cancelado = false;
    const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : "";
    // fetchJson TIRA con el detalle del backend: un 403 y "no hay datos" NO se
    // pueden dibujar igual (así se perdió una semana la tab ESTRATEGIA).
    fetchJson<Vista>(`/api/ap5/vista${qs}`)
      .then((d) => { if (!cancelado) { setV(d); setError(null); } })
      .catch((e: unknown) => {
        if (!cancelado) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (!cancelado) setDibujado(pedido); });
    return () => { cancelado = true; };
  }, [fecha, recarga, pedido]);

  if (error) {
    return (
      <div className="p-4 text-[12px]">
        <div className="border border-[var(--t-neg)] bg-[var(--t-neg)]/10 px-3 py-2 text-[var(--t-neg)]">
          No se pudo cargar POSICIONES Y DIFERENCIAS — {error}
        </div>
        <button onClick={recargar}
          className="mt-2 px-3 py-1 text-[11px] border border-[var(--t-border)] hover:border-[var(--t-accent)]">
          Reintentar
        </button>
      </div>
    );
  }

  if (!v && cargando) return <div className="p-4 text-[12px] text-[var(--t-text-dim)]">Cargando…</div>;
  if (!v) return null;

  if (!v.fecha) {
    return (
      <div className="p-4 text-[12px] text-[var(--t-text-dim)]">
        Todavía no hay posición guardada. La trae <code>jobs.ap5_portfolio</code> (9:00 ART).
      </div>
    );
  }

  // Los bloques de ESTA tab, ya ordenados por el backend (izq · der · el resto).
  const bloques = v.rankings.filter((r) => r.tab === tab);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* ── Barra: día, tabs y lo que la vista no puede afirmar ─────────────
          Todo en UNA sola línea. La pantalla es el reporte y el reporte son los
          rankings: cualquier cosa que no sea eso les come alto. */}
      <div className="flex items-center flex-wrap gap-2 px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-panel)] shrink-0 text-[11px]">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`px-3 py-1 text-[11px] font-semibold tracking-wide border transition-colors ${
              tab === x.id
                ? "bg-[var(--t-accent)] text-[var(--t-on-accent)] border-[var(--t-accent)]"
                : "bg-transparent text-[var(--t-text-dim)] border-[var(--t-border-2)] hover:text-[var(--t-accent)] hover:border-[var(--t-accent)]"
            }`}
          >
            {x.label}
          </button>
        ))}

        <span className="ml-2 text-[var(--t-text-muted)] uppercase tracking-wide text-[9px]">Día</span>
        <select
          value={v.fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-[11px]"
        >
          {v.fechas.map((f) => (
            <option key={f.fecha} value={f.fecha}>
              {fmtFecha(f.fecha)} · {f.cuentas} cuentas
            </option>
          ))}
        </select>
        {cargando && <span className="text-[var(--t-text-muted)]">actualizando…</span>}
        <div className="ml-auto"><Faltantes f={v.faltantes} /></div>
      </div>

      {/* ── La cabecera del reporte ──────────────────────────────────────────
          Las tres cosas que la mesa pone arriba del mail. Una sola línea, sin
          cards: el espacio es de los rankings. Va FUERA de las tabs porque
          habla de todo — repetirla en cada una la haría parecer dos cosas. */}
      <div className="shrink-0 flex items-stretch flex-wrap gap-px bg-[var(--t-border)] border-y border-[var(--t-border)]">
        <Cabecera titulo="Diferencias ACA hoy">
          {v.diferencias_hoy.length === 0 && <Vacio texto="sin diferencias este día" />}
          {v.diferencias_hoy.map((d) => (
            <span key={`${d.familia}-${d.moneda}`} className="flex items-baseline gap-1.5">
              <span className="text-[9px] text-[var(--t-text-muted)]">En {d.moneda}</span>
              <span className={`font-mono tabular-nums font-semibold ${tono(d.importe)}`}>
                {fmt0(d.importe)}
              </span>
            </span>
          ))}
        </Cabecera>

        {/* Las dos salen de la MISMA respuesta (`MarginRequirementReport`),
            sumando CONCEPTOS distintos: el requerimiento suma `Márgenes` y el
            activo integrado `Márgenes + Inicial A3` — esto último verificado
            contra el número real de la mesa el 2026-08-25. `AccountBalance`,
            que parecía el método natural para el integrado, da un agregado por
            cuenta de compensación que no se puede abrir por comitente. Qué
            conceptos suma cada una vive en `config.py` del backend. */}
        <Cabecera titulo="Requerimiento de márgenes">
          <Margenes r={v.requerimiento_margenes} />
        </Cabecera>
        <Cabecera titulo="Activo integrado">
          <Margenes r={v.activo_integrado} />
        </Cabecera>
      </div>

      {tab === "consolidados" ? (
        /* ── CONSOLIDADOS: el cuadro POR INSTRUMENTO del mail ───────────────
           Un bloque por (tab, moneda) — agrícolas arriba, U$S abajo — con su
           TOTAL ya sumado por el backend. */
        <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
          {v.consolidado.map((b) => <CuadroConsolidado key={`${b.tab}-${b.moneda}`} b={b} />)}
          {v.consolidado.length === 0 && (
            <div className="text-[11px] text-[var(--t-text-dim)]">Sin posición este día.</div>
          )}
        </div>
      ) : (
      /* ── Los rankings, y NADA más ────────────────────────────────────────
          Izquierda y derecha las decidió el backend (`lado`), no un match de
          strings acá. Cada panel se estira a lo alto: la pantalla completa es
          para las dos listas. */
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3 p-3 overflow-auto">
        {bloques.map((r) => (
          <Panel
            key={`${r.tab}-${r.grupo}`}
            titulo={r.grupo}
            className="min-h-0"
            extra={
              <span className="text-[10px] text-white/70">
                {r.cuentas} cuentas
              </span>
            }
          >
            <Ladrillo titulo={`Ranking Top ${r.top} +`} items={r.positivos}
              total={r.total_positivo} filas={r.top} onFila={setEditar} />
            <Ladrillo titulo={`Ranking Top ${r.top} −`} items={r.negativos}
              total={r.total_negativo} filas={r.top} onFila={setEditar} />
          </Panel>
        ))}

        {bloques.length === 0 && (
          <div className="text-[11px] text-[var(--t-text-dim)]">
            Ninguna cuenta tiene acumulado en {TABS.find((x) => x.id === tab)?.label.toLowerCase()}.
          </div>
        )}
      </div>
      )}

      {editar && (
        <ModalCuenta
          fila={editar}
          grupos={v.grupos}
          onCerrar={() => setEditar(null)}
          onGuardado={() => { setEditar(null); recargar(); }}
        />
      )}
    </div>
  );
}

/** Una celda de la cabecera del reporte: rótulo chico arriba, valor abajo. */
function Cabecera({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[220px] px-3 py-1.5 bg-[var(--t-panel)]">
      <div className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">{titulo}</div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[12px]">{children}</div>
    </div>
  );
}

/** REQUERIMIENTO DE MÁRGENES: la Σ de las cuentas elegidas, POR MONEDA.
 *
 *  Tres reglas, y las tres vienen de cómo está armada la vista:
 *
 *  1. **Un número por moneda, nunca uno solo.** Sumar Pesos con Dólar da un
 *     número que no significa nada. Es la misma regla del resto de AP5.
 *  2. **Acá no se suma nada.** Los totales los calcula el backend, en la misma
 *     query que trae el detalle — así la card no puede contradecir a la tabla.
 *  3. **Si falta una cuenta, se dice.** Con dos cuentas y una sola presente el
 *     número igual sale y se ve creíble; el aviso es lo único que lo delata.
 */
function Margenes({ r }: { r: Requerimiento }) {
  if (!r || (r.por_moneda.length === 0 && r.cuentas_encontradas === 0)) {
    return <Vacio texto="sin datos este día" />;
  }
  // Las DOS formas de que el número salga incompleto y creíble: que falte una
  // cuenta, o que falte un concepto. Los dos conteos los hace el backend contra
  // la base — acá sólo se dibujan.
  const avisos = [
    r.cuentas_faltantes.length
      ? `faltan ${r.cuentas_faltantes.length} de ${r.cuentas_pedidas} cuentas`
      : "",
    r.conceptos_faltantes.length ? `sin ${r.conceptos_faltantes.join(", ")}` : "",
  ].filter(Boolean);
  return (
    <>
      {r.por_moneda.map((m) => (
        <span key={m.moneda} className="flex items-baseline gap-1.5">
          <span className="text-[9px] text-[var(--t-text-muted)]">En {m.moneda}</span>
          <span
            className="font-mono tabular-nums font-semibold"
            title={[
              `Conceptos: ${r.conceptos.join(" + ")}`,
              ...r.detalle
                .filter((d) => d.moneda === m.moneda)
                .map(
                  (d) =>
                    `${d.titular || d.cuenta} (${d.cuenta}/${d.cuenta_compensacion}) · ${d.concepto}: ${fmt0(d.importe)}`,
                ),
            ].join("\n")}
          >
            {fmt0(m.importe)}
          </span>
        </span>
      ))}
      {avisos.length > 0 && (
        <span
          className="text-[10px] text-[var(--t-neg)]"
          title={[
            r.cuentas_faltantes.length
              ? `Cuentas que no vinieron: ${r.cuentas_faltantes.join(", ")}`
              : "",
            r.conceptos_faltantes.length
              ? `Conceptos declarados que no vinieron: ${r.conceptos_faltantes.join(", ")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n")}
        >
          {avisos.join(" · ")}
        </span>
      )}
    </>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <span className="text-[11px] text-[var(--t-text-muted)]">{texto}</span>;
}

/** Un cuadro del CONSOLIDADO: FUTUROS AGRÍCOLAS o FUTUROS U$S.
 *
 *  Cabecera de dos pisos como el mail: POSICIÓN agrupa compra/venta/neta.
 *
 *  ⚠️ **Acá no se suma nada.** El TOTAL viene calculado del backend, de la
 *  misma query que las filas. Un total sumado en el navegador no se puede
 *  verificar del lado del servidor — y este cuadro se imprime para gerencia.
 */
function CuadroConsolidado({ b }: { b: Consolidado }) {
  const agro = b.tab === "agro";
  const titulo = agro ? "FUTUROS AGRÍCOLAS" : "FUTUROS U$S";
  // El rótulo de la posición sale de la UNIDAD real, no de un supuesto: si en
  // el cuadro conviven dos unidades no se puede afirmar una sola.
  const neta = b.unidad ? `Posición ${b.unidad} Neta` : "Posición Neta";

  return (
    <Panel titulo={titulo} extra={<span className="text-[10px] text-white/70">{b.moneda}</span>}>
      {/* ⚠️ `table-fixed` + <colgroup>: los anchos los fija el CÓDIGO, no el
          contenido. Con el `table-auto` de siempre cada columna se estira según
          lo que le toca —y "Diferencias Acum. al Día Ant." es el header más
          largo de todos—, así que el bloque POSICIÓN no caía exactamente sobre
          sus tres columnas y el cuadro se leía corrido. Con anchos declarados
          eso no puede pasar, y de paso los dos cuadros (agrícolas y U$S) quedan
          con la MISMA grilla aunque tengan distinta cantidad de filas. */}
      <table className="w-full table-fixed text-[11px] font-mono tabular-nums whitespace-nowrap">
        <colgroup>
          <col className="w-[16%]" />{/* Instrumento */}
          <col className="w-[12%]" />{/* Compra  ┐                              */}
          <col className="w-[12%]" />{/* Venta   ├ POSICIÓN — 38% en total       */}
          <col className="w-[14%]" />{/* Neta    ┘                              */}
          <col className="w-[15%]" />{/* Acum. al día     */}
          <col className="w-[15%]" />{/* Acum. al día ant. */}
          <col className="w-[16%]" />{/* Diaria           */}
        </colgroup>
        <thead>
          <tr className="text-[9px] uppercase text-[var(--t-text-muted)] border-b border-[var(--t-border-2)]">
            <th rowSpan={2} className="text-left px-2 py-1 font-normal align-bottom">Instrumento</th>
            <th colSpan={3} className="text-center px-2 py-1 font-normal border-x border-[var(--t-border-2)] bg-[var(--t-bg)]">
              Posición
            </th>
            <th rowSpan={2} className="text-right px-2 py-1 font-normal align-bottom leading-tight">Diferencias<br />Acum. al Día</th>
            <th rowSpan={2} className="text-right px-2 py-1 font-normal align-bottom leading-tight">Diferencias<br />Acum. al Día Ant.</th>
            <th rowSpan={2} className="text-right px-2 py-1 font-normal align-bottom leading-tight">Diferencia<br />Diaria</th>
          </tr>
          <tr className="text-[9px] uppercase text-[var(--t-text-muted)] border-b border-[var(--t-border)]">
            <th className="text-right px-2 py-1 font-normal border-l border-[var(--t-border-2)]">Compra</th>
            <th className="text-right px-2 py-1 font-normal">Venta</th>
            <th className="text-right px-2 py-1 font-normal border-r border-[var(--t-border-2)]">{neta}</th>
          </tr>
        </thead>
        <tbody>
          {b.filas.map((r) => (
            <tr key={r.producto} className="border-b border-[var(--t-border-2)]">
              <td className="px-2 py-1 font-semibold">{r.etiqueta}</td>
              {/* Sin multiplicador la cantidad en unidad NO se puede afirmar:
                  se muestran los CONTRATOS crudos, en vez de un número 100
                  veces más chico que parece bien. */}
              {r.sin_multiplicador > 0 ? (
                <td colSpan={3} className="px-2 py-1 text-[var(--t-neg)] border-x border-[var(--t-border-2)]"
                  title={`${r.sin_multiplicador} filas sin multiplicador conocido`}>
                  {fmt0(r.compra_contratos)} / {fmt0(r.venta_contratos)} contratos · sin multiplicador
                </td>
              ) : (
                <>
                  <td className="px-2 py-1 text-right border-l border-[var(--t-border-2)]">{fmt0(r.compra)}</td>
                  <td className="px-2 py-1 text-right">{fmt0(r.venta)}</td>
                  <td className="px-2 py-1 text-right font-semibold border-r border-[var(--t-border-2)]">{fmt0(r.neta)}</td>
                </>
              )}
              <td className={`px-2 py-1 text-right ${tono(r.acum_hoy)}`}>{fmt0(r.acum_hoy)}</td>
              <td className={`px-2 py-1 text-right ${tono(r.acum_ayer)}`}>{fmt0(r.acum_ayer)}</td>
              <td className={`px-2 py-1 text-right font-semibold ${tono(r.diaria)}`}>{fmt0(r.diaria)}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-[var(--t-border)] bg-[var(--t-bg)]">
            <td className="px-2 py-1 font-semibold">TOTAL</td>
            <td className="px-2 py-1 text-right font-semibold border-l border-[var(--t-border-2)]">{fmt0(b.total.compra)}</td>
            <td className="px-2 py-1 text-right font-semibold">{fmt0(b.total.venta)}</td>
            <td className="px-2 py-1 text-right font-semibold border-r border-[var(--t-border-2)]">{fmt0(b.total.neta)}</td>
            <td className={`px-2 py-1 text-right font-semibold ${tono(b.total.acum_hoy)}`}>{fmt0(b.total.acum_hoy)}</td>
            <td className={`px-2 py-1 text-right font-semibold ${tono(b.total.acum_ayer)}`}>{fmt0(b.total.acum_ayer)}</td>
            <td className={`px-2 py-1 text-right font-semibold ${tono(b.total.diaria)}`}>{fmt0(b.total.diaria)}</td>
          </tr>
        </tbody>
      </table>
      {b.total.sin_multiplicador > 0 && (
        <div className="px-2 py-1 text-[9px] text-[var(--t-neg)] border-t border-[var(--t-border)]">
          ⚠ La posición del TOTAL está incompleta: {b.total.sin_multiplicador} fila(s) sin
          multiplicador conocido, así que su cantidad no se pudo expresar en {b.unidad ?? "su unidad"}.
        </div>
      )}
    </Panel>
  );
}

/** Medio ranking (a favor / en contra).
 *
 *  ⚠️ **Acá NO se marca la cuenta sin arrastre cargado** (2026-08-25, pedido
 *  del user: esta vista se imprime como PDF para gerencia). El aviso sigue
 *  existiendo, pero UNA sola vez y en la barra de herramientas — que es de la
 *  mesa, no del informe. Ojo con lo que significa: sin arrastre el acumulado
 *  cuenta solo desde nuestro primer día guardado, así que el orden del top
 *  puede no ser el del mail. El cartel se sacó; el problema se cierra cargando
 *  el arrastre, no escondiéndolo. El TOTAL es de TODAS las cuentas, no del
 *  top: el ranking recorta la LISTA, no la suma. Si el total saliera de las 10
 *  filas, mostrar 10 cambiaría el número y nadie lo notaría. */
function Ladrillo({ titulo, items, total, filas, onFila }: {
  titulo: string; items: RankItem[]; total: number;
  /** Alto RESERVADO, en filas. Ver el comentario de las filas vacías. */
  filas: number;
  onFila: (i: RankItem) => void;
}) {
  // Las filas que faltan para llegar al tope. Se dibujan VACÍAS a propósito:
  // sin esto el panel se encoge a su cantidad de cuentas y, en FUTUROS DÓLAR
  // —donde hay pocas—, Cooperativas y MUNDO ACA quedan de altos distintos y las
  // dos tablas se desalinean. Reservar el alto cuesta espacio en blanco y
  // devuelve dos cuadros que se leen en paralelo, que es como se usa el informe.
  const vacias = Math.max(0, filas - items.length);
  return (
    <div className="border-b border-[var(--t-border)] last:border-b-0">
      <div className="flex items-center justify-between px-2 py-1 bg-[var(--t-bg)] text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
        <span>{titulo}</span>
        <span className={`font-mono tabular-nums ${tono(total)}`} title="acumulado de TODAS las cuentas del grupo, no solo del top 10">
          {fmt2(total, 0)}
        </span>
      </div>
      <table className="w-full text-[11px] font-mono tabular-nums">
        <tbody>
          {items.map((i, n) => (
            <tr
              key={i.cuenta}
              onClick={() => onFila(i)}
              title="cargar grupo o acumulado"
              className="border-b border-[var(--t-border-2)] last:border-b-0 cursor-pointer hover:bg-[var(--t-accent)]/5"
            >
              <td className="px-1 py-0.5 text-[9px] text-[var(--t-text-muted)] text-right w-6">{n + 1}</td>
              <td className="px-2 py-0.5 truncate max-w-0 w-full" title={`${i.nombre} (${i.cuenta})`}>
                {i.nombre}
              </td>
              <td className="px-2 py-0.5 text-[9px] text-[var(--t-text-muted)] whitespace-nowrap">{i.moneda}</td>
              <td className={`px-2 py-0.5 text-right whitespace-nowrap ${tono(i.importe)}`}>{fmt2(i.importe, 0)}</td>
            </tr>
          ))}
          {/* Las filas que faltan para llegar al tope, numeradas SIGUIENDO a las
              que hay. Antes, con la lista vacía, se dibujaba una fila "—" y las
              vacías arrancaban en 1 igual: quedaba —, 1, 2 … 9, o sea el puesto
              corrido y una fila de menos. Ahora la numeración es una sola. */}
          {Array.from({ length: vacias }, (_, k) => (
            <tr key={`vacia-${k}`} className="border-b border-[var(--t-border-2)] last:border-b-0">
              <td className="px-1 py-0.5 text-[9px] text-[var(--t-text-muted)] text-right w-6">
                {items.length + k + 1}
              </td>
              {/* &nbsp; y no una celda vacía: una celda sin contenido colapsa y
                  la fila no reserva alto, que es justo lo que hay que evitar. */}
              <td colSpan={3} className="px-2 py-0.5">
                {items.length === 0 && k === 0
                  ? <span className="text-[var(--t-text-muted)]">— sin cuentas de este lado</span>
                  : <>&nbsp;</>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Lo que la vista NO puede afirmar. Se declara, no se esconde: omitirlo daría
 *  un total plausible al que le falta algo. */
function Faltantes({ f }: { f: Faltantes }) {
  const sinMult = f.simbolos_sin_multiplicador ?? [];
  const fuera = f.fuera_de_tabs ?? [];
  const avisos: string[] = [];
  // Lo primero: una posición que no se dibuja en ninguna tab. Es lo que más
  // fácil pasa desapercibido, justamente porque no está en pantalla.
  for (const x of fuera) {
    avisos.push(`${FAMILIA[x.familia] ?? x.familia}: ${x.cuentas} cuenta(s) fuera de las tabs`);
  }
  if (sinMult.length) avisos.push(`${sinMult.length} símbolo(s) sin multiplicador`);
  if (f.cuentas_sin_grupo) avisos.push(`${f.cuentas_sin_grupo} sin grupo`);
  if (f.cuentas_sin_nombre) avisos.push(`${f.cuentas_sin_nombre} sin nombre`);
  if (f.cuentas_sin_cargar) avisos.push(`${f.cuentas_sin_cargar} sin arrastre cargado`);
  if (!avisos.length) return <span className="text-[10px] text-[var(--t-text-muted)]">sin faltantes</span>;
  return (
    <span
      className="text-[10px] text-[var(--t-neg)] border border-[var(--t-neg)]/40 px-2 py-0.5"
      title={sinMult.map((s) => `${s.symbol} (${s.filas} filas)`).join("\n") || undefined}
    >
      ⚠ {avisos.join(" · ")}
    </span>
  );
}

/** Las DOS cosas que ninguna fuente sabe y carga una persona: el GRUPO (parte
 *  los rankings; la cámara no lo sabe y NO se deduce del nombre — REGLA #9) y el
 *  ARRASTRE del acumulado (la cámara manda la diferencia del día, no el
 *  arrastre; lo anterior a nuestra serie solo existe en la planilla de la mesa).
 *
 *  Las DOS monedas van siempre juntas, en campos separados: el agro liquida en
 *  Dólar MtR y el dólar futuro en Pesos. No hay un campo "moneda" con un
 *  importe —eso dejaría una cargada y la otra sin saber si está en cero o sin
 *  cargar— ni un total, porque un total de las dos no significa nada.
 */
function ModalCuenta({ fila, grupos, onCerrar, onGuardado }: {
  fila: RankItem; grupos: string[]; onCerrar: () => void; onGuardado: () => void;
}) {
  const [grupo, setGrupo] = useState(fila.grupo === "(sin grupo)" ? "" : fila.grupo);
  const [pesos, setPesos] = useState("");
  const [mtr, setMtr] = useState("");
  const [fecha, setFecha] = useState(fila.fecha_arrastre ?? "");
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setErr(null);
    try {
      // Dos recursos distintos → dos llamadas. Solo se manda lo que cambió.
      if (grupo !== (fila.grupo === "(sin grupo)" ? "" : fila.grupo)) {
        await fetchJson("/api/ap5/cuentas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ account: fila.cuenta, grupo }),
        });
      }
      if (fecha && (pesos !== "" || mtr !== "")) {
        await fetchJson("/api/ap5/acumulado", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            account: fila.cuenta,
            acumulado_pesos: Number(pesos || 0),
            acumulado_mtr: Number(mtr || 0),
            fecha,
          }),
        });
      }
      onGuardado();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCerrar}>
      <div
        className="w-[480px] max-w-[92vw] border border-[var(--t-border)] bg-[var(--t-panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-[var(--t-border)] bg-[var(--t-brand)]">
          <div className="text-[11px] font-semibold text-white">{fila.nombre}</div>
          <div className="text-[9px] text-white/70">
            cuenta {fila.cuenta}
            {fila.cargado
              ? ` · arrastre cargado hasta ${fila.fecha_arrastre ?? "—"}`
              : " · sin arrastre cargado"}
          </div>
        </div>

        <div className="p-3 space-y-3 text-[11px]">
          <label className="block">
            <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Grupo</span>
            <input
              list="ap5-grupos" value={grupo} onChange={(e) => setGrupo(e.target.value)}
              placeholder="COOPERATIVAS / MUNDO ACA"
              className="w-full mt-0.5 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1"
            />
            <datalist id="ap5-grupos">{grupos.map((g) => <option key={g} value={g} />)}</datalist>
            <span className="text-[9px] text-[var(--t-text-muted)]">
              Es lo que parte los rankings. La cámara no lo sabe. Vacío lo saca.
            </span>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Acumulado Pesos</span>
              <input
                value={pesos} onChange={(e) => setPesos(e.target.value)} inputMode="decimal"
                placeholder="0"
                className="w-full mt-0.5 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 font-mono tabular-nums"
              />
            </label>
            <label className="block">
              <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Acumulado MtR</span>
              <input
                value={mtr} onChange={(e) => setMtr(e.target.value)} inputMode="decimal"
                placeholder="0"
                className="w-full mt-0.5 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 font-mono tabular-nums"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">Fecha</span>
            <input
              type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full mt-0.5 bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1"
            />
            <span className="text-[9px] text-[var(--t-text-muted)]">
              Los dos importes YA contienen todo hasta este día. El sistema suma
              los días POSTERIORES — si ponés el primer día de la serie, ese día
              deja de contar.
            </span>
          </label>

          {err && <div className="text-[var(--t-neg)]">{err}</div>}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onCerrar}
              className="px-3 py-1 border border-[var(--t-border)] text-[var(--t-text-dim)] hover:text-[var(--t-text)]">
              Cancelar
            </button>
            <button onClick={() => void guardar()} disabled={guardando}
              className="px-3 py-1 border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
