"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";

/**
 * Back Office → INTERBANKING. Los bancos de ACA, para CONCILIAR.
 *
 * DOS sub-tabs:
 *
 * ── CONSOLIDADO BANCOS (default) — UNA fila por cuenta, agrupadas bajo el
 *    nombre del banco, con SALDO AL INICIO y SALDO AL CIERRE del rango. Es la
 *    foto de dónde está la plata. Los dos saldos los informa el banco (apertura
 *    del primer día con extracto, cierre del último): no los calculamos.
 *    Totales por banco y globales **por moneda y nunca mezclados** — sumar pesos
 *    con dólares no significa nada.
 *
 *    ⚠️ Lista TODAS las cuentas activas. Las que no tienen extracto en el rango
 *    van con «—», no con cero: **el extracto solo devuelve los días CON
 *    movimientos**, así que de una cuenta quieta no sabemos el saldo. Poner 0
 *    sería inventar un número. La barra dice cuántas están en esa situación.
 *
 * ── DETALLE POR CUENTA — una cuenta a la vez, al 50/50: EXTRACTO a la izquierda
 *    (el día: apertura · créditos · débitos · cierre) y MOVIMIENTOS a la derecha
 *    (el detalle). La cuenta se elige en DOS pasos —primero el banco, después la
 *    cuenta de ESE banco— porque un selector único con 38 opciones no se navega.
 *
 * De dónde sale el dato: `jobs/interbanking_sync` trae los extractos a `bancos.*`
 * cada 2 horas (9 a 19 ART) y esta vista lee de ahí. **La pantalla nunca le pega
 * a Interbanking**: el límite de 100 llamadas/minuto es del ABONADO y no del
 * proceso, así que unos pocos usuarios refrescando podrían agotar la cuota y
 * romper el job. Por eso siempre se muestra cuándo fue la última sincronización:
 * una tabla vacía con el job caído no es "no hubo movimientos".
 *
 * Lo que NO se muestra, por diseño (el backend directamente no lo manda): el CBU
 * y el CUIT de nuestras cuentas, el número de cuenta completo —va solo la
 * terminación— y el CUIT de la contraparte, que viene enmascarado.
 *
 * Las alertas de conciliación las calcula el BACKEND, no esta pantalla:
 *   · NO CIERRA   → apertura + créditos − débitos ≠ cierre, según el banco.
 *   · INCOMPLETO  → guardamos distinta cantidad de movimientos de la que el
 *                   propio extracto dice que tiene ese día.
 */

type Cuenta = {
  id: number;
  banco: string;
  banco_nombre: string;
  tipo: string;
  moneda: string;
  etiqueta: string;
  referencia: string;
  activa: boolean;
};

type CuentaConsolidada = Cuenta & {
  saldo_inicio: number | null;
  saldo_cierre: number | null;
  variacion: number | null;
  dias_con_dato: number;
  desde_real: string | null;
  hasta_real: string | null;
  // De dónde salió el CIERRE. Lo decide el backend, la pantalla solo lo rotula.
  //   "extracto" → apertura/cierre del extracto (con su detalle de movimientos)
  //   "saldo"    → `bancos.saldos`: la cuenta no se movió en el rango y el
  //                extracto no la devuelve, pero el banco igual informa cuánto hay
  //   null       → no sabemos (cuenta con «—»)
  fuente: "extracto" | "saldo" | null;
  saldo_banco: number | null;
  saldo_banco_fecha: string | null;
  // El banco informó las DOS cosas y no coinciden: hallazgo de conciliación.
  discrepancia: number | null;
  proyectado_24hs: number | null;
  proyectado_48hs: number | null;
};

type Total = { inicio: number; cierre: number; variacion: number; cuentas: number };

type Banco = {
  banco: string;
  banco_nombre: string;
  cuentas: CuentaConsolidada[];
  totales: Record<string, Total>;
};

type Sync = { corrida_at: string; cuentas: number; con_error: number } | null;

type RespConsolidado = {
  desde: string;
  hasta: string;
  bancos: Banco[];
  totales: Record<string, Total>;
  cuentas: number;
  sin_datos: number;
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
  extracto: string | null;
  correlativo: number | null;
  comprobante: number | null;
  contraparte: string | null;
  contraparte_cuit: string | null;
};

