"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Back Office → Tesorería → tab CHEQUES. Pantalla partida 50/50:
 * izquierda RECIBIDOS, derecha EMITIDOS.
 *
 * LOS DOS LADOS conviven en dos orígenes (`manual` + `aunesa`), pero el chip AUTO
 * significa cosas distintas en cada uno — y el tooltip lo dice según el lado:
 *   • EMITIDOS  `aunesa` → espejo del e-cheq de EGRESO del feed bancario. Nace
 *     completo (con banco) y NO resta del saldo: esa plata ya la puso el
 *     movimiento.
 *   • RECIBIDOS `aunesa` → espejo del DEPÓSITO de cheque del feed del COMITENTE
 *     (`jobs/tesoreria_echeq_recibidos`, cron 9-14 ART). Nace **sin banco** —
 *     Aunesa no manda la cuenta operativa— y en `pendiente`: hay que completarle
 *     el banco con «editar» y recién ahí se puede finalizar. Sí suma al saldo,
 *     cuando se finaliza.
 *   El botón «+ NUEVO» sigue funcionando igual en los dos lados: el espejo NO
 *   reemplaza la carga manual, la complementa.
 *
 * Los EMITIDOS conviven en dos orígenes:
 *   • `manual`  — los carga el equipo, y son los que restan del saldo de BANCOS.
 *   • `aunesa`  — chip AUTO: los espeja solo el backend desde los e-cheq de EGRESO
 *                 de MOVIMIENTOS (RIEL '[E CHEQ] E CHEQ'), que YA son cheques
 *                 emitidos. Nacen 'emitido' con fecha de pago del día del
 *                 movimiento. NO restan del saldo: esa plata ya entró a la fila
 *                 "Egresos e-cheq" por el movimiento, y contarla otra vez era el
 *                 doble conteo que había cuando se cargaban a mano. Tampoco se
 *                 borran (el próximo poll las recrea): se cierran con 'completado'.
 *
 * Cada lado tiene su propio horizonte:
 *   EMITIDOS  — TABLERO DE SEGUIMIENTO: NO depende de la fecha de la barra. Un
 *               cheque de hace un año que nunca se cerró sigue a la vista, y uno
 *               con FECHA DE PAGO futura va PINTADO DE NARANJA. Estados
 *               pendiente | emitido | COMPLETADO; completado lo saca de la vista
 *               (la fila no se borra: queda en la tabla para auditoría).
 *               El título NO lleva total: un número solo no puede resumir un tablero
 *               que mezcla estados, fechas y monedas. Se abre VER CONSOLIDADO, que
 *               suma por banco y moneda separando vencidos / de hoy / futuros /
 *               AUTO / pendientes / sin fecha, y marca cuánto de eso IMPACTA EN BANCOS.
 *   RECIBIDOS — son TODOS DEL DÍA: se registran intradía y no se arrastran, así
 *               que sí siguen la fecha de la barra. Estados pendiente |
 *               FINALIZADO, y los finalizados se ven igual porque son los que
 *               alimentan la fila "Ingresos e-cheqs" de BANCOS — que SÍ suma al
 *               saldo final (esa plata no viene en los movimientos de Aunesa).
 *
 * El estado se cambia clickeando la celda, sin reabrir la operación.
 *
 * La MONEDA no se elige: la define el banco, porque las cuentas operativas ya son
 * específicas por moneda (…ARS / …USD). Se muestra al lado del importe.
 */

const POLL_MS = 20_000;

type Cheque = {
  id: number; lado: "emitido" | "recibido"; tipo: string | null;
  comitente: string | null; comitente_denominacion: string | null; cuit: string | null;
  banco: string; unidad: string; importe: number; estado: string;
  fecha_pago: string | null; cerrado_at: string | null; creado_por: string | null;
  // `automatico` = la fila la espejó el backend desde un e-cheq de EGRESO de Aunesa.
  // Esas NO restan del saldo de BANCOS: esa plata ya entra por el movimiento.
  origen?: string; mov_id?: string | null; automatico?: boolean;
};
type Banco = { banco: string; unidad: string };
type Resp = {
  fecha?: string; fecha_iso?: string;
  emitidos: Cheque[]; recibidos: Cheque[]; bancos: Banco[];
  estados: Record<string, string[]>; estado_cierre: Record<string, string>;
  tipos: string[]; hoy: string; puede_editar?: boolean; actualizado_at?: string;
};
type Comitente = { id_cuenta: string; denominacion: string | null; cuit: string | null };

