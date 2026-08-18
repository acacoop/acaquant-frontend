"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";

/**
 * Back Office → INTERBANKING. Los bancos de ACA, para CONCILIAR.
 *
 * **UN día, no un rango** (user, 2026-08-18: «la fecha es una sola, es siempre el
 * mismo día»). Un solo selector de fecha, compartido por las dos sub-tabs; sin
 * fecha manda el backend, que usa HOY en hora argentina — así la pantalla no
 * depende del reloj del navegador.
 *
 * ── CONSOLIDADO BANCOS (default) — UNA fila por cuenta, agrupadas bajo el
 *    nombre del banco: SALDO AL INICIO · SALDO AL CIERRE · VARIACIÓN · GASTOS
 *    BANCARIOS · MOVS. Los dos saldos los informa el banco (apertura y cierre de
 *    ESE día): no los calculamos. La cuenta va a la IZQUIERDA con el número
 *    ENTERO; las columnas de datos van CENTRADAS, de ancho parejo y separadas
 *    por una línea.
 *
 *    El agrupado por banco existe para poder navegar 38 cuentas, nada más: **no
 *    hay subtotales por banco ni totales por moneda** — los sacó el back office
 *    porque no los usaba, y sin ellos la vista arranca directo en la tabla.
 *
 *    ⚠️ Lista TODAS las cuentas activas. El CIERRE tiene dos fuentes y la celda
 *    rotula cuál: sin rótulo = extracto; «saldo» = lo informa el banco pero la
 *    cuenta no se movió y no hay extracto que lo respalde; «≠» = el banco
 *    informa las dos y no coinciden (hallazgo de conciliación). Sin ninguna de
 *    las dos va «—» y nunca 0 — poner cero sería inventar.
 *
 *    GASTOS BANCARIOS sale del backend y hoy viene **null** en todas las filas:
 *    la regla de qué movimiento es un gasto todavía no está definida. Se muestra
 *    «—» y NO cero, porque «no sabemos» y «no hubo gastos» son cosas distintas.
 *
 * ── DETALLE POR CUENTA — una cuenta a la vez, repartido 1/3 · 2/3: EXTRACTO a la
 *    izquierda (el día: apertura · créditos · débitos · cierre) y MOVIMIENTOS a
 *    la derecha, con las 8 columnas que pidió el back office el 2026-08-18:
 *    FECHA · DESCRIPCIÓN · CONCEPTO · COD OP · COD OP BCO · COMPROBANTE ·
 *    SUCURSAL · IMPORTE. Las dos últimas que faltaban (`sucursal` y
 *    `codigo_banco`) ya estaban GUARDADAS en `bancos.movimientos` desde la
 *    primera corrida: el backend simplemente no las publicaba, así que sumarlas
 *    no costó ni una llamada nueva a Interbanking ni un backfill.
 *    La cuenta se elige en DOS pasos —primero el banco, después la cuenta de ESE
 *    banco— porque un selector único con 38 opciones no se navega.
 *
 * **Clic en una celda con dato = se copia al portapapeles** (flash verde). Estos
 * datos se pegan en otros sistemas todo el día. Las celdas sin dato («—») no
 * reaccionan: un cursor de mano que no hace nada promete algo que no pasa.
 *
 * De dónde sale el dato: `jobs/interbanking_sync` trae extracto + saldo a
 * `bancos.*` cada 2 horas (9 a 19 ART) y esta vista lee de ahí. **La pantalla
 * nunca le pega a Interbanking**: el límite de 100 llamadas/minuto es del ABONADO
 * y no del proceso. La barra de arriba dice **Última actualización** con la fecha
 * y hora de la última sincronización del job — una tabla vacía con el job caído
 * no es "no hubo movimientos".
 *
 * El día por defecto es el **hábil ANTERIOR a hoy**, que es el que está cerrado:
 * el banco ya informó su extracto completo. Lo decide el backend, no el reloj
 * del navegador. `bancos.*` guarda solo las **3 fechas** más recientes.
 *
 * ⚠️ **Nada de esto se mezcla con TESORERÍA.** Son objetos sin clave en común: la
 * cuenta operativa de Aunesa es una imputación interna del agente; esto es la
 * cuenta bancaria real. Ver docs/INTERBANKING.md.
 *
 * El **número de cuenta va ENTERO** (decisión del user 2026-08-18: son las
 * cuentas de la casa y el número es lo que se copia a otros sistemas). El **CBU
 * NO sale nunca** — identificar la cuenta y poder transferirle plata son dos
 * permisos distintos; hay tests que lo congelan.
 */

type Cuenta = {
  id: number;
  banco: string;
  banco_nombre: string;
  tipo: string;
  moneda: string;
  etiqueta: string;
  numero: string;
  activa: boolean;
};

type CuentaConsolidada = Cuenta & {
  saldo_inicio: number | null;
  saldo_cierre: number | null;
  variacion: number | null;
  movimientos: number | null;
  // De dónde salió el CIERRE. Lo decide el backend, la pantalla solo lo rotula.
  //   "extracto" → apertura/cierre del extracto (con su detalle de movimientos)
  //   "saldo"    → `bancos.saldos`: la cuenta no se movió ese día y el extracto
  //                no la devuelve, pero el banco igual informa cuánto hay
  //   null       → no sabemos (cuenta con «—»)
  fuente: "extracto" | "saldo" | null;
  saldo_banco: number | null;
  // El banco informó las DOS cosas y no coinciden: hallazgo de conciliación.
  discrepancia: number | null;
  // Suma de los gastos que cobró el banco ese día. **null mientras la regla de
  // clasificación no esté definida** — «no sabemos» no es «no hubo gastos», así
  // que jamás cero por defecto.
  gastos_bancarios: number | null;
  gastos_desglose: Desglose | null;
};

