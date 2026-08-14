"use client";

import { useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";

/**
 * Back Office → CONTROL DE NEGATIVOS. Dos pantallas en una, con un selector:
 *
 * ── SALDOS (default) — el efectivo de la casa, y es el control que importa.
 *    Sale de `portafolio.control_saldos`: el saldo **liquidado** que devuelve el
 *    endpoint `cuentas/{id}/posiciones` de Aunesa. La diferencia con todo lo que
 *    había antes es que ese número NO cuenta el futuro: una caución que vence
 *    mañana no ensucia el saldo de hoy, así que un negativo acá es un
 *    descubierto REAL y no un falso positivo que hay que descartar a mano.
 *    El signo ya viene corregido por el daemon — negativo es plata que falta.
 *    Trae el OPERADOR de la cuenta: un descubierto sin dueño no se resuelve.
 *    Las cuentas con nivel_5 CDC / OTC quedan afuera (el backend dice cuántas).
 *
 *    **Una moneda por vez** (pills, ARS por default): sumar pesos con dólares no
 *    significa nada, y un total mezclado es un número que no se puede usar. Por
 *    eso tampoco hay columna MONEDA — la dice el filtro.
 *
 *    **50/50**: izquierda A FAVOR (de mayor a menor) y derecha EN DESCUBIERTO
 *    (del más negativo para abajo). Las dos mitades salen de las MISMAS filas
 *    partidas por signo, así que sus totales no pueden contradecirse.
 *
 * ── TÍTULOS — el control viejo, sobre `portafolio.tenencia_live`, en sus dos
 *    horizontes (T0 = liquidada a hoy, T1 = con lo concertado hoy adentro).
 *    Sigue acá porque es una posición PROYECTADA y contesta otra pregunta;
 *    mientras el saldo liquidado no cubra también los títulos, sacarlo sería
 *    perder el control que el back office usa hoy.
 *
 * Las dos muestran SIEMPRE la antigüedad del dato: una lista vacía con el daemon
 * parado no es "no hay negativos", es "no sabemos".
 */

type Fila = {
  id_cuenta: string;
  cuenta: string;
  unidad: string;
  ticker: string;
  cartera: string;
  cantidad: number;
  actualizado_at: string | null;
};

type FilaSaldo = {
  id_cuenta: string;
  cuenta: string;
  ticker: string;
  cantidad: number;
  operador: string;
  nivel_5: string;
  actualizado_at: string | null;
};

type Saldos = {
  disponible: boolean;
  fecha: string | null;
  actualizado_at: string | null;
  cuentas_en_control: number;
  ocultas: number;
  excluidos: string[];
  n: number;
  n_negativos: number;
  filas: FilaSaldo[];
};

type Lado = { n: number; filas: Fila[] };

type Resp = {
  fecha: string | null;
  actualizado_at: string | null;
  cuentas_en_posicion: number;
  incluir_todo: boolean;
  t0: Lado;
  t1: Lado;
  saldos: Saldos;
};

const LADO_VACIO: Lado = { n: 0, filas: [] };
const SALDOS_VACIO: Saldos = {
  disponible: false, fecha: null, actualizado_at: null, cuentas_en_control: 0,
  ocultas: 0, excluidos: [], n: 0, n_negativos: 0, filas: [],
};

// Orden de las pills. Lo que no esté acá (si mañana entra USDC) se agrega solo,
// alfabético, después de estas — la pantalla no se rompe por una moneda nueva.
const MONEDAS_ORDEN = ["ARS", "USD", "USDL"];
const VACIO: Resp = {
  fecha: null, actualizado_at: null, cuentas_en_posicion: 0,
  incluir_todo: false, t0: LADO_VACIO, t1: LADO_VACIO, saldos: SALDOS_VACIO,
};

// El daemon refresca una cuenta como mucho cada 60s. 20s de poll es el mismo
// ritmo que Tesorería y alcanza de sobra.
const POLL_MS = 20_000;

// A partir de acá el dato deja de ser "vivo". El daemon corre 8-18 ART y su
// detector pasa cada 3 minutos, así que 10 minutos sin tocar nada ya es raro.
const STALE_MIN = 10;

const fmtNom = (v: number) =>
  v.toLocaleString("es-AR", { maximumFractionDigits: 4 });

// Los saldos son PLATA, no nominales: dos decimales. Con los 4 de `fmtNom` un
// saldo quedaba "-787.549.721,1115", que se lee peor y no aporta nada.
const fmtPlata = (v: number) =>
  v.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function minutosDesde(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / 60000;
}

function fmtAntiguedad(min: number | null): string {
  if (min == null) return "sin dato";
  if (min < 1) return "recién";
  if (min < 60) return `hace ${Math.round(min)} min`;
  if (min < 1440) return `hace ${(min / 60).toFixed(1)} h`;
  return `hace ${(min / 1440).toFixed(1)} días`;
}

export function TitulosNegativosView() {
  const [incluirTodo, setIncluirTodo] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"saldos" | "titulos">("saldos");
  const [moneda, setMoneda] = useState("ARS");

  const { data, lastAt, error } = usePoll<Resp>(
    `/api/back-office/titulos-negativos?incluir_todo=${incluirTodo}`,
    VACIO,
    POLL_MS,
    { fetchOnMount: true },
  );

  const saldos = data.saldos ?? SALDOS_VACIO;

  const filtrar = (filas: Fila[]) => {
    const t = q.trim().toLowerCase();
    if (!t) return filas;
    return filas.filter((f) =>
      `${f.ticker} ${f.cuenta} ${f.id_cuenta}`.toLowerCase().includes(t),
    );
  };
  const t0 = useMemo(() => filtrar(data.t0.filas), [data.t0.filas, q]);
  const t1 = useMemo(() => filtrar(data.t1.filas), [data.t1.filas, q]);
  // Las monedas que REALMENTE hay hoy, en el orden de las pills. Derivarlas de
  // los datos y no de una lista fija evita que la pantalla mienta: si una moneda
  // no operó, no aparece; si mañana entra una nueva, aparece sola.
  const monedas = useMemo(() => {
    const vistas = [...new Set(saldos.filas.map((f) => f.ticker))];
    return vistas.sort((a, b) => {
      const ia = MONEDAS_ORDEN.indexOf(a);
      const ib = MONEDAS_ORDEN.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [saldos.filas]);

  // La búsqueda de SALDOS incluye al operador: "todos los descubiertos de
  // Fulano" es la pregunta natural de esta pantalla.
  const { aFavor, enRojo } = useMemo(() => {
    const t = q.trim().toLowerCase();
    const filtradas = saldos.filas.filter(
      (f) =>
        f.ticker === moneda &&
        (!t ||
          `${f.cuenta} ${f.id_cuenta} ${f.operador}`.toLowerCase().includes(t)),
    );
    return {
      // Mayor a menor de un lado; el MÁS negativo primero del otro. Las dos
      // listas se ordenan acá y no en SQL porque el corte por moneda es del
      // front: ordenar en la base obligaría a una consulta por moneda.
      aFavor: filtradas
        .filter((f) => f.cantidad > 0)
        .sort((a, b) => b.cantidad - a.cantidad),
      enRojo: filtradas
        .filter((f) => f.cantidad < 0)
        .sort((a, b) => a.cantidad - b.cantidad),
    };
  }, [saldos.filas, q, moneda]);

  // Cada tablero envejece por su cuenta: son DOS daemons y uno puede estar
  // muerto con el otro sano. Mostrar una sola antigüedad mentiría sobre el otro.
  const antigTitulos = minutosDesde(data.actualizado_at);
  const antigSaldos = minutosDesde(saldos.actualizado_at);
  const minAntig = tab === "saldos" ? antigSaldos : antigTitulos;
  const stale = minAntig != null && minAntig > STALE_MIN;
  const fechaMostrada = tab === "saldos" ? saldos.fecha : data.fecha;
  const cuentas =
    tab === "saldos" ? saldos.cuentas_en_control : data.cuentas_en_posicion;
  // Todavía no llegó ningún poll: no se puede afirmar nada, ni siquiera "vacío".
  const sinCargar =
    lastAt === 0 && data.fecha == null && saldos.fecha == null;

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* ── barra ── */}
      <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 flex items-center gap-3 flex-wrap">
        <div className="flex">
          {(["saldos", "titulos"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-[11px] px-3 py-1 border ${
                tab === t
                  ? "bg-[var(--t-accent)] text-white border-[var(--t-accent)] font-bold"
                  : "bg-[var(--t-panel)] border-[var(--t-border)] text-[var(--t-text-dim)]"
              }`}
            >
              {t === "saldos" ? "SALDOS" : "TÍTULOS"}
              {t === "saldos" &&
                saldos.n_negativos > 0 &&
                ` (${saldos.n_negativos})`}
            </button>
          ))}
        </div>

        {tab === "saldos" && monedas.length > 0 && (
          <div className="flex">
            {monedas.map((m) => (
              <button
                key={m}
                onClick={() => setMoneda(m)}
                className={`text-[11px] px-2.5 py-1 border ${
                  moneda === m
                    ? "bg-[var(--t-panel)] border-[var(--t-accent)] text-[var(--t-accent)] font-bold"
                    : "bg-transparent border-[var(--t-border)] text-[var(--t-text-dim)]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={tab === "saldos" ? "cuenta u operador…" : "ticker o cuenta…"}
          className="text-[11px] bg-[var(--t-panel)] border border-[var(--t-border)] px-2 py-1 w-52 outline-none focus:border-[var(--t-accent)]"
        />

        {tab === "titulos" && (
          <label className="text-[11px] flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={incluirTodo}
              onChange={(e) => setIncluirTodo(e.target.checked)}
            />
            <span title="Por default quedan afuera: en los dos el negativo es normal — el efectivo negativo es un descubierto bancario y el derivado negativo es una posición vendida">
              incluir monedas y derivados
            </span>
          </label>
        )}

        {tab === "saldos" && saldos.ocultas > 0 && (
          <span
            className="text-[11px] text-[var(--t-text-dim)]"
            title={`Cuentas con nivel_5 ${saldos.excluidos.join(" / ")} — no entran a este control`}
          >
            {saldos.ocultas} oculta{saldos.ocultas === 1 ? "" : "s"} por{" "}
            {saldos.excluidos.join("/")}
          </span>
        )}

        <div className="ml-auto flex items-center gap-3 text-[11px]">
          {error && (
            <span className="text-[var(--t-neg)]" title={error}>
              error de carga: {error}
            </span>
          )}
          <span
            className={stale ? "text-[var(--t-neg)] font-bold" : "text-[var(--t-text-dim)]"}
            title={
              tab === "saldos"
                ? saldos.actualizado_at
                  ? `Última escritura del daemon de saldos: ${saldos.actualizado_at}`
                  : "El daemon de saldos todavía no escribió nada hoy"
                : data.actualizado_at
                  ? `Última escritura del daemon de posición: ${data.actualizado_at}`
                  : "El daemon de posición todavía no escribió nada hoy"
            }
          >
            {stale ? "⚠ dato viejo · " : ""}
            actualizado {fmtAntiguedad(minAntig)}
          </span>
          {fechaMostrada && (
            <span className="text-[var(--t-text-dim)]">
              {tab === "saldos" ? "saldos del" : "posición del"} {fechaMostrada}
            </span>
          )}
          <span className="text-[var(--t-text-dim)]">{cuentas} cuentas</span>
        </div>
      </div>

      {tab === "saldos" ? (
        <div className="flex-1 min-h-0 flex">
          <TableroSaldos
            titulo="A FAVOR"
            bajada="saldo liquidado positivo — de mayor a menor"
            filas={aFavor}
            moneda={moneda}
            positivo
            disponible={saldos.disponible}
            sinCargar={sinCargar}
            stale={stale}
            buscando={q.trim().length > 0}
          />
          <div className="w-px bg-[var(--t-border)] shrink-0" />
          <TableroSaldos
            titulo="EN DESCUBIERTO"
            bajada="saldo liquidado negativo — el más negativo primero"
            filas={enRojo}
            moneda={moneda}
            disponible={saldos.disponible}
            sinCargar={sinCargar}
            stale={stale}
            buscando={q.trim().length > 0}
          />
        </div>
      ) : (
        /* ── 50 / 50: T0 izquierda · T1 derecha ── */
        <div className="flex-1 min-h-0 flex">
          <Tablero
            titulo="T0"
            bajada="liquidada a HOY — lo que está en custodia ahora"
            filas={t0}
            sinCargar={sinCargar}
            stale={stale}
            buscando={q.trim().length > 0}
          />
          <div className="w-px bg-[var(--t-border)] shrink-0" />
          <Tablero
            titulo="T1"
            bajada="liquidada a MAÑANA — con lo concertado hoy"
            filas={t1}
            sinCargar={sinCargar}
            stale={stale}
            buscando={q.trim().length > 0}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Un lado del 50/50 de SALDOS: A FAVOR o EN DESCUBIERTO, de UNA moneda.
 *
 * Sin columna MONEDA — la fija el filtro de arriba, y repetirla en cada fila
 * sería gastar ancho en un dato que ya está dicho. El total de la cabecera es
 * de ESE lado y ESA moneda: sumar pesos con dólares no significa nada.
 */
function TableroSaldos({
  titulo,
  bajada,
  filas,
  moneda,
  positivo,
  disponible,
  sinCargar,
  stale,
  buscando,
}: {
  titulo: string;
  bajada: string;
  filas: FilaSaldo[];
  moneda: string;
  positivo?: boolean;
  disponible: boolean;
  sinCargar: boolean;
  stale: boolean;
  buscando: boolean;
}) {
  const total = filas.reduce((a, f) => a + f.cantidad, 0);
  const color = positivo ? "var(--t-pos)" : "var(--t-neg)";

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border)] flex items-baseline gap-3 flex-wrap">
        <span className="text-[13px] font-bold tracking-wide text-[var(--t-accent)]">
          {titulo}
        </span>
        <span className="text-[10px] text-[var(--t-text-dim)]">{bajada}</span>
        <span className="ml-auto text-[12px] font-bold" style={{ color }}>
          {moneda} {fmtPlata(total)}
        </span>
        <span className="text-[10px] text-[var(--t-text-dim)]">
          {filas.length} {filas.length === 1 ? "cuenta" : "cuentas"}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {sinCargar ? (
          <Aviso texto="Cargando…" />
        ) : !disponible ? (
          <Aviso
            alerta
            texto="El control de saldos todavía no tiene datos: la tabla portafolio.control_saldos no existe o está vacía. Corre el daemon jobs.control_saldos."
          />
        ) : filas.length === 0 ? (
          <Aviso
            alerta={stale && !positivo}
            texto={
              buscando
                ? "Ninguna cuenta coincide con la búsqueda."
                : positivo
                  ? `Ninguna cuenta con saldo a favor en ${moneda}.`
                  : stale
                    ? "Sin descubiertos — pero el dato está viejo: el daemon de saldos no está actualizando, así que esto NO confirma que no haya."
                    : `✓ Sin descubiertos en ${moneda}.`
            }
          />
        ) : (
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
              <tr className="text-[var(--t-text-dim)] uppercase tracking-wide">
                <th className="px-3 py-1.5 font-normal text-left border-b border-[var(--t-border)]">
                  Cuenta
                </th>
                <th className="px-3 py-1.5 font-normal text-left border-b border-[var(--t-border)]">
                  Operador
                </th>
                <th className="px-3 py-1.5 font-normal text-right border-b border-[var(--t-border)]">
                  Saldo
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr
                  key={`${f.id_cuenta}|${f.ticker}`}
                  className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5"
                >
                  <td className="px-3 py-1 whitespace-nowrap" title={f.cuenta}>
                    {f.cuenta}
                  </td>
                  <td
                    className={`px-3 py-1 whitespace-nowrap ${
                      f.operador ? "" : "text-[var(--t-text-dim)] italic"
                    }`}
                    title={f.nivel_5 ? `nivel 5: ${f.nivel_5}` : undefined}
                  >
                    {f.operador || "sin operador"}
                  </td>
                  <td
                    className="px-3 py-1 whitespace-nowrap text-right font-bold"
                    style={{ color }}
                  >
                    {fmtPlata(f.cantidad)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Tablero({
  titulo,
  bajada,
  filas,
  sinCargar,
  stale,
  buscando,
}: {
  titulo: string;
  bajada: string;
  filas: Fila[];
  sinCargar: boolean;
  stale: boolean;
  buscando: boolean;
}) {
  const cuentas = new Set(filas.map((f) => f.id_cuenta)).size;

  return (
    <div className="flex-1 min-w-0 flex flex-col min-h-0">
      <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border)] flex items-baseline gap-3">
        <span className="text-[13px] font-bold tracking-wide text-[var(--t-accent)]">
          {titulo}
        </span>
        <span className="text-[10px] text-[var(--t-text-dim)]">{bajada}</span>
        <span
          className={`ml-auto text-[16px] font-bold ${
            filas.length ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]"
          }`}
        >
          {filas.length}
        </span>
        <span className="text-[10px] text-[var(--t-text-dim)]">
          {filas.length === 1 ? "título" : "títulos"}
          {cuentas > 0 && ` · ${cuentas} ${cuentas === 1 ? "cuenta" : "cuentas"}`}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {sinCargar ? (
          <Aviso texto="Cargando…" />
        ) : filas.length === 0 ? (
          <Aviso
            alerta={stale}
            texto={
              stale
                ? "Sin negativos — pero el dato está viejo: el daemon de posición no está actualizando, así que esto NO confirma que no haya."
                : buscando
                  ? "Ningún negativo coincide con la búsqueda."
                  : "✓ Sin títulos negativos."
            }
          />
        ) : (
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
              <tr className="text-[var(--t-text-dim)] uppercase tracking-wide">
                <th className="px-3 py-1.5 font-normal text-left border-b border-[var(--t-border)]">
                  Cuenta
                </th>
                <th className="px-3 py-1.5 font-normal text-left border-b border-[var(--t-border)]">
                  Ticker
                </th>
                <th className="px-3 py-1.5 font-normal text-right border-b border-[var(--t-border)]">
                  Nominales
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr
                  key={`${f.id_cuenta}|${f.unidad}`}
                  className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5"
                >
                  <td className="px-3 py-1 whitespace-nowrap" title={f.cuenta}>
                    {f.cuenta}
                  </td>
                  <td
                    className="px-3 py-1 whitespace-nowrap font-bold text-[var(--t-accent)]"
                    title={`${f.unidad}${f.cartera ? ` · ${f.cartera}` : ""}`}
                  >
                    {f.ticker}
                  </td>
                  <td className="px-3 py-1 whitespace-nowrap text-right font-bold text-[var(--t-neg)]">
                    {fmtNom(f.cantidad)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Aviso({ texto, alerta }: { texto: string; alerta?: boolean }) {
  return (
    <div
      className={`p-5 text-[12px] ${
        alerta ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"
      }`}
    >
      {texto}
    </div>
  );
}
