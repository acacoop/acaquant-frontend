"use client";

import { useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";

/**
 * Back Office → CONTROL TÍTULOS NEGATIVOS.
 *
 * Dos tableros al 50%, uno por horizonte, porque contestan preguntas distintas:
 *
 *   T0 (izq) — posición liquidada A HOY. Es lo que está en custodia AHORA. Un
 *              negativo acá es un descubierto REAL: hoy no se puede entregar.
 *   T1 (der) — liquidada a MAÑANA, con lo concertado hoy adentro. Un negativo
 *              acá y no en T0 es un descubierto que se VIENE, con tiempo de
 *              resolverlo. Al revés (en T0 y no en T1) significa que ya se
 *              compró la contrapartida y liquida mañana.
 *
 * MONEDAS y DERIVADOS quedan afuera: en los dos el negativo es normal
 * (descubierto bancario / posición vendida) y llenarían la pantalla de ruido.
 *
 * La data sale de `portafolio.tenencia_live`, que refresca el daemon durante la
 * rueda. Por eso la barra muestra SIEMPRE la antigüedad: una lista vacía con el
 * daemon parado no es "no hay negativos", es "no sabemos".
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

type Lado = { n: number; filas: Fila[] };

type Resp = {
  fecha: string | null;
  actualizado_at: string | null;
  cuentas_en_posicion: number;
  incluir_todo: boolean;
  t0: Lado;
  t1: Lado;
};

const LADO_VACIO: Lado = { n: 0, filas: [] };
const VACIO: Resp = {
  fecha: null, actualizado_at: null, cuentas_en_posicion: 0,
  incluir_todo: false, t0: LADO_VACIO, t1: LADO_VACIO,
};

// El daemon refresca una cuenta como mucho cada 60s. 20s de poll es el mismo
// ritmo que Tesorería y alcanza de sobra.
const POLL_MS = 20_000;

// A partir de acá el dato deja de ser "vivo". El daemon corre 8-18 ART y su
// detector pasa cada 3 minutos, así que 10 minutos sin tocar nada ya es raro.
const STALE_MIN = 10;

const fmtNom = (v: number) =>
  v.toLocaleString("es-AR", { maximumFractionDigits: 4 });

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

  const { data, lastAt, error } = usePoll<Resp>(
    `/api/back-office/titulos-negativos?incluir_todo=${incluirTodo}`,
    VACIO,
    POLL_MS,
    { fetchOnMount: true },
  );

  const filtrar = (filas: Fila[]) => {
    const t = q.trim().toLowerCase();
    if (!t) return filas;
    return filas.filter((f) =>
      `${f.ticker} ${f.cuenta} ${f.id_cuenta}`.toLowerCase().includes(t),
    );
  };
  const t0 = useMemo(() => filtrar(data.t0.filas), [data.t0.filas, q]);
  const t1 = useMemo(() => filtrar(data.t1.filas), [data.t1.filas, q]);

  const minAntig = minutosDesde(data.actualizado_at);
  const stale = minAntig != null && minAntig > STALE_MIN;
  // Todavía no llegó ningún poll: no se puede afirmar nada, ni siquiera "vacío".
  const sinCargar = lastAt === 0 && data.fecha == null;

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* ── barra ── */}
      <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 flex items-center gap-3 flex-wrap">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ticker o cuenta…"
          className="text-[11px] bg-[var(--t-panel)] border border-[var(--t-border)] px-2 py-1 w-52 outline-none focus:border-[var(--t-accent)]"
        />

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

        <div className="ml-auto flex items-center gap-3 text-[11px]">
          {error && (
            <span className="text-[var(--t-neg)]" title={error}>
              error de carga: {error}
            </span>
          )}
          <span
            className={stale ? "text-[var(--t-neg)] font-bold" : "text-[var(--t-text-dim)]"}
            title={
              data.actualizado_at
                ? `Última escritura del daemon: ${data.actualizado_at}`
                : "El daemon todavía no escribió nada hoy"
            }
          >
            {stale ? "⚠ dato viejo · " : ""}
            actualizado {fmtAntiguedad(minAntig)}
          </span>
          {data.fecha && (
            <span className="text-[var(--t-text-dim)]">
              posición del {data.fecha}
            </span>
          )}
          <span className="text-[var(--t-text-dim)]">
            {data.cuentas_en_posicion} cuentas
          </span>
        </div>
      </div>

      {/* ── 50 / 50: T0 izquierda · T1 derecha ── */}
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