type RespVista = {
  cuentas: Cuenta[];
  cuenta_id: number | null;
  desde: string;
  hasta: string;
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
  desde: "", hasta: "", bancos: [], totales: {}, cuentas: 0, sin_datos: 0, sync: null,
};

const VISTA_VACIA: RespVista = {
  cuentas: [], cuenta_id: null, desde: "", hasta: "", dias: [], movimientos: [],
  resumen: {
    dias: 0, movimientos: 0, creditos: 0, debitos: 0, neto: 0,
    dias_que_no_cierran: [], dias_incompletos: [], saldo_final: null,
  },
  sync: null,
};

// El dato cambia cada 2 horas: pollear seguido no aporta.
const POLL_MS = 60_000;

function plata(v: number | null | undefined, moneda = "") {
  if (v === null || v === undefined) return "—";
  const s = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
  return moneda ? `${moneda} ${s}` : s;
}

function haceCuanto(iso: string | null | undefined, ahora: number) {
  if (!iso || !ahora) return "—";
  const min = Math.round((ahora - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

function signo(v: number | null | undefined) {
  if (v === null || v === undefined || v === 0) return "";
  return v > 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]";
}

/* ══════════════════════════════════════════════════════════════════════════ */

export function InterbankingView() {
  const [sub, setSub] = useState<"consolidado" | "detalle">("consolidado");
  // El rango es COMPARTIDO por las dos sub-tabs: cambiar de vista no hace
  // perder el período que estabas mirando.
  // Arranca vacío A PROPÓSITO: sin fechas el backend usa ayer+hoy, así que el
  // default lo decide el servidor y no el reloj del navegador.
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  // Identidad ESTABLE (useCallback sin deps) + updates funcionales: si se pasara
  // una arrow inline, cambiaría en cada render y el efecto de los hijos que la
  // tiene en deps correría en cada render. Solo completa lo que está vacío, así
  // que nunca pisa lo que el usuario eligió a mano.
  const aplicarRango = useCallback((d: string, h: string) => {
    setDesde((p) => p || d);
    setHasta((p) => p || h);
  }, []);

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

        <div className="ml-auto flex items-center gap-3 py-1.5">
          <Fecha label="Desde" value={desde} onChange={setDesde} />
          <Fecha label="Hasta" value={hasta} onChange={setHasta} />
        </div>
      </div>

      {sub === "consolidado" ? (
        <Consolidado desde={desde} hasta={hasta} onRango={aplicarRango} />
      ) : (
        <Detalle desde={desde} hasta={hasta} onRango={aplicarRango} />
      )}
    </div>
  );
}

/* ── CONSOLIDADO BANCOS ─────────────────────────────────────────────────── */

function Consolidado({
  desde, hasta, onRango,
}: { desde: string; hasta: string; onRango: (d: string, h: string) => void }) {
  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    const qs = p.toString();
    return `/api/back-office/interbanking/consolidado${qs ? `?${qs}` : ""}`;
  }, [desde, hasta]);

  const { data, lastAt, error } = usePoll<RespConsolidado>(url, CONSOLIDADO_VACIO, POLL_MS, {
    fetchOnMount: true,
  });

  useEffect(() => {
    if (data.desde && data.hasta) onRango(data.desde, data.hasta);
  }, [data.desde, data.hasta, onRango]);

  const monedas = Object.keys(data.totales).sort();

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <BarraEstado
        sync={data.sync}
        lastAt={lastAt}
        error={error}
        extra={
          data.sin_datos > 0
            ? `${data.sin_datos} de ${data.cuentas} cuentas sin extracto NI saldo informado por el banco en el rango — de esas no sabemos cuánto tienen`
            : null
        }
      />

      {/* Totales globales, por moneda. Nunca mezclados. */}
      <div className="shrink-0 border-b border-[var(--t-border)] px-3 py-2 flex flex-wrap gap-6">
        {monedas.length === 0 ? (
          <span className="text-[var(--t-text-dim)]">
            {lastAt > 0 ? "Sin datos en el rango." : "Cargando…"}
          </span>
        ) : (
          monedas.map((m) => {
            const t = data.totales[m];
            return (
              <div key={m} className="flex items-center gap-4">
                <div className="text-[11px] font-semibold tracking-wide">{m}</div>
                <Dato label="Inicio" valor={plata(t.inicio)} />
                <Dato label="Cierre" valor={plata(t.cierre)} fuerte />
                <Dato label="Variación" valor={plata(t.variacion)} clase={signo(t.variacion)} />
                <Dato label="Cuentas" valor={String(t.cuentas)} />
              </div>
            );
          })
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-[var(--t-panel)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
            <tr>
              <Th>Cuenta</Th>
              <Th right>Saldo al inicio</Th>
              <Th right>Saldo al cierre</Th>
              <Th right>Variación</Th>
              <Th right>Proy. 24hs</Th>
              <Th right>Proy. 48hs</Th>
              <Th right>Días</Th>
            </tr>
          </thead>
          <tbody>
            {data.bancos.map((b) => (
              <BloqueBanco key={`${b.banco}-${b.banco_nombre}`} banco={b} />
            ))}
            {data.bancos.length === 0 && <Vacia cols={7} hubo={lastAt > 0} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BloqueBanco({ banco }: { banco: Banco }) {
  const monedas = Object.keys(banco.totales).sort();
  return (
    <>
      {/* El banco como TÍTULO de su bloque de cuentas. */}
      <tr className="bg-[var(--t-surface-2)] border-y border-[var(--t-border)]">
        <td colSpan={7} className="px-2 py-1.5 font-semibold tracking-wide">
          {banco.banco_nombre || "(sin nombre)"}
          <span className="ml-2 text-[10px] font-normal text-[var(--t-text-dim)]">
            BCRA {banco.banco} · {banco.cuentas.length} cuenta(s)
          </span>
        </td>
      </tr>

      {banco.cuentas.map((c) => (
        <tr key={c.id} className="border-b border-[var(--t-border)]">
          <Td>
            <span className="pl-3">
              {c.tipo} {c.moneda} · {c.referencia}
              {c.etiqueta ? (
                <span className="text-[var(--t-text-dim)]"> · {c.etiqueta}</span>
              ) : null}
            </span>
          </Td>
          <Td right>{plata(c.saldo_inicio)}</Td>
          <Td right strong>
            {plata(c.saldo_cierre)}
            {/* El saldo que NO viene del extracto se rotula: es el mismo banco
                informando, pero es otra fuente y el back office tiene que poder
                distinguirlo de un cierre respaldado por su detalle. */}
            {c.fuente === "saldo" && (
              <span
                className="ml-1 text-[9px] uppercase text-[var(--t-text-dim)]"
                title={`Saldo informado por el banco al ${c.saldo_banco_fecha ?? "—"}. `
                  + "La cuenta no tuvo movimientos en el rango, así que no hay extracto "
                  + "que lo respalde."}
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
          <Td right className={signo(c.variacion)}>{plata(c.variacion)}</Td>
          <Td right className="text-[var(--t-text-dim)]">{plata(c.proyectado_24hs)}</Td>
          <Td right className="text-[var(--t-text-dim)]">{plata(c.proyectado_48hs)}</Td>
          <Td right>
            {c.dias_con_dato > 0 ? (
              c.dias_con_dato
            ) : (
              <span className="text-[var(--t-text-dim)]">sin mov.</span>
            )}
          </Td>
        </tr>
      ))}

      {/* Subtotal del banco, una fila POR MONEDA. */}
      {monedas.map((m) => {
        const t = banco.totales[m];
        return (
          <tr key={`${banco.banco}-${m}`} className="border-b border-[var(--t-border)]">
            <Td>
              <span className="pl-3 text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
                Total {banco.banco_nombre} · {m}
              </span>
            </Td>
            <Td right strong>{plata(t.inicio)}</Td>
            <Td right strong>{plata(t.cierre)}</Td>
            <Td right strong className={signo(t.variacion)}>{plata(t.variacion)}</Td>
            {/* Los proyectados NO se subtotalizan: son de las cuentas que los
                informan, y sumarlos con las que no daría un total que parece
                completo sin serlo. */}
            <Td right />
            <Td right />
            <Td right />
          </tr>
        );
      })}
    </>
  );
}

/* ── DETALLE POR CUENTA ─────────────────────────────────────────────────── */

function Detalle({
  desde, hasta, onRango,
}: { desde: string; hasta: string; onRango: (d: string, h: string) => void }) {
  const [banco, setBanco] = useState<string | null>(null);
  const [cuentaId, setCuentaId] = useState<number | null>(null);

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (cuentaId !== null) p.set("cuenta_id", String(cuentaId));
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    const qs = p.toString();
    return `/api/back-office/interbanking/vista${qs ? `?${qs}` : ""}`;
  }, [cuentaId, desde, hasta]);

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
    if (data.desde && data.hasta) onRango(data.desde, data.hasta);
  }, [data.desde, data.hasta, onRango]);

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
                {c.tipo} {c.moneda} · {c.referencia}
                {c.etiqueta ? ` · ${c.etiqueta}` : ""}
              </option>
            ))}
          </select>
        </label>

        <span className="text-[10px] text-[var(--t-text-dim)]">
          {cuentasDelBanco.length} cuenta(s) en este banco
        </span>
      </div>

      <BarraEstado sync={data.sync} lastAt={lastAt} error={error} extra={null} />

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

      {/* 50 / 50 — EXTRACTO a la izquierda, MOVIMIENTOS a la derecha. */}
      <div className="flex-1 min-h-0 grid grid-cols-2">
        <Panel titulo="Extracto" subtitulo={`${data.dias.length} día(s)`} borde>
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr>
                <Th>Fecha</Th>
                <Th right>Apertura</Th>
                <Th right>Créditos</Th>
                <Th right>Débitos</Th>
                <Th right>Cierre</Th>
                <Th right>Movs.</Th>
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

        <Panel titulo="Movimientos" subtitulo={`${data.movimientos.length} movimiento(s)`}>
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
              <tr>
                <Th>Fecha</Th>
                <Th>Descripción</Th>
                <Th>Contraparte</Th>
                <Th right>Importe</Th>
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
                    {m.hora ? (
                      <span className="text-[var(--t-text-dim)]"> {m.hora}</span>
                    ) : null}
                  </Td>
                  <Td>
                    {m.descripcion}
                    {m.concepto && m.concepto !== m.descripcion ? (
                      <span className="text-[var(--t-text-dim)]"> · {m.concepto}</span>
                    ) : null}
                  </Td>
                  <Td>
                    {m.contraparte || "—"}
                    {m.contraparte_cuit ? (
                      <span className="text-[var(--t-text-dim)]"> · {m.contraparte_cuit}</span>
                    ) : null}
                  </Td>
                  <Td
                    right
                    strong
                    className={m.tipo === "C" ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]"}
                  >
                    {m.tipo === "D" ? "−" : "+"}
                    {plata(m.importe)}
                  </Td>
                </tr>
              ))}
              {data.movimientos.length === 0 && <Vacia cols={4} hubo={lastAt > 0} />}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