type Banco = {
  banco: string;
  banco_nombre: string;
  cuentas: CuentaConsolidada[];
};

type Sync = { corrida_at: string; cuentas: number; con_error: number } | null;

type Conectado = { email: string; visto_at: string };

/** Un balde del desglose de gastos. Las etiquetas las manda el BACKEND: si el
 *  front las copiara, cambiar un balde obligaría a tocar dos lados. */
type Balde = { clave: string; etiqueta: string; grupo: "concepto" | "otros" };

/** {clave: monto} + `total` + `resto`. `resto` es el gasto que no cayó en
 *  ningún balde — no es columna, se muestra en el modal solo si no es cero. */
type Desglose = Record<string, number>;

/** Una regla del catálogo que clasifica un movimiento como gasto bancario. */
type Regla = {
  id: number; campo: string; operador: string; valor: string;
  nota: string | null; activa: boolean; creado_por: string | null;
};

type RespConsolidado = {
  fecha: string;
  conectados: Conectado[];
  puede_escribir: boolean;
  desglose: Balde[];
  bancos: Banco[];
  cuentas: number;
  sin_datos: number;
  gastos_definidos: boolean;
  sync: Sync;
};

type Dia = {
  fecha: string;
  saldo_apertura: number | null;
  saldo_cierre: number | null;
  creditos: number | null;
  debitos: number | null;
  movimientos_banco: number | null;
  movimientos_base: number | null;
  cierra: boolean | null;
  diferencia: number | null;
};

type Movimiento = {
  // Identidad del movimiento: es lo que se manda para marcarlo como gasto.
  mov_hash: string;
  es_gasto?: boolean;
  // De DÓNDE salió la marca: "regla" (la clasificó el catálogo) o "manual"
  // (alguien la decidió). Viaja hasta la pantalla a propósito — ver el comentario
  // de la columna GASTO.
  gasto_origen?: "regla" | "manual" | null;
  fecha: string | null;
  hora: string | null;
  importe: number | null;
  tipo: string | null;
  descripcion: string;
  concepto: string;
  codigo: string | null;
  codigo_banco: string | null;
  sucursal: string | null;
  extracto: string | null;
  correlativo: number | null;
  comprobante: number | null;
  contraparte: string | null;
  contraparte_cuit: string | null;
};

type RespVista = {
  cuentas: Cuenta[];
  cuenta_id: number | null;
  puede_escribir: boolean;
  reglas: Regla[];
  desglose: Balde[];
  fecha: string;
  dias: Dia[];
  movimientos: Movimiento[];
  resumen: {
    dias: number;
    movimientos: number;
    creditos: number;
    debitos: number;
    neto: number;
    dias_que_no_cierran: string[];
    dias_incompletos: string[];
    saldo_final: number | null;
    gastos: number;
    gastos_desglose: Desglose;
  };
  sync: Sync;
};

const CONSOLIDADO_VACIO: RespConsolidado = {
  fecha: "", conectados: [], puede_escribir: false, desglose: [], bancos: [], cuentas: 0,
  sin_datos: 0, gastos_definidos: false, sync: null,
};

const VISTA_VACIA: RespVista = {
  cuentas: [], cuenta_id: null, puede_escribir: false, reglas: [], desglose: [],
  fecha: "", dias: [], movimientos: [],
  resumen: {
    dias: 0, movimientos: 0, creditos: 0, debitos: 0, neto: 0, gastos: 0, gastos_desglose: {},
    dias_que_no_cierran: [], dias_incompletos: [], saldo_final: null,
  },
  sync: null,
};

// El dato cambia cada 2 horas: pollear seguido no aporta.
const POLL_MS = 60_000;

/**
 * Las columnas de DATOS del consolidado: contenido centrado, ancho parejo y una
 * línea a la izquierda que las separa.
 *
 * El `w-[13%]` es lo que arregla el hueco: sin un ancho declarado, la columna
 * CUENTA se quedaba con TODO el espacio sobrante y los números terminaban
 * apretados contra el margen derecho, con una franja en blanco enorme en el
 * medio. Con 5 columnas al 13% ocupan el 65% de la fila y se reparten parejo;
 * CUENTA se queda con el resto, que le alcanza de sobra para entrar entera.
 *
 * Se declara UNA vez para que la cabecera y las filas no puedan desalinearse.
 */
const COL_DATO = "w-[13%] border-l border-[var(--t-border)]";

/** Igual que `COL_DATO` pero SIN ancho fijo, para las tablas del DETALLE: ahí las
 *  columnas son muchas y angostas, y forzarles un porcentaje las desbordaría. */
const COL_SEP = "border-l border-[var(--t-border)]";

function plata(v: number | null | undefined, moneda = "") {
  if (v === null || v === undefined) return "—";
  const s = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
  return moneda ? `${moneda} ${s}` : s;
}

/** Quién más tiene la vista abierta. Mismo patrón que Tesorería y SENEBIS. */
function Presencia({ conectados }: { conectados: Conectado[] }) {
  if (!conectados.length) return null;
  return (
    <div className="flex items-center gap-1" title={conectados.map((c) => c.email).join("\n")}>
      <span className="text-[9px] text-[var(--t-text-muted)] uppercase">En vista:</span>
      {conectados.map((c) => (
        <span
          key={c.email}
          title={c.email}
          className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border)] bg-[var(--t-panel)] uppercase"
        >
          {c.email.split("@")[0]}
        </span>
      ))}
    </div>
  );
}

