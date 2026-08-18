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
};

type Banco = {
  banco: string;
  banco_nombre: string;
  cuentas: CuentaConsolidada[];
};

type Sync = { corrida_at: string; cuentas: number; con_error: number } | null;

type RespConsolidado = {
  fecha: string;
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
  };
  sync: Sync;
};

const CONSOLIDADO_VACIO: RespConsolidado = {
  fecha: "", bancos: [], cuentas: 0, sin_datos: 0, gastos_definidos: false, sync: null,
};

const VISTA_VACIA: RespVista = {
  cuentas: [], cuenta_id: null, fecha: "", dias: [], movimientos: [],
  resumen: {
    dias: 0, movimientos: 0, creditos: 0, debitos: 0, neto: 0,
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

/** «18/08/2026 13:42». Fecha, hora y minuto — nada más (user, 2026-08-18). */
function momento(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} `
    + `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function signo(v: number | null | undefined) {
  if (v === null || v === undefined || v === 0) return "";
  return v > 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]";
}

/* ══════════════════════════════════════════════════════════════════════════ */

export function InterbankingView() {
  const [sub, setSub] = useState<"consolidado" | "detalle">("consolidado");
  // UNA fecha, no un rango (user, 2026-08-18: «la fecha es una sola, es siempre
  // el mismo día»). Es COMPARTIDA por las dos sub-tabs: cambiar de vista no hace
  // perder el día que estabas mirando.
  // Arranca vacía A PROPÓSITO: sin fecha el backend usa HOY en hora argentina,
  // así que el default lo decide el servidor y no el reloj del navegador.
  const [fecha, setFecha] = useState("");

  // Identidad ESTABLE (useCallback sin deps) + update funcional: si se pasara una
  // arrow inline, cambiaría en cada render y el efecto de los hijos que la tiene
  // en deps correría en cada render. Solo completa si está vacía, así que nunca
  // pisa el día que el usuario eligió a mano.
  const aplicarFecha = useCallback((f: string) => setFecha((p) => p || f), []);

  // Cuándo sincronizó el JOB con el banco. Lo reporta la sub-tab que esté activa
  // (viene en su payload) y se muestra ACÁ ARRIBA, en una sola línea. Antes era
  // una franja de texto explicando cada cuánto corre el cron y cuántas cuentas
  // no tenían dato: el back office la sacó («es un asco»), y tenía razón — una
  // pantalla no se explica a sí misma en prosa. Lo único que hace falta saber es
  // de cuándo es el dato.
  const [syncAt, setSyncAt] = useState<string | null>(null);

  return (
    <div className="h-full min-h-0 flex flex-col text-[12px]">
      <div className="shrink-0 border-b border-[var(--t-border)] bg-[var(--t-panel)] px-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <Pill activo={sub === "consolidado"} onClick={() => setSub("consolidado")}>
            Consolidado Bancos
          </Pill>
          <Pill activo={sub === "detalle"} onClick={() => setSub("detalle")}>
            Detalle por cuenta
          </Pill>
        </div>

        <span className="text-[11px] text-[var(--t-text-dim)]">
          Última actualización {momento(syncAt)}
        </span>

        <div className="ml-auto flex items-center gap-3 py-1.5">
          <Fecha label="Fecha" value={fecha} onChange={setFecha} />
        </div>
      </div>

      {sub === "consolidado" ? (
        <Consolidado fecha={fecha} onFecha={aplicarFecha} onSync={setSyncAt} />
      ) : (
        <Detalle fecha={fecha} onFecha={aplicarFecha} onSync={setSyncAt} />
      )}
    </div>
  );
}

/* ── CONSOLIDADO BANCOS ─────────────────────────────────────────────────── */

function Consolidado({
  fecha, onFecha, onSync,
}: { fecha: string; onFecha: (f: string) => void; onSync: (s: string | null) => void }) {
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
            <tr>
              <Th>Cuenta</Th>
              <Th center className={COL_DATO}>Saldo al inicio</Th>
              <Th center className={COL_DATO}>Saldo al cierre</Th>
              <Th center className={COL_DATO}>Variación</Th>
              <Th center className={COL_DATO}>Gastos bancarios</Th>
              <Th center className={COL_DATO}>Movs.</Th>
            </tr>
          </thead>
          <tbody>
            {data.bancos.map((b) => (
              <BloqueBanco key={`${b.banco}-${b.banco_nombre}`} banco={b} />
            ))}
            {data.bancos.length === 0 && <Vacia cols={6} hubo={lastAt > 0} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BloqueBanco({ banco }: { banco: Banco }) {
  return (
    <>
      {/* El banco como TÍTULO de su bloque de cuentas. Agrupa para poder
          navegar 38 cuentas, nada más: los subtotales por banco y por moneda se
          ELIMINARON (user, 2026-08-18) — cada fila se lee sola. */}
      <tr className="bg-[var(--t-surface-2)] border-y border-[var(--t-border)]">
        <td colSpan={6} className="px-2 py-1.5 font-semibold tracking-wide">
          {banco.banco_nombre || "(sin nombre)"}
          <span className="ml-2 text-[10px] font-normal text-[var(--t-text-dim)]">
            BCRA {banco.banco} · {banco.cuentas.length} cuenta(s)
          </span>
        </td>
      </tr>

      {banco.cuentas.map((c) => (
        <tr key={c.id} className="border-b border-[var(--t-border)]">
          {/* El NÚMERO va entero (decisión del user, 2026-08-18) y el clic copia
              el número solo, no la línea entera con el tipo y la etiqueta: lo
              que se pega en otro sistema es el número. */}
          <Td className="whitespace-nowrap" copiar={c.numero}>
            <span className="pl-3">
              {c.tipo} {c.moneda} · <span className="font-semibold">{c.numero}</span>
              {c.etiqueta ? (
                <span className="text-[var(--t-text-dim)]"> · {c.etiqueta}</span>
              ) : null}
            </span>
          </Td>
          <Td center className={COL_DATO} copiar={plata(c.saldo_inicio)}>
            {plata(c.saldo_inicio)}
          </Td>
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
          <Td center className={`${COL_DATO} ${signo(c.variacion)}`}
              copiar={plata(c.variacion)}>
            {plata(c.variacion)}
          </Td>
          <Td center className={COL_DATO} copiar={plata(c.gastos_bancarios)}>
            {plata(c.gastos_bancarios)}
          </Td>
          <Td center className={COL_DATO}>
            {c.movimientos ?? <span className="text-[var(--t-text-dim)]">—</span>}
          </Td>
        </tr>
      ))}
    </>
  );
}

/* ── DETALLE POR CUENTA ─────────────────────────────────────────────────── */

function Detalle({
  fecha, onFecha, onSync,
}: { fecha: string; onFecha: (f: string) => void; onSync: (s: string | null) => void }) {
  const [banco, setBanco] = useState<string | null>(null);
  const [cuentaId, setCuentaId] = useState<number | null>(null);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (cuentaId !== null) p.set("cuenta_id", String(cuentaId));
    if (fecha) p.set("fecha", fecha);
    const qs = p.toString();
    return `/api/back-office/interbanking/vista${qs ? `?${qs}` : ""}`;
  }, [cuentaId, fecha]);

  const { data, lastAt, error } = usePoll<RespVista>(url, VISTA_VACIA, POLL_MS, {
    fetchOnMount: true,
  });

  // Bancos únicos, derivados del listado de cuentas.
  const bancos = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data.cuentas) m.set(c.banco, c.banco_nombre || c.banco);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.cuentas]);

  // Solo las cuentas del banco elegido: es el punto del selector en cascada.
  const cuentasDelBanco = useMemo(
    () => data.cuentas.filter((c) => c.banco === banco),
    [data.cuentas, banco],
  );

  useEffect(() => {
    if (data.fecha) onFecha(data.fecha);
  }, [data.fecha, onFecha]);

  useEffect(() => {
    onSync(data.sync?.corrida_at ?? null);
  }, [data.sync?.corrida_at, onSync]);

  // Primer render: el banco sale de la cuenta que el backend eligió por default.
  useEffect(() => {
    if (banco === null && data.cuenta_id !== null) {
      const c = data.cuentas.find((x) => x.id === data.cuenta_id);
      if (c) {
        setBanco(c.banco);
        setCuentaId(c.id);
      }
    }
  }, [banco, data.cuenta_id, data.cuentas]);

  function elegirBanco(b: string) {
    setBanco(b);
    // Saltar a la primera cuenta del banco nuevo: dejar una cuenta de OTRO
    // banco seleccionada mostraría datos que no corresponden al filtro.
    const primera = data.cuentas.find((c) => c.banco === b);
    setCuentaId(primera ? primera.id : null);
  }

  const cuenta = data.cuentas.find((c) => c.id === data.cuenta_id) || null;
  const mon = cuenta?.moneda || "";
  const r = data.resumen;
  const noCierran = new Set(r.dias_que_no_cierran);
  const incompletos = new Set(r.dias_incompletos);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Selector en cascada: primero el banco, después su cuenta. */}
      <div className="shrink-0 border-b border-[var(--t-border)] px-3 py-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
            Banco
          </span>
          <select
            value={banco ?? ""}
            onChange={(e) => elegirBanco(e.target.value)}
            className="bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-[12px] min-w-[200px]"
          >
            {bancos.map(([cod, nombre]) => (
              <option key={cod} value={cod}>
                {nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
            Cuenta
          </span>
          <select
            value={cuentaId ?? ""}
            onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : null)}
            className="bg-[var(--t-bg)] border border-[var(--t-border)] px-2 py-1 text-[12px] min-w-[240px]"
            disabled={cuentasDelBanco.length === 0}
          >
            {cuentasDelBanco.map((c) => (
              <option key={c.id} value={c.id}>
                {c.tipo} {c.moneda} · {c.numero}
                {c.etiqueta ? ` · ${c.etiqueta}` : ""}
              </option>
            ))}
          </select>
        </label>

        <span className="text-[10px] text-[var(--t-text-dim)]">
          {cuentasDelBanco.length} cuenta(s) en este banco
        </span>
      </div>

      <ErrorLinea error={error} />

      {/* Los saldos, al ANCHO COMPLETO. */}
      <div className="shrink-0 border-b border-[var(--t-border)] px-3 py-2 flex flex-wrap gap-6">
        <Dato label="Saldo al cierre" valor={plata(r.saldo_final, mon)} fuerte />
        <Dato label="Créditos" valor={plata(r.creditos, mon)} />
        <Dato label="Débitos" valor={plata(r.debitos, mon)} />
        <Dato label="Neto" valor={plata(r.neto, mon)} clase={signo(r.neto)} />
        <Dato label="Días" valor={String(r.dias)} />
        <Dato label="Movimientos" valor={String(r.movimientos)} />
      </div>

      {(r.dias_que_no_cierran.length > 0 || r.dias_incompletos.length > 0) && (
        <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] flex flex-col gap-1 text-[11px]">
          {r.dias_que_no_cierran.length > 0 && (
            <div className="text-[var(--t-neg)]">
              NO CIERRA en {r.dias_que_no_cierran.length} día(s):{" "}
              {r.dias_que_no_cierran.join(", ")} — apertura + créditos − débitos no da
              el cierre que informa el banco.
            </div>
          )}
          {r.dias_incompletos.length > 0 && (
            <div className="text-[var(--t-accent)]">
              INCOMPLETO en {r.dias_incompletos.length} día(s):{" "}
              {r.dias_incompletos.join(", ")} — tenemos guardada distinta cantidad de
              movimientos de la que declara el extracto.
            </div>
          )}
        </div>
      )}

      {/* EXTRACTO a la izquierda, MOVIMIENTOS a la derecha. Ya NO es 50/50: el
          extracto son 6 columnas fijas y MOVIMIENTOS pasó a 8 (2026-08-18), así
          que se reparte 1/3 · 2/3. Cada panel scrollea solo, así que si el
          navegador es angosto la tabla ancha no empuja a la otra. */}
      <div className="flex-1 min-h-0 grid grid-cols-3">
        <Panel titulo="Extracto" subtitulo={`${data.dias.length} día(s)`} borde>
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr>
                <Th>Fecha</Th>
                <Th center className={COL_SEP}>Apertura</Th>
                <Th center className={COL_SEP}>Créditos</Th>
                <Th center className={COL_SEP}>Débitos</Th>
                <Th center className={COL_SEP}>Cierre</Th>
                <Th center className={COL_SEP}>Movs.</Th>
              </tr>
            </thead>
            <tbody>
              {data.dias.map((d) => {
                const mal = noCierran.has(d.fecha);
                const inc = incompletos.has(d.fecha);
                return (
                  <tr
                    key={d.fecha}
                    className={`border-b border-[var(--t-border)] ${
                      mal ? "bg-[var(--t-tint-red)]" : inc ? "bg-[var(--t-tint-amber)]" : ""
                    }`}
                  >
                    <Td>
                      {d.fecha}
                      {mal ? (
                        <span className="ml-1 text-[10px] text-[var(--t-neg)]">
                          NO CIERRA ({plata(d.diferencia)})
                        </span>
                      ) : inc ? (
                        <span className="ml-1 text-[10px] text-[var(--t-accent)]">
                          INCOMPLETO
                        </span>
                      ) : null}
                    </Td>
                    <Td right>{plata(d.saldo_apertura)}</Td>
                    <Td right>{plata(d.creditos)}</Td>
                    <Td right>{plata(d.debitos)}</Td>
                    <Td right strong>{plata(d.saldo_cierre)}</Td>
                    <Td right>
                      {d.movimientos_base}
                      {d.movimientos_banco !== d.movimientos_base
                        ? ` / ${d.movimientos_banco}`
                        : ""}
                    </Td>
                  </tr>
                );
              })}
              {data.dias.length === 0 && <Vacia cols={6} hubo={lastAt > 0} />}
            </tbody>
          </table>
        </Panel>

        <Panel
          titulo="Movimientos"
          subtitulo={`${data.movimientos.length} movimiento(s)`}
          ancho="col-span-2"
        >
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              {/* Las 8 columnas que pidió el back office (2026-08-18). IMPORTE va
                  último y a la derecha, que es como se lee una tabla de plata;
                  CONTRAPARTE no es una columna propia porque viene en el 13% de
                  los movimientos (medido) y una columna vacía 9 de cada 10 filas
                  cuesta ancho sin aportar — va debajo de la descripción. */}
              <tr>
                <Th>Fecha</Th>
                <Th>Descripción</Th>
                <Th center className={COL_SEP}>Concepto</Th>
                <Th center className={COL_SEP}>Cod op</Th>
                <Th center className={COL_SEP}>Cod op bco</Th>
                <Th center className={COL_SEP}>Comprobante</Th>
                <Th center className={COL_SEP}>Sucursal</Th>
                <Th center className={COL_SEP}>Importe</Th>
              </tr>
            </thead>
            <tbody>
              {data.movimientos.map((m, i) => (
                <tr
                  key={`${m.fecha}-${m.extracto}-${m.correlativo}-${i}`}
                  className="border-b border-[var(--t-border)]"
                >
                  <Td>
                    {m.fecha}
                    {/* La hora solo si el banco la informa DE VERDAD. Medido el
                        2026-08-18 sobre 178 movimientos: `process_date` viene
                        siempre a las 00:00:00, así que pintarla era mostrar una
                        precisión que no tenemos. Si algún banco manda hora real,
                        aparece sola. */}
                    {m.hora && m.hora !== "00:00:00" ? (
                      <span className="text-[var(--t-text-dim)]"> {m.hora}</span>
                    ) : null}
                  </Td>
                  <Td>
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
                </tr>
              ))}
              {data.movimientos.length === 0 && <Vacia cols={8} hubo={lastAt > 0} />}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

/* ── Piezas compartidas ─────────────────────────────────────────────────── */

function Panel({
  titulo, subtitulo, borde, ancho = "", children,
}: {
  titulo: string; subtitulo?: string; borde?: boolean; ancho?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`min-h-0 flex flex-col ${ancho} ${
        borde ? "border-r border-[var(--t-border)]" : ""
      }`}
    >
      <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-panel)] flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-wide font-semibold">{titulo}</span>
        {subtitulo ? (
          <span className="text-[10px] text-[var(--t-text-dim)]">{subtitulo}</span>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">{children}</div>
    </div>
  );
}

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

function Pill({
  activo, onClick, children,
}: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] uppercase tracking-wide px-3 py-2 border-b-2 ${
        activo
          ? "text-[var(--t-accent)] border-[var(--t-accent)]"
          : "text-[var(--t-text-dim)] border-transparent hover:text-[var(--t-text)]"
      }`}
    >
      {children}
    </button>
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