/* ── Piezas compartidas ─────────────────────────────────────────────────── */

function Panel({
  titulo, subtitulo, borde, children,
}: {
  titulo: string; subtitulo?: string; borde?: boolean; children: React.ReactNode;
}) {
  return (
    <div
      className={`min-h-0 flex flex-col ${
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

function BarraEstado({
  sync, lastAt, error, extra,
}: { sync: Sync; lastAt: number; error: string | null; extra: string | null }) {
  return (
    <>
      {error ? (
        <div className="shrink-0 px-3 py-1.5 text-[11px] bg-[var(--t-tint-red)] text-[var(--t-neg)] border-b border-[var(--t-border)]">
          No se pudo leer: {error}
        </div>
      ) : null}
      <div className="shrink-0 px-3 py-1 border-b border-[var(--t-border)] text-[10px] text-[var(--t-text-dim)] flex flex-wrap gap-x-4">
        <span>
          Sincronizado con el banco {haceCuanto(sync?.corrida_at, lastAt)} · el job corre
          cada 2 hs, de 9 a 19
        </span>
        {sync?.con_error ? (
          <span className="text-[var(--t-neg)]">{sync.con_error} cuentas fallaron</span>
        ) : null}
        {extra ? <span>{extra}</span> : null}
      </div>
    </>
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

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th className={`px-2 py-1.5 font-normal ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Td({
  children, right, strong, className = "",
}: {
  children?: React.ReactNode; right?: boolean; strong?: boolean; className?: string;
}) {
  return (
    <td
      className={`px-2 py-1 ${right ? "text-right tabular-nums" : ""} ${
        strong ? "font-semibold" : ""
      } ${className}`}
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