/** «18/08/2026 13:42». Fecha, hora y minuto — nada más (user, 2026-08-18). */
function momento(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} `
    + `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Suma varios baldes del desglose. Devuelve **null y no 0** cuando no hay
 * desglose: «no sabemos» y «no hubo gastos» son cosas distintas, y un cero acá
 * se leería como que el banco no cobró nada.
 */
function sumaBaldes(d: Desglose | null | undefined, baldes: Balde[]) {
  if (!d) return null;
  return Math.round(baldes.reduce((a, b) => a + (d[b.clave] ?? 0), 0) * 100) / 100;
}


/* ══════════════════════════════════════════════════════════════════════════ */

export function InterbankingView() {
  // UNA fecha, no un rango (user, 2026-08-18: «la fecha es una sola, es siempre
  // el mismo día»). Arranca vacía A PROPÓSITO: sin fecha el backend usa el día
  // HÁBIL ANTERIOR, así el default lo decide el servidor y no el navegador.
  const [fecha, setFecha] = useState("");

  // Identidad ESTABLE (useCallback sin deps) + update funcional: si se pasara una
  // arrow inline, cambiaría en cada render y el efecto del hijo que la tiene en
  // deps correría en cada render. Solo completa si está vacía, así que nunca
  // pisa el día que el usuario eligió a mano.
  const aplicarFecha = useCallback((f: string) => setFecha((p) => p || f), []);

  // Cuándo sincronizó el JOB con el banco. Lo reporta el consolidado (viene en
  // su payload) y se muestra ACÁ ARRIBA, en una sola línea. Antes era una franja
  // de texto explicando cada cuánto corre el cron y cuántas cuentas no tenían
  // dato: el back office la sacó, y tenía razón — una pantalla no se explica a
  // sí misma en prosa. Lo único que hace falta saber es de cuándo es el dato.
  const [syncAt, setSyncAt] = useState<string | null>(null);
  // Quién más tiene la vista abierta. Mismo patrón que Tesorería y SENEBIS: el
  // poll de la vista ES el heartbeat, no hay un endpoint aparte que golpear.
  const [enLinea, setEnLinea] = useState<Conectado[]>([]);

  // La cuenta cuyo detalle está abierto. `null` = modal cerrado.
  const [abierta, setAbierta] = useState<CuentaConsolidada | null>(null);
  const cerrar = useCallback(() => setAbierta(null), []);

  return (
    <div className="h-full min-h-0 flex flex-col text-[12px]">
      <div className="shrink-0 border-b border-[var(--t-border)] bg-[var(--t-panel)] px-3 py-1.5 flex flex-wrap items-center gap-3">
        <span className="text-[11px] uppercase tracking-wide font-semibold">
          Consolidado Bancos
        </span>
        <span className="text-[11px] text-[var(--t-text-dim)]">
          Última actualización {momento(syncAt)}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <Presencia conectados={enLinea} />
          <Fecha label="Fecha" value={fecha} onChange={setFecha} />
        </div>
      </div>

      <Consolidado
        fecha={fecha}
        onFecha={aplicarFecha}
        onSync={setSyncAt}
        onEnLinea={setEnLinea}
        onAbrir={setAbierta}
      />

      {abierta && (
        <ModalMovimientos cuenta={abierta} fecha={fecha} onCerrar={cerrar} />
      )}
    </div>
  );
}

/* ── CONSOLIDADO BANCOS ─────────────────────────────────────────────────── */