const fmt = (v: number) =>
  v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
const fechaCorta = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

// La tabla es `table-fixed`: sin esto una denominación larga ("AVALIAN SALUD Y
// BIENESTAR COOPERATIVA LIMITADA") estira la columna y mete scroll horizontal en
// media pantalla. Con ancho fijo el texto se parte y sigue abajo.
const TH = "px-2 py-1.5 text-center font-normal";
// `overflow-hidden`: con `table-fixed`, una celda nowrap que no entra se dibuja
// sobre la de al lado. Preferimos recortar antes que superponer.
const TD = "px-2 py-1 text-center overflow-hidden";
const WRAP = "whitespace-normal break-words leading-tight";  // nombres largos
const NUM = "whitespace-nowrap tabular-nums";
// Fecha de pago futura → fila naranja: todavía no venció, hay que seguirla.
const NARANJA = "bg-[#f59e0b]/25";
// Chip de la fila espejada desde Aunesa: nadie la cargó, llegó con el movimiento.
const AUTO = "text-[8px] uppercase tracking-widest border border-[var(--t-accent)] " +
  "text-[var(--t-accent)] px-1 py-px align-middle ml-1 whitespace-nowrap";

export function TesoreriaCheques({ fecha }: { fecha: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async (silencioso: boolean) => {
    if (!silencioso) { setLoading(true); setErr(null); }
    try {
      const r = await fetch(`/api/back-office/tesoreria/cheques?fecha=${fecha}`,
        { cache: "no-store" });
      const txt = await r.text();
      let body: unknown = null;
      try { body = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!alive.current) return;
      if (!r.ok) {
        const o = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
        setErr(String(o.error ?? o.detail ?? `HTTP ${r.status} — ${txt.slice(0, 200)}`));
        if (!silencioso) setData(null);
      } else { setErr(null); setData(body as Resp); }
    } catch (e) {
      if (alive.current && !silencioso) setErr(e instanceof Error ? e.message : String(e));
    } finally { if (alive.current) setLoading(false); }
  }, [fecha]);

  useEffect(() => { cargar(false); }, [cargar]);
  useEffect(() => {
    const t = setInterval(() => cargar(true), POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const editable = !!data?.puede_editar;
  const hoy = data?.hoy ?? "";
  const bancos = data?.bancos ?? [];
  const recargar = () => cargar(true);

  return (
    <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
      {err && (
        <div className="px-3 py-2 border border-[var(--t-neg)] bg-[var(--t-neg)]/10 text-[11px] text-[var(--t-neg)] shrink-0">
          Error al consultar CHEQUES: {err}
          <div className="text-[10px] text-[var(--t-text-dim)] mt-0.5">
            Si dice 404, el backend todavía no está reiniciado en el Droplet (endpoint nuevo).
          </div>
        </div>
      )}
      <div className="text-[9px] text-[var(--t-text-muted)] shrink-0">
        <b>Emitidos</b>: seguimiento, no dependen de la fecha de arriba — se listan todos
        los abiertos y marcarlos <b>completado</b> los saca de la vista (fecha de pago futura
        = fila naranja). Los <b>auto</b> los espeja solo el sistema desde los e-cheq de
        MOVIMIENTOS: no hay que cargarlos a mano y no restan dos veces del saldo.
        <b> Recibidos</b>: son los del día {data?.fecha ?? ""}, se registran intradía; los
        <b> finalizados</b> suman a "Ingresos e-cheqs" en BANCOS.
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Lado lado="recibido" titulo={`CHEQUES RECIBIDOS · ${data?.fecha ?? ""}`}
          filas={data?.recibidos ?? []} bancos={bancos} hoy={hoy} loading={loading}
          estados={data?.estados?.recibido ?? ["pendiente", "finalizado"]}
          tipos={data?.tipos ?? ["echeq", "fisico"]}
          editable={editable} onChanged={recargar} />
        <Lado lado="emitido" titulo="CHEQUES EMITIDOS"
          filas={data?.emitidos ?? []} bancos={bancos} hoy={hoy} loading={loading}
          estados={data?.estados?.emitido ?? ["pendiente", "emitido", "completado"]}
          tipos={[]} editable={editable} onChanged={recargar} />
      </div>
    </div>
  );
}


function Panel({ titulo, extra, children }: {
  titulo: string; extra?: ReactNode; children: ReactNode;
}) {
  return (
    <div className="min-h-0 flex flex-col">
      <div className="px-2 py-1 bg-[#094293] text-white text-[10px] uppercase tracking-widest font-semibold flex items-center gap-2 shrink-0">
        <span className="flex-1 text-center">{titulo}</span>
        {extra}
      </div>
      <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)]">{children}</div>
    </div>
  );
}


// Una mitad de la pantalla. Los dos lados comparten tabla y form; cambian las
// columnas (recibidos tienen TIPO y no fecha de pago) y los estados válidos.
function Lado({ lado, titulo, filas, bancos, estados, tipos, hoy, editable, loading, onChanged }: {
  lado: "emitido" | "recibido"; titulo: string; filas: Cheque[]; bancos: Banco[];
  estados: string[]; tipos: string[]; hoy: string; editable: boolean; loading: boolean;
  onChanged: () => void;
}) {
  const [alta, setAlta] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [consolidado, setConsolidado] = useState(false);
  const esEmitido = lado === "emitido";
  // RECIBIDOS son todos del día: el total es simplemente la suma, y va en el título.
  // EMITIDOS NO llevan total en el título: un solo número no puede resumir un tablero
  // que mezcla estados, fechas y monedas — se abre el CONSOLIDADO, que los separa.
  const total = filas.reduce((a, f) => a + f.importe, 0);
  // 5 fijas (comitente · cuit|tipo · banco · importe · estado) + fecha de pago, que
  // ahora existe también en RECIBIDOS (día hábil siguiente al movimiento).
  const nCols = 6 + (editable ? 1 : 0);

  // Cambio de estado desde la celda: un PUT y a recargar. Si el estado cierra,
  // la fila desaparece sola en el refresh.
  const cambiarEstado = async (f: Cheque, estado: string) => {
    setErr(null);
    try {
      const r = await fetch(`/api/back-office/tesoreria/cheques/${f.id}/estado`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErr(String(b?.error ?? b?.detail ?? `no se pudo cambiar el estado (HTTP ${r.status})`));
        return;
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Panel titulo={`${titulo} · ${filas.length}`}
      extra={
        <span className="flex items-center gap-2 normal-case">
          {esEmitido ? (
            <button onClick={() => setConsolidado(true)}
              title="Sumatoria por banco y moneda, separada por vencidos / de hoy / futuros / pendientes"
              className="text-[9px] uppercase tracking-widest border border-white/40 px-1.5 py-0.5 hover:bg-white/10">
              ver consolidado
            </button>
          ) : (
            <span className="text-[10px] tabular-nums">{fmt(total)}</span>
          )}
          {editable && (
            <button onClick={() => { setAlta((v) => !v); setEditId(null); }}
              className="text-[9px] uppercase tracking-widest border border-white/40 px-1.5 py-0.5 hover:bg-white/10">
              {alta ? "cancelar" : "+ nuevo"}
            </button>
          )}
        </span>
      }>
      {consolidado && (
        <ModalConsolidado filas={filas} hoy={hoy} onCerrar={() => setConsolidado(false)} />
      )}
      {err && <div className="px-2 py-1 text-[10px] text-[var(--t-neg)]">{err}</div>}
      {alta && (
        <FormCheque lado={lado} bancos={bancos} estados={estados} tipos={tipos}
          onCerrar={() => setAlta(false)} onOk={() => { setAlta(false); onChanged(); }} />
      )}
      <table className="text-[11px] w-full table-fixed">
        <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
          <tr className="border-b border-[var(--t-border)]">
            {/* Los anchos TIENEN que sumar 100: la tabla es `table-fixed` y con la
                suma pasada (era 113% en emitidos y 111% en recibidos) las celdas se
                estrechan y el contenido con `whitespace-nowrap` —el importe con su
                moneda— se desborda ENCIMA de la columna ESTADO. */}
            <th className={TH + " w-[21%]"}>Comitente</th>
            {esEmitido
              ? <th className={TH + " w-[12%]"}>CUIT</th>
              : <th className={TH + " w-[12%]"}>Tipo</th>}
            <th className={TH + " w-[17%]"}>Banco</th>
            <th className={TH + " w-[20%]"}>Importe</th>
            <th className={TH + " w-[15%]"}>Estado</th>
            <th className={TH + " w-[10%]"}>Fecha pago</th>
            {editable && <th className={TH + " w-[5%]"} />}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            editId === f.id ? (
              <tr key={f.id}><td colSpan={nCols} className="p-0">
                <FormCheque lado={lado} bancos={bancos} estados={estados} tipos={tipos}
                  inicial={f} onCerrar={() => setEditId(null)}
                  onOk={() => { setEditId(null); onChanged(); }} />
              </td></tr>
            ) : (
              <tr key={f.id}
                className={"border-b border-[var(--t-border)] hover:bg-[var(--t-surface)] " +
                  (f.fecha_pago && hoy && f.fecha_pago > hoy ? NARANJA : "")}
                title={f.fecha_pago && hoy && f.fecha_pago > hoy
                  ? `pago futuro (${fechaCorta(f.fecha_pago)}) — en seguimiento` : undefined}>
                <td className={TD + " " + WRAP}>
                  {cell(f.comitente_denominacion ?? f.comitente)}
                  {f.automatico && (
                    <span className={AUTO}
                      title={esEmitido
                        ? `Se creó solo desde el e-cheq de Aunesa (mov. ${f.mov_id ?? "—"}). ` +
                          "No hace falta cargarlo a mano y NO resta del saldo: esa plata ya " +
                          "entra por MOVIMIENTOS, en la fila Egresos e-cheq de BANCOS."
                        : `Se creó solo desde el depósito que informó Aunesa (${f.mov_id ?? "—"}). ` +
                          "Nadie lo tipeó. Aunesa NO manda la cuenta operativa: completá el " +
                          "BANCO con «editar» y después finalizalo — ahí suma a la fila " +
                          "Ingresos e-cheqs de BANCOS. La fecha de pago es el día hábil " +
                          "siguiente al del movimiento."}>
                      auto
                    </span>
                  )}
                </td>
                {esEmitido
                  ? <td className={TD + " " + NUM}>{cell(f.cuit)}</td>
                  : <td className={TD + " uppercase"}>{cell(f.tipo)}</td>}
                {/* Un espejo nace SIN banco (Aunesa no manda la cuenta operativa) y
                    sin banco no se puede finalizar — el backend lo rechaza. Se marca
                    para que se vea qué falta completar, no para decorar. */}
                <td className={TD + " " + WRAP}>
                  {f.banco ? cell(f.banco) : (
                    <span className="text-[#f59e0b]"
                      title="Falta la cuenta operativa. Completala con «editar»: sin banco el cheque no se puede finalizar ni imputar al saldo.">
                      falta banco
                    </span>
                  )}
                </td>
                <td className={TD + " " + NUM}>
                  {fmt(f.importe)}
                  <span className="text-[9px] text-[var(--t-text-muted)] ml-1">{f.unidad}</span>
                </td>
                <td className={TD}>
                  {editable ? (
                    <select value={f.estado} onChange={(e) => cambiarEstado(f, e.target.value)}
                      title="cambiar el estado (el que cierra saca la fila de la vista)"
                      className="w-full max-w-full bg-transparent border border-[var(--t-border-2)] px-1 text-[10px] text-[var(--t-text)] outline-none cursor-pointer [color-scheme:dark]">
                      {estados.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <span className="text-[var(--t-text-dim)]">{f.estado}</span>}
                </td>
                <td className={TD + " " + NUM}>{fechaCorta(f.fecha_pago)}</td>
                {editable && (
                  <td className={TD}>
                    <button onClick={() => { setEditId(f.id); setAlta(false); }}
                      className="text-[9px] text-[var(--t-accent)] hover:underline">editar</button>
                  </td>
                )}
              </tr>
            )
          ))}
          {!filas.length && (
            <tr><td colSpan={nCols} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
              {loading ? "cargando…" : "sin cheques abiertos"}
            </td></tr>
          )}
        </tbody>
      </table>
      {!editable && (
        <div className="text-[9px] text-[var(--t-text-muted)] p-2">
          Solo lectura: no tenés permiso para cargar cheques (se habilita en Manager → MESA).
        </div>
      )}
    </Panel>
  );
}


// CONSOLIDADO de EMITIDOS: la sumatoria por banco, separada en los grupos que el back
// office necesita distinguir para auditar. Reemplaza al total suelto que había en el
// título, que mezclaba estados, fechas y —peor— MONEDAS en un mismo número.
//
// El corte que importa es `IMPACTA EN BANCOS` = vencidos + de hoy: es EXACTAMENTE lo
// que el backend manda a la fila `egresos_echeq` de la grilla BANCOS (`estado='emitido'`
// y `fecha_pago <= día`). Los pendientes y los sin fecha se muestran aparte justamente
// porque NO restan del saldo, y verlos al lado es lo que evita la discusión de por qué
// un cheque "está" pero el banco no lo siente.
const GRUPOS = [
  { k: "vencido", t: "Vencidos", d: "emitidos con fecha de pago anterior a hoy" },
  { k: "hoy", t: "De hoy", d: "emitidos que se pagan hoy" },
  { k: "futuro", t: "Futuros", d: "emitidos con fecha de pago posterior a hoy — todavía no impactan" },
  { k: "auto", t: "Auto (Aunesa)", d: "espejados del e-cheq de MOVIMIENTOS: ya restaron por ese movimiento, NO vuelven a restar" },
  { k: "pendiente", t: "Pendientes", d: "todavía no emitidos: NO restan del saldo del banco" },
  { k: "sin_fecha", t: "Sin fecha", d: "emitidos sin fecha de pago cargada: NO restan del saldo" },
] as const;
type Grupo = (typeof GRUPOS)[number]["k"];

const vacio = (): Record<Grupo, { imp: number; n: number }> => ({
  vencido: { imp: 0, n: 0 }, hoy: { imp: 0, n: 0 }, futuro: { imp: 0, n: 0 },
  auto: { imp: 0, n: 0 }, pendiente: { imp: 0, n: 0 }, sin_fecha: { imp: 0, n: 0 },
});

const grupoDe = (f: Cheque, hoy: string): Grupo => {
  // Primero que nada: los espejo de Aunesa nunca restan (ya lo hizo su movimiento),
  // así que no pueden contaminar "vencidos"/"de hoy", que SÍ son lo que impacta.
  if (f.automatico) return "auto";
  if (f.estado !== "emitido") return "pendiente";
  if (!f.fecha_pago) return "sin_fecha";
  if (!hoy) return "futuro";
  if (f.fecha_pago < hoy) return "vencido";
  if (f.fecha_pago > hoy) return "futuro";
  return "hoy";
};

function ModalConsolidado({ filas, hoy, onCerrar }: {
  filas: Cheque[]; hoy: string; onCerrar: () => void;
}) {
  // Una fila por banco Y moneda: sumar ARS con USD no es un total, es un número sin
  // significado. Los subtotales también son por moneda, por eso se agrupa así.
  const porBanco = useMemo(() => {
    const m = new Map<string, { banco: string; unidad: string; g: ReturnType<typeof vacio> }>();
    for (const f of filas) {
      const unidad = (f.unidad || "ARS").toUpperCase();
      const clave = `${unidad}|${f.banco}`;
      let fila = m.get(clave);
      if (!fila) { fila = { banco: f.banco, unidad, g: vacio() }; m.set(clave, fila); }
      const g = fila.g[grupoDe(f, hoy)];
      g.imp += f.importe;
      g.n += 1;
    }
    return [...m.values()].sort((a, b) =>
      a.unidad.localeCompare(b.unidad) || a.banco.localeCompare(b.banco));
  }, [filas, hoy]);

  // Una entrada por moneda con sus bancos ya agrupados y su subtotal: así la tabla no
  // recalcula el subtotal una vez por celda mientras renderiza.
  const monedas = useMemo(() => {
    const orden = [...new Set(porBanco.map((f) => f.unidad))];
    return orden.map((unidad) => {
      const bancos = porBanco.filter((f) => f.unidad === unidad);
      const acc = vacio();
      for (const f of bancos) {
        for (const { k } of GRUPOS) { acc[k].imp += f.g[k].imp; acc[k].n += f.g[k].n; }
      }
      return { unidad, bancos, subtotal: acc };
    });
  }, [porBanco]);

  const impacta = (g: ReturnType<typeof vacio>) => g.vencido.imp + g.hoy.imp;
  const totalFila = (g: ReturnType<typeof vacio>) =>
    GRUPOS.reduce((a, { k }) => a + g[k].imp, 0);

  const celda = (k: string, v: { imp: number; n: number }) => (
    <td key={k} className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
      {v.n ? (
        <>
          {fmt(v.imp)}
          <span className="text-[9px] text-[var(--t-text-muted)] ml-1">({v.n})</span>
        </>
      ) : <span className="text-[var(--t-text-muted)]">—</span>}
    </td>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}>
      <div className="w-full max-w-[1100px] max-h-[85vh] flex flex-col bg-[var(--t-panel)] border border-[var(--t-border-2)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 bg-[#094293] text-white flex items-center gap-2 shrink-0">
          <span className="flex-1 text-[11px] uppercase tracking-widest font-semibold">
            Cheques emitidos · consolidado por banco
          </span>
          <button onClick={onCerrar} className="text-[12px] px-2 hover:opacity-70">✕</button>
        </div>
        <div className="px-3 py-1.5 text-[9px] text-[var(--t-text-muted)] border-b border-[var(--t-border)] shrink-0">
          {filas.length} cheques abiertos · entre paréntesis, la cantidad de cada grupo ·
          hoy {fechaCorta(hoy)}
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-[11px]">
            <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
              <tr className="border-b border-[var(--t-border)]">
                <th className="px-2 py-1.5 text-left font-normal">Banco</th>
                {GRUPOS.map((g) => (
                  <th key={g.k} className="px-2 py-1.5 text-right font-normal" title={g.d}>{g.t}</th>
                ))}
                <th className="px-2 py-1.5 text-right font-normal border-l border-[var(--t-border-2)]"
                  title="Vencidos + de hoy: lo que resta del saldo en la grilla BANCOS (fila Egresos e-cheq)">
                  Impacta en bancos
                </th>
                <th className="px-2 py-1.5 text-right font-normal">Total</th>
              </tr>
            </thead>
            {monedas.map(({ unidad, bancos, subtotal }) => (
              <tbody key={unidad}>
                <tr className="bg-[var(--t-surface)]">
                  <td colSpan={GRUPOS.length + 3}
                    className="px-2 py-1 text-[9px] uppercase tracking-widest text-[var(--t-text-dim)]">
                    {unidad}
                  </td>
                </tr>
                {bancos.map((f) => (
                  <tr key={f.unidad + f.banco} className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1">{f.banco}</td>
                    {GRUPOS.map((g) => celda(g.k, f.g[g.k]))}
                    <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap border-l border-[var(--t-border-2)] font-semibold">
                      {fmt(impacta(f.g))}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                      {fmt(totalFila(f.g))}
                    </td>
                  </tr>
                ))}
                <tr className="border-b-2 border-[var(--t-border-2)] font-semibold">
                  <td className="px-2 py-1 text-[10px] uppercase tracking-widest">Total {unidad}</td>
                  {GRUPOS.map((g) => celda(g.k, subtotal[g.k]))}
                  <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap border-l border-[var(--t-border-2)]">
                    {fmt(impacta(subtotal))}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums whitespace-nowrap">
                    {fmt(totalFila(subtotal))}
                  </td>
                </tr>
              </tbody>
            ))}
            {!porBanco.length && (
              <tbody>
                <tr><td colSpan={GRUPOS.length + 3}
                  className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                  sin cheques emitidos abiertos
                </td></tr>
              </tbody>
            )}
          </table>
        </div>

        <div className="px-3 py-2 text-[9px] text-[var(--t-text-muted)] border-t border-[var(--t-border)] shrink-0 leading-relaxed">
          <b>Impacta en bancos</b> = vencidos + de hoy. Es lo que el backend resta en la fila
          <b> Egresos e-cheq</b> de la grilla BANCOS, banco por banco. Los <b>futuros</b> entran
          solos cuando llega su fecha. Los <b>auto</b> ya restaron por su movimiento de
          MOVIMIENTOS, así que no se cuentan de nuevo. Los <b>pendientes</b> y los
          <b> sin fecha</b> NO restan del saldo: figuran acá para que se vea que existen.
        </div>
      </div>
    </div>
  );
}


// Alta/edición. `inicial` presente = edición (PUT); ausente = alta (POST).
function FormCheque({ lado, bancos, estados, tipos, inicial, onCerrar, onOk }: {
  lado: "emitido" | "recibido"; bancos: Banco[]; estados: string[]; tipos: string[];
  inicial?: Cheque; onCerrar: () => void; onOk: () => void;
}) {
  const esEmitido = lado === "emitido";
  const [f, setF] = useState(() => ({
    comitente: inicial?.comitente ?? "",
    comitente_denominacion: inicial?.comitente_denominacion ?? "",
    cuit: inicial?.cuit ?? "",
    tipo: inicial?.tipo ?? (esEmitido ? "" : (tipos[0] ?? "echeq")),
    banco: inicial?.banco ?? "",
    unidad: inicial?.unidad ?? "ARS",
    importe: inicial ? String(inicial.importe) : "",
    estado: inicial?.estado ?? (estados[0] ?? "pendiente"),
    fecha_pago: inicial?.fecha_pago ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState(inicial?.comitente_denominacion ?? "");
  const [sug, setSug] = useState<Comitente[]>([]);

  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Autocomplete de comitentes: mismo padrón de clientes que usa SENEBIS.
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2 || t === f.comitente_denominacion) { setSug([]); return; }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/back-office/tesoreria/cheques/comitentes?q=${encodeURIComponent(t)}`,
          { cache: "no-store" });
        if (!r.ok) return;
        const b = await r.json();
        setSug(Array.isArray(b?.comitentes) ? b.comitentes.slice(0, 8) : []);
      } catch { /* autocomplete es best-effort */ }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, f.comitente_denominacion]);

  const elegir = (c: Comitente) => {
    setF((p) => ({ ...p, comitente: c.id_cuenta,
      comitente_denominacion: c.denominacion ?? c.id_cuenta, cuit: c.cuit ?? p.cuit }));
    setQ(c.denominacion ?? c.id_cuenta);
    setSug([]);
  };

  const guardar = async () => {
    const imp = Number(f.importe.trim().replace(/\./g, "").replace(",", "."));
    if (!f.banco) { setErr("elegí un banco"); return; }
    if (!Number.isFinite(imp) || imp <= 0) { setErr("importe inválido"); return; }
    setBusy(true); setErr(null);
    try {
      const url = inicial
        ? `/api/back-office/tesoreria/cheques/${inicial.id}`
        : "/api/back-office/tesoreria/cheques";
      const r = await fetch(url, {
        method: inicial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f, lado, importe: imp,
          tipo: esEmitido ? null : f.tipo,
          // Antes se mandaba `null` fijo del lado RECIBIDO y eso BORRABA la fecha:
          // ahora los recibidos que espeja el backend nacen con `fecha_pago` = día
          // hábil siguiente al movimiento, y editarlos (para completarles el banco)
          // se la habría comido en el primer guardado.
          fecha_pago: f.fecha_pago || null,
        }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErr(String(b?.error ?? b?.detail ?? `no se pudo guardar (HTTP ${r.status})`));
        return;
      }
      onOk();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const borrar = async () => {
    if (!inicial) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/back-office/tesoreria/cheques/${inicial.id}`, { method: "DELETE" });
      if (!r.ok) { setErr(`no se pudo borrar (HTTP ${r.status})`); return; }
      onOk();
    } finally { setBusy(false); }
  };

  const input = "bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-0.5 " +
    "text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark]";
  const lbl = "uppercase tracking-widest text-[var(--t-text-muted)]";

  return (
    <div className="p-2 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex flex-wrap items-end gap-2 text-[10px]">
      <label className="flex flex-col gap-0.5 relative">
        <span className={lbl}>Comitente</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="número o nombre…"
          className={input + " w-[170px]"} />
        {!!sug.length && (
          <div className="absolute z-30 top-full left-0 mt-0.5 w-[260px] max-h-[180px] overflow-auto border border-[var(--t-border-2)] bg-[var(--t-panel)] shadow-lg">
            {sug.map((c) => (
              <button key={c.id_cuenta} onClick={() => elegir(c)}
                className="block w-full text-left px-2 py-1 text-[10px] hover:bg-[var(--t-surface)]">
                <b>{c.id_cuenta}</b> · {c.denominacion ?? "—"}
              </button>
            ))}
          </div>
        )}
      </label>

      {esEmitido ? (
        <label className="flex flex-col gap-0.5">
          <span className={lbl}>CUIT</span>
          <input value={f.cuit} onChange={(e) => set("cuit", e.target.value)}
            className={input + " w-[110px]"} />
        </label>
      ) : (
        <label className="flex flex-col gap-0.5">
          <span className={lbl}>Tipo</span>
          <select value={f.tipo} onChange={(e) => set("tipo", e.target.value)} className={input}>
            {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      )}

      <label className="flex flex-col gap-0.5">
        <span className={lbl}>Banco</span>
        <select value={`${f.banco}|${f.unidad}`}
          onChange={(e) => {
            const [b, u] = e.target.value.split("|");
            setF((p) => ({ ...p, banco: b, unidad: u || p.unidad }));
          }}
          className={input + " w-[190px]"}>
          <option value={`|${f.unidad}`}>— elegir —</option>
          {bancos.map((b) => (
            <option key={`${b.banco}|${b.unidad}`} value={`${b.banco}|${b.unidad}`}>
              {b.banco} [{b.unidad}]
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-0.5">
        <span className={lbl}>Importe {f.unidad ? `(${f.unidad})` : ""}</span>
        <input value={f.importe} onChange={(e) => set("importe", e.target.value)}
          className={input + " w-[110px] text-right"} />
      </label>

      <label className="flex flex-col gap-0.5">
        <span className={lbl}>Estado</span>
        <select value={f.estado} onChange={(e) => set("estado", e.target.value)} className={input}>
          {estados.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      {/* Los DOS lados tienen fecha de pago. En RECIBIDOS es el día en que la plata
          entra al banco: el día hábil siguiente al del movimiento (el e-cheq se carga
          con fecha de hoy y se acredita mañana). El espejo la calcula solo. */}
      <label className="flex flex-col gap-0.5">
        <span className={lbl}>Fecha de pago</span>
        <input type="date" value={f.fecha_pago}
          onChange={(e) => set("fecha_pago", e.target.value)} className={input} />
      </label>

      <button onClick={guardar} disabled={busy}
        className="px-2 py-1 uppercase tracking-widest border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40">
        {inicial ? "guardar" : "cargar"}
      </button>
      <button onClick={onCerrar} disabled={busy}
        className="px-2 py-1 uppercase tracking-widest text-[var(--t-text-muted)] hover:text-[var(--t-text)]">
        cancelar
      </button>
      {inicial && !inicial.automatico && (
        <button onClick={borrar} disabled={busy}
          className="px-2 py-1 uppercase tracking-widest text-[var(--t-neg)] hover:underline disabled:opacity-40">
          borrar
        </button>
      )}
      {inicial?.automatico && (
        <span className="text-[9px] text-[var(--t-text-muted)] normal-case">
          fila automática: no se borra (se recrea sola) — cerrala con <b>completado</b>
        </span>
      )}
      {err && <span className="text-[var(--t-neg)]">{err}</span>}
    </div>
  );
}
