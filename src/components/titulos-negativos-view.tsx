"use client";

import { useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";

/**
 * Back Office → CONTROL TÍTULOS NEGATIVOS.
 *
 * Muestra, en vivo, los títulos con nominales NEGATIVOS en la posición liquidada
 * a HOY (T0 = lo que está en custodia y se puede entregar). Un negativo ahí
 * significa que se comprometió un título que no se tiene: venta en descubierto,
 * una compra que no entró, o un error de carga. Sea cual sea, se ve el mismo día.
 *
 * El efectivo (ARS/USD/USDC) NO se muestra por default: un saldo de caja negativo
 * es un descubierto bancario, otro problema y de otro dueño — mezclarlo tapa
 * justo lo que esta vista existe para mostrar. Hay un toggle para sumarlo.
 *
 * La data sale de `portafolio.tenencia_live`, que refresca el daemon durante la
 * rueda. Por eso la pantalla muestra SIEMPRE la antigüedad del dato: una lista
 * vacía con el daemon parado no es "no hay negativos", es "no sabemos".
 */

type Fila = {
  id_cuenta: string;
  cuenta: string;
  unidad: string;
  ticker: string;
  cartera: string;
  cantidad: number;
  precio: number | null;
  valuacion: number;
  moneda: string;
  aum: string;
  origen: string;
  desde_consultado: string | null;
  actualizado_at: string | null;
};

type Resp = {
  fecha: string | null;
  horizonte: string;
  actualizado_at: string | null;
  cuentas_en_posicion: number;
  filas_en_posicion: number;
  incluir_monedas: boolean;
  solo_aum: boolean;
  n: number;
  negativos: Fila[];
};

const VACIO: Resp = {
  fecha: null, horizonte: "t0", actualizado_at: null, cuentas_en_posicion: 0,
  filas_en_posicion: 0, incluir_monedas: false, solo_aum: false, n: 0, negativos: [],
};

// El daemon refresca una cuenta como mucho cada 60s. 20s de poll es el mismo
// ritmo que Tesorería y alcanza de sobra.
const POLL_MS = 20_000;

// A partir de acá el dato deja de ser "vivo". El daemon corre 8-18 ART y su
// detector pasa cada 3 minutos, así que 10 minutos sin tocar nada ya es raro.
const STALE_MIN = 10;

const fmtNum = (v: number | null | undefined, dec = 2) =>
  v == null ? "—" : v.toLocaleString("es-AR", { maximumFractionDigits: dec });

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
  const [incluirMonedas, setIncluirMonedas] = useState(false);
  const [soloAum, setSoloAum] = useState(false);
  const [q, setQ] = useState("");

  const qs = new URLSearchParams({
    incluir_monedas: String(incluirMonedas),
    solo_aum: String(soloAum),
  }).toString();

  const { data, lastAt, error } = usePoll<Resp>(
    `/api/back-office/titulos-negativos?${qs}`,
    VACIO,
    POLL_MS,
    { fetchOnMount: true },
  );

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return data.negativos;
    return data.negativos.filter((f) =>
      `${f.ticker} ${f.unidad} ${f.cuenta} ${f.id_cuenta}`.toLowerCase().includes(t),
    );
  }, [data.negativos, q]);

  // Cuántas CUENTAS distintas tienen al menos un negativo — es el número que le
  // importa al back office (a cuántos clientes hay que llamar), no el de filas.
  const cuentasAfectadas = useMemo(
    () => new Set(filas.map((f) => f.id_cuenta)).size,
    [filas],
  );

  const minAntig = minutosDesde(data.actualizado_at);
  const stale = minAntig != null && minAntig > STALE_MIN;
  // Todavía no llegó ningún poll: no se puede afirmar nada, ni siquiera "vacío".
  const sinCargar = lastAt === 0 && data.fecha == null;

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* ── barra ── */}
      <div className="shrink-0 px-3 py-1.5 border-b border-[var(--t-border)] bg-[var(--t-accent)]/10 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide text-[var(--t-text-dim)]">
          Posición T0 · liquidada a hoy
        </span>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ticker o cuenta…"
          className="text-[11px] bg-[var(--t-panel)] border border-[var(--t-border)] px-2 py-1 w-52 outline-none focus:border-[var(--t-accent)]"
        />

        <label className="text-[11px] flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={incluirMonedas}
            onChange={(e) => setIncluirMonedas(e.target.checked)}
          />
          <span title="El efectivo negativo es un descubierto bancario, no un título en descubierto">
            incluir monedas
          </span>
        </label>

        <label className="text-[11px] flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soloAum}
            onChange={(e) => setSoloAum(e.target.checked)}
          />
          <span title="Por default se muestran TODAS las cuentas: un negativo en una cuenta fuera del AuM sigue siendo un descubierto">
            solo AuM
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
          <span className="text-[var(--t-text-dim)]">
            {data.cuentas_en_posicion} cuentas en posición
          </span>
        </div>
      </div>

      {/* ── resumen ── */}
      <div className="shrink-0 px-3 py-2 border-b border-[var(--t-border)] flex items-center gap-6">
        <Kpi
          label="Títulos negativos"
          valor={String(filas.length)}
          alerta={filas.length > 0}
        />
        <Kpi
          label="Cuentas afectadas"
          valor={String(cuentasAfectadas)}
          alerta={cuentasAfectadas > 0}
        />
        {data.fecha && (
          <div className="text-[11px] text-[var(--t-text-dim)]">
            posición del <span className="text-[var(--t-text)]">{data.fecha}</span>
          </div>
        )}
      </div>

      {/* ── tabla ── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {sinCargar ? (
          <Aviso texto="Cargando…" />
        ) : filas.length === 0 ? (
          <Aviso
            texto={
              stale
                ? "Sin negativos — pero el dato está viejo: el daemon de posición no está actualizando, así que esto NO confirma que no haya."
                : q.trim()
                  ? "Ningún negativo coincide con la búsqueda."
                  : "✓ Sin títulos negativos en T0."
            }
            alerta={stale}
          />
        ) : (
          <table className="w-full text-[11px] border-collapse">
            <thead className="sticky top-0 bg-[var(--t-panel)] z-10">
              <tr className="text-[var(--t-text-dim)] uppercase tracking-wide">
                <Th>Cuenta</Th>
                <Th>Ticker</Th>
                <Th>Unidad</Th>
                <Th>Cartera</Th>
                <Th right>Nominales</Th>
                <Th right>Precio</Th>
                <Th right>Valuación</Th>
                <Th>Mon.</Th>
                <Th>AuM</Th>
                <Th>Actualizado</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const m = minutosDesde(f.actualizado_at);
                return (
                  <tr
                    key={`${f.id_cuenta}|${f.unidad}`}
                    className="border-b border-[var(--t-border)] hover:bg-[var(--t-accent)]/5"
                  >
                    <Td title={f.cuenta}>{f.cuenta}</Td>
                    <Td className="font-bold text-[var(--t-accent)]">{f.ticker}</Td>
                    <Td className="text-[var(--t-text-dim)]" title={f.unidad}>
                      {f.unidad}
                    </Td>
                    <Td>{f.cartera || "—"}</Td>
                    <Td right className="font-bold text-[var(--t-neg)]">
                      {fmtNum(f.cantidad, 4)}
                    </Td>
                    <Td right>{fmtNum(f.precio)}</Td>
                    <Td right className={f.valuacion < 0 ? "text-[var(--t-neg)]" : ""}>
                      {fmtNum(f.valuacion)}
                    </Td>
                    <Td>{f.moneda || "—"}</Td>
                    <Td className="text-[var(--t-text-dim)]">{f.aum || "—"}</Td>
                    <Td
                      className="text-[var(--t-text-dim)]"
                      title={f.actualizado_at ?? ""}
                    >
                      {fmtAntiguedad(m)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--t-text-dim)]">
        {label}
      </div>
      <div
        className={`text-[18px] font-bold ${
          alerta ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]"
        }`}
      >
        {valor}
      </div>
    </div>
  );
}

function Aviso({ texto, alerta }: { texto: string; alerta?: boolean }) {
  return (
    <div
      className={`p-6 text-[12px] ${
        alerta ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]"
      }`}
    >
      {texto}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-1.5 font-normal border-b border-[var(--t-border)] ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  right,
  className = "",
  title,
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <td
      title={title}
      className={`px-3 py-1 whitespace-nowrap ${right ? "text-right" : ""} ${className}`}
    >
      {children}
    </td>
  );
}