function Consolidado({
  fecha, onFecha, onSync, onEnLinea, onAbrir,
}: {
  fecha: string; onFecha: (f: string) => void; onSync: (s: string | null) => void;
  onEnLinea: (c: Conectado[]) => void; onAbrir: (c: CuentaConsolidada) => void;
}) {
  const url = useMemo(
    () => `/api/back-office/interbanking/consolidado${fecha ? `?fecha=${fecha}` : ""}`,
    [fecha],
  );

  const { data, lastAt, error } = usePoll<RespConsolidado>(url, CONSOLIDADO_VACIO, POLL_MS, {
    fetchOnMount: true,
  });

  useEffect(() => {
    if (data.fecha) onFecha(data.fecha);
  }, [data.fecha, onFecha]);

  useEffect(() => {
    onSync(data.sync?.corrida_at ?? null);
  }, [data.sync?.corrida_at, onSync]);

  useEffect(() => { onEnLinea(data.conectados); }, [data.conectados, onEnLinea]);

  // Los conceptos tienen columna propia; el grupo "otros" se suma en UNA sola
  // (OTROS IMP) y se abre adentro del modal.
  const conceptos = useMemo(
    () => data.desglose.filter((b) => b.grupo === "concepto"), [data.desglose]);
  const otros = useMemo(
    () => data.desglose.filter((b) => b.grupo === "otros"), [data.desglose]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ErrorLinea error={error} />

      {/* La barra de totales por moneda se ELIMINÓ (user, 2026-08-18: «no tiene
          sentido todas esas columnas de ahí arriba»). La vista arranca en la
          tabla. */}

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse table-auto">
          <thead className="sticky top-0 bg-[var(--t-panel)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
            {/* ⚠️ El ancho de CUENTA se resuelve ACÁ, con `w-full` en su `<th>`.
                En una tabla de layout automático, la columna que declara
                `width:100%` se queda con TODO el espacio que sobra después de
                que las demás toman el que necesitan para su contenido. Las de
                números son cortas, así que el sobrante es casi todo para CUENTA
                y el nombre entra entero sin scroll.

                Lo que NO alcanzaba: `whitespace-nowrap` en la celda solo evita
                que el texto salte de línea — no le da ancho a la columna, así
                que el nombre seguía cortado. Y `w-auto` en la tabla tampoco:
                sin slack que repartir, cada columna se queda con lo justo. */}
            {/* SALDO AL INICIO, VARIACIÓN y MOVS. se sacaron (user, 2026-08-18:
                «no sirven»). En su lugar entra el DESGLOSE de los gastos, que es
                lo que el back office sí mira: cuánto del total es IVA, cuánto
                percepción y cuánto comisión.

                Las columnas del desglose las declara el BACKEND (`data.desglose`)
                — acá no hay una lista de etiquetas copiada que pueda quedar
                diciendo algo distinto que el número que la llena. */}
            <tr>
              <Th>Cuenta</Th>
              <Th center className={COL_DATO}>Saldo al cierre</Th>
              <Th center className={COL_DATO}>Gastos bancarios</Th>
              {conceptos.map((b) => (
                <Th key={b.clave} center className={COL_DATO}>{b.etiqueta}</Th>
              ))}
              <Th center className={COL_DATO}>Otros imp.</Th>
            </tr>
          </thead>
          <tbody>
            {data.bancos.map((b) => (
              <BloqueBanco
                key={`${b.banco}-${b.banco_nombre}`}
                banco={b}
                conceptos={conceptos}
                otros={otros}
                onAbrir={onAbrir}
              />
            ))}
            {data.bancos.length === 0 && (
              <Vacia cols={3 + conceptos.length + 1} hubo={lastAt > 0} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BloqueBanco({
  banco, conceptos, otros, onAbrir,
}: {
  banco: Banco; conceptos: Balde[]; otros: Balde[];
  onAbrir: (c: CuentaConsolidada) => void;
}) {
  return (
    <>
      {/* El banco como TÍTULO de su bloque de cuentas. Agrupa para poder
          navegar 38 cuentas, nada más: los subtotales por banco y por moneda se
          ELIMINARON (user, 2026-08-18) — cada fila se lee sola. */}
      <tr className="bg-[var(--t-surface-2)] border-y border-[var(--t-border)]">
        <td
          colSpan={3 + conceptos.length + 1}
          className="px-2 py-1.5 font-semibold tracking-wide"
        >
          {banco.banco_nombre || "(sin nombre)"}
          <span className="ml-2 text-[10px] font-normal text-[var(--t-text-dim)]">
            BCRA {banco.banco} · {banco.cuentas.length} cuenta(s)
          </span>
        </td>
      </tr>

      {banco.cuentas.map((c) => (
        <tr key={c.id} className="border-b border-[var(--t-border)]">
          {/* ⚠️ La fila tiene DOS gestos distintos y no es arbitrario:
              · clic en la CUENTA → abre el detalle del día (la cuenta es la
                identidad de la fila, y "entrar" es la acción sobre ella);
              · clic en una celda de DATOS → copia el número al portapapeles.
              Si la cuenta también copiara, no habría con qué abrir el detalle;
              el número igual se copia desde el encabezado del modal. */}
          <td
            onClick={() => onAbrir(c)}
            title="Ver los movimientos del día"
            className="px-2 py-1 whitespace-nowrap cursor-pointer hover:bg-[var(--t-surface)]"
          >
            <span className="pl-3">
              {c.tipo} {c.moneda} · <span className="font-semibold">{c.numero}</span>
              {c.etiqueta ? (
                <span className="text-[var(--t-text-dim)]"> · {c.etiqueta}</span>
              ) : null}
            </span>
          </td>
          <Td center strong className={COL_DATO} copiar={plata(c.saldo_cierre)}>
            {plata(c.saldo_cierre)}
            {/* El saldo que NO viene del extracto se rotula: es el mismo banco
                informando, pero es otra fuente y el back office tiene que poder
                distinguirlo de un cierre respaldado por su detalle. */}
            {c.fuente === "saldo" && (
              <span
                className="ml-1 text-[9px] uppercase text-[var(--t-text-dim)]"
                title="Saldo informado por el banco. La cuenta no tuvo movimientos ese día, así que no hay extracto que lo respalde."
              >
                saldo
              </span>
            )}
            {c.discrepancia != null && (
              <span
                className="ml-1 text-[9px] uppercase text-[var(--t-neg)]"
                title={`El extracto cierra en ${plata(c.saldo_cierre)} y el saldo `
                  + `informado dice ${plata(c.saldo_banco)} (${plata(c.discrepancia)} de `
                  + "diferencia). Las dos las informa el banco."}
              >
                ≠
              </span>
            )}
          </Td>
          <Td center strong className={COL_DATO} copiar={plata(c.gastos_bancarios)}>
            {plata(c.gastos_bancarios)}
          </Td>
          {conceptos.map((b) => {
            const v = c.gastos_desglose?.[b.clave] ?? null;
            return (
              <Td key={b.clave} center className={COL_DATO} copiar={plata(v)}>
                {plata(v)}
              </Td>
            );
          })}
          <Td center className={COL_DATO} copiar={plata(sumaBaldes(c.gastos_desglose, otros))}>
            {plata(sumaBaldes(c.gastos_desglose, otros))}
          </Td>
        </tr>
      ))}
    </>
  );
}

/* ── MODAL: los movimientos del día de UNA cuenta ───────────────────────── */

/**
 * Se abre haciendo clic en la cuenta del CONSOLIDADO. Reemplazó a la sub-tab
 * "Detalle por cuenta" (user, 2026-08-18): esa vista obligaba a elegir banco y
 * después cuenta en dos selectores, para ver el detalle de una fila que ya
 * estabas mirando en la otra pantalla. El modal parte de donde estás.
 *
 * Es el mismo patrón que el modal por celda de Tesorería → BANCOS: el número
 * grande se ve en la grilla, y lo que lo compone se abre encima sin perder el
 * contexto.
 *
 * Reusa `GET /vista?cuenta_id&fecha`, que ya devolvía exactamente esto. No hizo
 * falta un endpoint nuevo.
 */
function ModalMovimientos({
  cuenta, fecha, onCerrar,
}: { cuenta: CuentaConsolidada; fecha: string; onCerrar: () => void }) {
  const url = useMemo(() => {
    const p = new URLSearchParams({ cuenta_id: String(cuenta.id) });
    if (fecha) p.set("fecha", fecha);
    return `/api/back-office/interbanking/vista?${p.toString()}`;
  }, [cuenta.id, fecha]);

  // `fetchOnMount` + poll: si el modal queda abierto y el job sincroniza, se
  // actualiza solo. No hay nada que "guardar", así que refrescar no pisa nada.
  // `bump` fuerza un refetch después de marcar: el total del día lo recalcula el
  // BACKEND con la misma función que alimenta la columna del consolidado, así
  // que la pantalla no puede quedar diciendo otra cosa que el total.
  const [bump, setBump] = useState(0);
  const recargar = useCallback(() => setBump((n) => n + 1), []);
  const { data, lastAt, error } = usePoll<RespVista>(
    `${url}${url.includes("?") ? "&" : "?"}_r=${bump}`, VISTA_VACIA, POLL_MS,
    { fetchOnMount: true },
  );

  // Escape cierra: es un modal, tiene que poder salirse sin mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  const dia = data.dias[0] ?? null;
  const r = data.resumen;
  const mon = cuenta.moneda;
  const [reglasAbierto, setReglasAbierto] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /** Marca / desmarca / vuelve al criterio de las reglas. `null` BORRA la marca. */
  async function marcar(mov: Movimiento, es_gasto: boolean | null) {
    setErr(null);
    const res = await fetch("/api/back-office/interbanking/gastos/movimiento", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mov_hash: mov.mov_hash, es_gasto }),
    });
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).detail ?? "No se pudo guardar la marca.");
      return;
    }
    recargar();   // el total del día lo recalcula el BACKEND, no la pantalla
  }

  async function descargar() {
    const { exportToXlsx } = await import("@/lib/xlsx-export");
    await exportToXlsx({
      sheets: [{
        name: "Movimientos",
        // El importe va FIRMADO (débito negativo): así la columna suma el neto
        // del día en Excel sin que nadie tenga que armar la fórmula.
        rows: data.movimientos.map((m) => ({
          ...m,
          importe_firmado: m.importe === null
            ? null
            : (m.tipo === "D" ? -m.importe : m.importe),
        })),
        columns: [
          { header: "Fecha",        key: "fecha",            format: "date",    width: 12 },
          { header: "Descripción",  key: "descripcion",      format: "text",    width: 38 },
          { header: "Concepto",     key: "concepto",         format: "text",    width: 20 },
          { header: "Cod op",       key: "codigo",           format: "text",    width: 10 },
          { header: "Cod op bco",   key: "codigo_banco",     format: "text",    width: 12 },
          { header: "Comprobante",  key: "comprobante",      format: "text",    width: 14 },
          // Sucursal como TEXTO: viene "010" y como número perdería el cero.
          { header: "Sucursal",     key: "sucursal",         format: "text",    width: 10 },
          { header: "Contraparte",  key: "contraparte",      format: "text",    width: 30 },
          { header: "CUIT",         key: "contraparte_cuit", format: "text",    width: 14 },
          { header: "Tipo",         key: "tipo",             format: "text",    width: 6 },
          { header: "Importe",      key: "importe_firmado",  format: "number",  width: 16 },
        ],
        title: `${cuenta.banco_nombre} · ${cuenta.tipo} ${mon} ${cuenta.numero}`
          + `${cuenta.etiqueta ? ` · ${cuenta.etiqueta}` : ""} · ${data.fecha || fecha}`,
      }],
      filename: `interbanking-${cuenta.numero}-${data.fecha || fecha}.xlsx`,
    });
  }

  return (
    // El fondo cierra al hacer clic. `stopPropagation` en el panel para que un
    // clic adentro (copiar una celda, por ejemplo) no lo cierre de rebote.
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border)] w-full max-w-[1400px] max-h-[90vh] flex flex-col text-[12px]"
      >
        {/* Cabecera: de qué cuenta y de qué día es esto. */}
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border)] flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-semibold tracking-wide">{cuenta.banco_nombre}</span>
          <span className="text-[var(--t-text-dim)]">
            {cuenta.tipo} {mon} ·{" "}
            <span className="text-[var(--t-text)] font-semibold">{cuenta.numero}</span>
            {cuenta.etiqueta ? ` · ${cuenta.etiqueta}` : ""}
          </span>
          <span className="text-[var(--t-accent)]">{data.fecha || fecha}</span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setReglasAbierto(true)}
              className="px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border)] hover:bg-[var(--t-surface)]"
              title="Qué movimientos se clasifican solos como gasto bancario"
            >
              Reglas ({data.reglas.filter((x) => x.activa).length})
            </button>
            <button
              onClick={descargar}
              disabled={data.movimientos.length === 0}
              className="px-2 py-1 text-[11px] uppercase tracking-wide border border-[var(--t-border)] hover:bg-[var(--t-surface)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Descargar
            </button>
            <button
              onClick={onCerrar}
              className="px-2 py-1 text-[13px] hover:bg-[var(--t-surface)]"
              title="Cerrar (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Este modal es de MOVIMIENTOS. Apertura / créditos / débitos / cierre
            se sacaron (user, 2026-08-18: «es texto al pedo»): son los saldos del
            día, ya se ven en la grilla del consolidado, y repetirlos acá no
            ayuda a leer una lista de movimientos. Queda lo que SÍ habla de esta
            lista: cuántos son y cuánto de eso es gasto bancario. */}
        {/* El desglose COMPLETO, en horizontal: acá sí se abren de a uno los
            impuestos que en el consolidado van juntos bajo OTROS IMP. El
            contador de movimientos se sacó (user, 2026-08-18) — la lista está
            abajo, contarla arriba no agrega nada.

            `resto` (gasto que no cayó en ningún balde) aparece SOLO si no es
            cero: OTROS IMP son únicamente las 4 descripciones declaradas, así
            que puede quedar gasto afuera de toda columna, y eso hay que verlo
            en vez de que se pierda adentro de otra celda. */}
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border)] flex flex-wrap gap-x-5 gap-y-2">
          <Dato label="Gastos bancarios" valor={plata(r.gastos, mon)} fuerte />
          {data.desglose.map((b) => (
            <Dato
              key={b.clave}
              label={b.etiqueta}
              valor={plata(r.gastos_desglose?.[b.clave] ?? null)}
            />
          ))}
          {!!r.gastos_desglose?.resto && (
            <Dato
              label="Sin clasificar"
              valor={plata(r.gastos_desglose.resto)}
              clase="text-[var(--t-accent)]"
            />
          )}
          {/* Las dos alertas de conciliación las calcula el BACKEND. */}
          {dia?.cierra === false && (
            <span className="self-center px-2 py-0.5 text-[10px] uppercase bg-[var(--t-tint-red)] text-[var(--t-neg)]">
              No cierra · {plata(dia.diferencia)}
            </span>
          )}
          {r.dias_incompletos.length > 0 && (
            <span className="self-center px-2 py-0.5 text-[10px] uppercase bg-[var(--t-tint-amber)] text-[var(--t-accent)]">
              Incompleto · el banco declara {dia?.movimientos_banco}
            </span>
          )}
        </div>

        <ErrorLinea error={err ?? error} />

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr>
                <Th>Fecha</Th>
                <Th>Descripción</Th>
                <Th center className={COL_SEP}>Concepto</Th>
                <Th center className={COL_SEP}>Cod op</Th>
                <Th center className={COL_SEP}>Cod op bco</Th>
                <Th center className={COL_SEP}>Comprobante</Th>
                <Th center className={COL_SEP}>Sucursal</Th>
                <Th center className={COL_SEP}>Importe</Th>
                <Th center className={COL_SEP}>Gasto</Th>
              </tr>
            </thead>
            <tbody>
              {data.movimientos.map((m, i) => (
                <tr
                  key={`${m.fecha}-${m.extracto}-${m.correlativo}-${i}`}
                  className="border-b border-[var(--t-border)]"
                >
                  <Td copiar={m.fecha}>
                    {m.fecha}
                    {/* La hora solo si el banco la informa DE VERDAD: medido,
                        `process_date` viene siempre a las 00:00:00. */}
                    {m.hora && m.hora !== "00:00:00" ? (
                      <span className="text-[var(--t-text-dim)]"> {m.hora}</span>
                    ) : null}
                  </Td>
                  <Td copiar={m.descripcion}>
                    {m.descripcion}
                    {m.contraparte ? (
                      <div className="text-[10px] text-[var(--t-text-dim)]">
                        {m.contraparte}
                        {m.contraparte_cuit ? ` · ${m.contraparte_cuit}` : ""}
                      </div>
                    ) : null}
                  </Td>
                  <Td center className={COL_SEP} copiar={m.concepto}>
                    {m.concepto || "—"}
                  </Td>
                  <Td center className={COL_SEP} copiar={m.codigo}>
                    {m.codigo || "—"}
                  </Td>
                  <Td center className={COL_SEP} copiar={m.codigo_banco}>
                    {m.codigo_banco || "—"}
                  </Td>
                  <Td center className={COL_SEP} copiar={m.comprobante?.toString()}>
                    {m.comprobante ?? "—"}
                  </Td>
                  <Td center className={COL_SEP} copiar={m.sucursal}>
                    {m.sucursal || "—"}
                  </Td>
                  <Td
                    center
                    strong
                    className={`${COL_SEP} ${
                      m.tipo === "C" ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"
                    }`}
                    copiar={plata(m.importe)}
                  >
                    {m.tipo === "D" ? "−" : "+"}
                    {plata(m.importe)}
                  </Td>
                  <CeldaGasto
                    mov={m}
                    editable={data.puede_escribir}
                    onMarcar={marcar}
                  />
                </tr>
              ))}
              {data.movimientos.length === 0 && <Vacia cols={9} hubo={lastAt > 0} />}
            </tbody>
          </table>
        </div>
      </div>

      {reglasAbierto && (
        <ModalReglas
          reglas={data.reglas}
          editable={data.puede_escribir}
          onCambio={recargar}
          onCerrar={() => setReglasAbierto(false)}
        />
      )}
    </div>
  );
}

/* ── GASTOS BANCARIOS ───────────────────────────────────────────────────── */

/**
 * La celda SÍ/NO de un movimiento. Un clic la cambia — mismo gesto que el estado
 * de un cheque en Tesorería: sin abrir nada, sin confirmar.
 *
 * ⚠️ Muestra de DÓNDE salió la marca, y eso no es decorativo:
 *   · sin subrayado = lo clasificó una REGLA (nadie tuvo que hacer nada);
 *   · subrayado     = lo marcó una PERSONA a mano.
 * Si el equipo ve una columna llena de subrayados repitiéndose todos los días,
 * eso no es trabajo manual bien hecho: es una regla que falta.
 *
 * El tercer estado (VOLVER A LA REGLA) existe para poder deshacer: sin él,
 * arreglar una marca equivocada obligaría a adivinar qué decía la regla y marcar
 * el opuesto a mano, congelando para siempre algo que la regla ya resolvía.
 */
function CeldaGasto({
  mov, editable, onMarcar,
}: {
  mov: Movimiento;
  editable: boolean;
  onMarcar: (m: Movimiento, v: boolean | null) => void;
}) {
  const manual = mov.gasto_origen === "manual";
  const si = !!mov.es_gasto;

  if (!editable) {
    return (
      <Td center className={COL_SEP}>
        <span className={si ? "text-[var(--t-accent)]" : "text-[var(--t-text-dim)]"}>
          {si ? "SÍ" : "no"}
        </span>
      </Td>
    );
  }

  return (
    <td className={`px-2 py-1 text-center ${COL_SEP}`}>
      <button
        onClick={() => onMarcar(mov, !si)}
        title={manual ? "Marcado a mano · clic para cambiar" : "Lo clasificó una regla · clic para cambiar"}
        className={`px-1.5 py-0.5 text-[11px] hover:bg-[var(--t-surface)] ${
          si ? "text-[var(--t-accent)] font-semibold" : "text-[var(--t-text-dim)]"
        } ${manual ? "underline decoration-dotted underline-offset-2" : ""}`}
      >
        {si ? "SÍ" : "no"}
      </button>
      {manual && (
        <button
          onClick={() => onMarcar(mov, null)}
          title="Volver al criterio de las reglas"
          className="ml-1 text-[10px] text-[var(--t-text-muted)] hover:text-[var(--t-text)]"
        >
          ↺
        </button>
      )}
    </td>
  );
}

const CAMPOS: Record<string, string> = {
  codigo_ib: "Cod op",
  codigo_banco: "Cod op bco",
  descripcion_banco: "Descripción",
  descripcion_ib: "Concepto",
};

/**
 * El catálogo de reglas. Es el CONOCIMIENTO durable: una regla acá vale para
 * todos los bancos y para todos los días, y es lo que hace que mañana no haya
 * que marcar nada a mano.
 *
 * La validación REAL vive en el backend (`crear_regla` valida campo y operador
 * contra las constantes del service). Esto es solo la UI.
 */
function ModalReglas({
  reglas, editable, onCambio, onCerrar,
}: {
  reglas: Regla[]; editable: boolean; onCambio: () => void; onCerrar: () => void;
}) {
  const [campo, setCampo] = useState("descripcion_banco");
  const [operador, setOperador] = useState("contiene");
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  async function alta() {
    if (!valor.trim()) { setErr("Escribí qué tiene que coincidir."); return; }
    setBusy(true); setErr(null);
    const res = await fetch("/api/back-office/interbanking/gastos/reglas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campo, operador, valor, nota }),
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).detail ?? "No se pudo crear la regla.");
      return;
    }
    setValor(""); setNota("");
    onCambio();
  }

  async function baja(id: number) {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/back-office/interbanking/gastos/reglas/${id}`, {
      method: "DELETE",
    });
    setBusy(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).detail ?? "No se pudo borrar la regla.");
      return;
    }
    onCambio();
  }

  const INPUT = "bg-[var(--t-surface)] border border-[var(--t-border)] px-1.5 py-1 "
    + "text-[12px] outline-none";

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onCerrar}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--t-panel)] border border-[var(--t-border)] w-full max-w-[820px] max-h-[85vh] flex flex-col text-[12px]"
      >
        <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border)] flex items-center gap-3">
          <span className="font-semibold tracking-wide uppercase text-[11px]">
            Reglas de gasto bancario
          </span>
          <button
            onClick={onCerrar}
            className="ml-auto px-2 py-1 hover:bg-[var(--t-surface)]"
            title="Cerrar (Esc)"
          >
            ✕
          </button>
        </div>

        <p className="shrink-0 px-3 py-2 text-[11px] text-[var(--t-text-dim)] border-b border-[var(--t-border)]">
          Un movimiento que cumpla CUALQUIERA de estas reglas se marca solo como
          gasto bancario. La marca hecha a mano sobre un movimiento puntual siempre
          gana sobre la regla. Los gastos ya están adentro del saldo: esto los
          DISTINGUE, no los suma de nuevo.
        </p>

        {err && (
          <div className="shrink-0 px-3 py-1 text-[11px] bg-[var(--t-tint-red)] text-[var(--t-neg)]">
            {err}
          </div>
        )}

        {editable && (
          <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border)] flex flex-wrap items-center gap-2">
            <select value={campo} onChange={(e) => setCampo(e.target.value)} className={INPUT}>
              {Object.entries(CAMPOS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select
              value={operador}
              onChange={(e) => setOperador(e.target.value)}
              className={INPUT}
            >
              <option value="contiene">contiene</option>
              <option value="igual">es igual a</option>
            </select>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") alta(); }}
              placeholder="COMISION"
              className={`${INPUT} w-[200px]`}
            />
            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="para qué es (opcional)"
              className={`${INPUT} flex-1 min-w-[160px]`}
            />
            <button
              onClick={alta}
              disabled={busy}
              className="px-2 py-1 text-[11px] uppercase border border-[var(--t-border)] hover:bg-[var(--t-surface)] disabled:opacity-40"
            >
              Agregar
            </button>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr>
                <Th>Campo</Th>
                <Th className={COL_SEP}>Condición</Th>
                <Th className={COL_SEP}>Valor</Th>
                <Th className={COL_SEP}>Nota</Th>
                <Th className={COL_SEP}>Creada por</Th>
                {editable && <Th center className={COL_SEP}>—</Th>}
              </tr>
            </thead>
            <tbody>
              {reglas.map((r) => (
                <tr key={r.id} className="border-b border-[var(--t-border)]">
                  <Td>{CAMPOS[r.campo] ?? r.campo}</Td>
                  <Td className={COL_SEP}>{r.operador === "igual" ? "es igual a" : "contiene"}</Td>
                  <Td className={COL_SEP} copiar={r.valor}>
                    <span className="font-semibold">{r.valor}</span>
                  </Td>
                  <Td className={COL_SEP}>{r.nota || "—"}</Td>
                  <Td className={COL_SEP}>{r.creado_por || "—"}</Td>
                  {editable && (
                    <td className={`px-2 py-1 text-center ${COL_SEP}`}>
                      <button
                        onClick={() => baja(r.id)}
                        disabled={busy}
                        title="Borrar la regla (las marcas hechas a mano no se tocan)"
                        className="text-[var(--t-text-muted)] hover:text-[var(--t-neg)] disabled:opacity-40"
                      >
                        ✕
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {reglas.length === 0 && (
                <tr>
                  <td colSpan={editable ? 6 : 5} className="px-3 py-6 text-center text-[var(--t-text-dim)]">
                    Todavía no hay ninguna regla. Mientras no haya ninguna, la
                    columna GASTOS BANCARIOS muestra «—» y no cero: nadie afirmó
                    que el banco no cobró nada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ── Piezas compartidas ─────────────────────────────────────────────────── */


/** Solo aparece cuando algo FALLA. En el caso normal la pantalla no dice nada:
 *  de cuándo es el dato ya lo informa «Última actualización» arriba. */
function ErrorLinea({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="shrink-0 px-3 py-1 text-[11px] bg-[var(--t-tint-red)] text-[var(--t-neg)] border-b border-[var(--t-border)]">
      {error}
    </div>
  );
}

function Fecha({
  label, value, onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-[12px]"
      />
    </label>
  );
}

function Dato({
  label, valor, fuerte, clase = "",
}: { label: string; valor: string; fuerte?: boolean; clase?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
        {label}
      </div>
      <div className={`${fuerte ? "text-[14px] font-semibold" : "text-[13px]"} ${clase}`}>
        {valor}
      </div>
    </div>
  );
}


function Th({
  children, right, center, className = "",
}: {
  children?: React.ReactNode; right?: boolean; center?: boolean; className?: string;
}) {
  const al = center ? "text-center" : right ? "text-right" : "text-left";
  return (
    <th className={`px-2 py-1.5 font-normal whitespace-nowrap ${al} ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children, right, center, strong, className = "", copiar,
}: {
  children?: React.ReactNode; right?: boolean; center?: boolean; strong?: boolean;
  className?: string; copiar?: string | null;
}) {
  const [copiado, setCopiado] = useState(false);
  const al = center ? "text-center tabular-nums" : right ? "text-right tabular-nums" : "";

  // Los datos de esta vista se copian y se pegan en otros sistemas todo el día
  // (user, 2026-08-18), así que la celda con dato se copia con UN clic. Sin
  // dato no hay nada que copiar y la celda no reacciona: un cursor de mano
  // sobre un «—» promete algo que no pasa.
  const hay = copiar != null && copiar !== "" && copiar !== "—";
  const onClick = hay
    ? () => {
        navigator.clipboard.writeText(copiar as string).then(
          () => { setCopiado(true); setTimeout(() => setCopiado(false), 900); },
          () => {},   // sin portapapeles (http, permiso denegado): no rompe nada
        );
      }
    : undefined;

  return (
    <td
      onClick={onClick}
      title={hay ? "Clic para copiar" : undefined}
      className={`px-2 py-1 ${al} ${strong ? "font-semibold" : ""} ${
        hay ? "cursor-pointer hover:bg-[var(--t-surface)]" : ""
      } ${copiado ? "bg-[var(--t-tint-green)]" : ""} ${className}`}
    >
      {children}
    </td>
  );
}

/** Una tabla vacía ANTES del primer fetch no significa lo mismo que después. */
function Vacia({ cols, hubo }: { cols: number; hubo: boolean }) {
  return (
    <tr>
      <td colSpan={cols} className="px-2 py-6 text-center text-[var(--t-text-dim)]">
        {hubo ? "Sin datos para este rango." : "Cargando…"}
      </td>
    </tr>
  );
}
