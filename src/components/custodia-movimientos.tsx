"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { Chip, Cuenta, SubTabs, Td, Th, type SubTab } from "./custodia-ui";

/**
 * Back Office → CUSTODIA → MOVIMIENTOS. Las liquidaciones según la CAJA.
 *
 * ⚠️ **UNA FILA = UN MOVIMIENTO, NO UNA PATA.** BYMA informa por PARTIDA DOBLE:
 * cada `instructionReference` viene dos veces, con el volumen de signo opuesto,
 * una por cada cuenta que participa. Medido: `6/3 → -280958.5138` y
 * `6/600613 → +280958.5138`, misma referencia. Son las dos patas de UN
 * movimiento. El plegado (dos patas → `entrega → recibe`) lo hace el BACKEND:
 * el front de esta app no deriva ni suma nada, y así el contador no puede
 * contradecir a la lista.
 *
 * Una pata sola **no es un error**: un movimiento contra una cuenta de otro
 * agente solo tiene una pata nuestra. Por eso `SIN PAR` es un chip informativo
 * y `DESCALCE` —las dos patas que no netean a cero— es el que sí alarma.
 *
 * `DÍAS` existe porque el feed corre varias veces al día: mirar solo hoy a las 9
 * devuelve vacío y eso NO significa que no haya habido movimientos.
 *
 * Doc: `acaquant-backend/docs/BYMA_CUSTODIA.md`.
 */

type Mov = {
  fecha_liq: string;
  referencia: string;
  unidad: string | null;
  cvsa_id: string;
  moneda: string | null;
  moneda_codigo: string | null;
  estado: string | null;          // solo lo trae el POST por referencia
  estado_motivo: string | null;
  fuente: string;
  // `account_number` COMPLETO (`80074/222222222`), no el número pelado: CVSA
  // usa tres espacios para el mismo agente y el lado derecho se repite.
  entrega: string | null;         // la cuenta que sale (volumen < 0)
  recibe: string | null;          // la cuenta que entra (volumen > 0)
  volumen: number | null;         // nominales, en positivo
  monto: number | null;
  contraparte: string | null;
  contraparte_cta: string | null;
  patas: number;
  neto: number;
  descalce: boolean;
};

/** Qué ES cada cuenta que aparece. Viene del catálogo declarado del backend:
 *  las liquidadoras y las de garantías NO son comitentes y su nombre no está en
 *  `clientes.cuentas` — buscarlo ahí devolvería un cliente que no tiene nada
 *  que ver con ellas. */
type FichaCuenta = {
  account_number: string;
  participante: string | null;
  id_cuenta: string;
  espacio: string | null;
  denominacion: string | null;
  comitente: boolean;
};

type Payload = {
  fecha: string | null;
  dias: number;
  cuentas: Record<string, FichaCuenta>;
  movimientos: Mov[];
  total: number;
  patas: number;
  sin_par: number;
  descalces: number;
  sin_asset: number;
  truncado: boolean;
  actualizado_at: string | null;
  estados: { estado: string; n: number }[];
};

const VACIO: Payload = {
  fecha: null, dias: 1, cuentas: {}, movimientos: [], total: 0, patas: 0, sin_par: 0,
  descalces: 0, sin_asset: 0, truncado: false, actualizado_at: null, estados: [],
};

// Mismo techo de render que TENENCIAS, por el mismo motivo: cada fila son nueve
// celdas y dibujar de más traba el buscador con cada tecla.
const RENDER_MAX = 150;

const VENTANAS = [1, 7, 30] as const;

function num(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

function dia(f: string): string {
  const [, m, d] = f.split("-");
  return `${d}/${m}`;
}

export function MovimientosTab({ sub, setSub }: { sub: SubTab; setSub: (s: SubTab) => void }) {
  const [dias, setDias] = useState<number>(1);
  const [q, setQ] = useState("");
  // El texto se ve al instante; el filtrado y el redibujo van DIFERIDOS. Es la
  // misma lección que costó el trabón de TENENCIAS.
  const qDiferido = useDeferredValue(q);
  const [soloDescalces, setSoloDescalces] = useState(false);
  const [soloSinPar, setSoloSinPar] = useState(false);
  const [soloSinInstrumento, setSoloSinInstrumento] = useState(false);

  // 5 min, igual que tenencias: el feed corre cada varios minutos desde la PC —
  // el techo del método de BYMA es 2 llamadas por minuto, así que pollear más
  // seguido solo re-baja lo mismo.
  const { data, error, lastAt } = usePoll<Payload>(
    `/api/back-office/custodia/movimientos?dias=${dias}`, VACIO, 300_000,
    { fetchOnMount: true });

  // lastAt === 0 es "todavía no hubo respuesta". Sin esto la pantalla afirma
  // «no hubo movimientos» cuando lo cierto es «no sé todavía».
  const cargando = lastAt === 0 && !error;

  const filtrados = useMemo(() => {
    const t = qDiferido.trim().toLowerCase();
    return data.movimientos.filter((m) => {
      if (t && !m.referencia.toLowerCase().includes(t)
            && !(m.unidad || "").toLowerCase().includes(t)
            && !(m.entrega || "").toLowerCase().includes(t)
            && !(m.recibe || "").toLowerCase().includes(t)
            && !(data.cuentas[m.entrega || ""]?.denominacion || "").toLowerCase().includes(t)
            && !(data.cuentas[m.recibe || ""]?.denominacion || "").toLowerCase().includes(t)
            && !(m.contraparte || "").toLowerCase().includes(t)) return false;
      if (soloDescalces && !m.descalce) return false;
      if (soloSinPar && m.patas !== 1) return false;
      if (soloSinInstrumento && m.unidad !== null) return false;
      return true;
    });
  }, [data.movimientos, data.cuentas, qDiferido, soloDescalces, soloSinPar,
      soloSinInstrumento]);

  const hayFiltro = Boolean(q.trim() || soloDescalces || soloSinPar || soloSinInstrumento);

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* FILA 1 — sub-tab a la izquierda, ventana y actualización a la derecha. */}
      <div className="border-b border-[var(--t-border)] px-3 flex items-center gap-3
                      text-xs shrink-0">
        <SubTabs sub={sub} setSub={setSub} />

        <span className="ml-auto text-[var(--t-text-dim)]">
          {data.patas > 0 && (
            <>{data.patas} patas → <b className="text-[var(--t-text)]">{data.total}</b> mov.</>
          )}
        </span>
        <span className="text-[var(--t-text-dim)]">
          BYMA <b className="text-[var(--t-text)] tabular-nums">
            {data.fecha ? dia(data.fecha) : "—"}</b>
        </span>
        <div className="flex rounded overflow-hidden border border-[var(--t-border)]">
          {VENTANAS.map((v) => (
            <button key={v} onClick={() => setDias(v)}
              title={v === 1
                ? "Solo el último día con movimientos."
                : `Los últimos ${v} días. El feed corre varias veces al día y una liquidación puede aparecer tarde.`}
              className={`px-2 py-0.5 text-[10px] font-semibold ${
                dias === v
                  ? "bg-[var(--t-accent)] text-[var(--t-bg)]"
                  : "text-[var(--t-text-dim)]"}`}>
              {v === 1 ? "DÍA" : `${v}D`}
            </button>
          ))}
        </div>
      </div>

      {/* FILA 2 — los chips llevan su número: no hace falta repetirlo en texto. */}
      <div className="px-3 py-1.5 flex flex-wrap items-center gap-1 shrink-0 text-xs
                      border-b border-[var(--t-border)]">
        <Chip activo={!hayFiltro} onClick={() => {
          setSoloDescalces(false); setSoloSinPar(false);
          setSoloSinInstrumento(false); setQ("");
        }}>TODOS ({data.total})</Chip>
        <Chip activo={soloDescalces} alerta={data.descalces > 0}
              onClick={() => setSoloDescalces(!soloDescalces)}>
          DESCALCES ({data.descalces})
        </Chip>
        {/* Informativo, NO alerta: contra otro agente solo vemos una pata. */}
        <Chip activo={soloSinPar} onClick={() => setSoloSinPar(!soloSinPar)}>
          SIN PAR ({data.sin_par})
        </Chip>
        <Chip activo={soloSinInstrumento}
              onClick={() => setSoloSinInstrumento(!soloSinInstrumento)}>
          SIN INSTRUMENTO ({data.sin_asset})
        </Chip>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="referencia, ticker o cuenta"
          className="ml-auto px-2 py-0.5 rounded bg-[var(--t-panel)] border
                     border-[var(--t-border)] text-[var(--t-text)] w-48"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {error && (
          <p className="p-3 text-xs text-[var(--t-danger,#f87171)]">
            No se pudieron leer los movimientos: {error}
          </p>
        )}
        {cargando && (
          <p className="p-3 text-xs text-[var(--t-text-dim)]">Cargando los movimientos…</p>
        )}
        {!cargando && !error && filtrados.length === 0 && (
          <p className="p-3 text-xs text-[var(--t-text-dim)]">
            {data.total === 0
              ? "Todavía no llegó ningún movimiento. El feed corre desde la PC de oficina."
              : "Sin movimientos para este filtro."}
          </p>
        )}

        {filtrados.length > 0 && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--t-panel)]">
              <tr className="text-left text-[var(--t-text-dim)]">
                <Th>LIQ.</Th><Th>INSTRUMENTO</Th><Th>CVSA</Th>
                <Th>ENTREGA</Th><Th>RECIBE</Th>
                <Th className="text-right">VOLUMEN</Th>
                <Th className="text-right">MONTO</Th>
                <Th>MON.</Th><Th>ESTADO</Th><Th>REFERENCIA</Th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, RENDER_MAX).map((m) => (
                <FilaMov key={`${m.fecha_liq}-${m.referencia}`} m={m}
                         cuentas={data.cuentas} />
              ))}
            </tbody>
          </table>
        )}

        {filtrados.length > RENDER_MAX && (
          <p className="p-3 text-xs text-[var(--t-warn,#fbbf24)]">
            Mostrando {RENDER_MAX} de {filtrados.length.toLocaleString("es-AR")} movimientos.
            Filtrá para ver el resto.
          </p>
        )}
        {data.truncado && (
          <p className="p-3 text-xs text-[var(--t-warn,#fbbf24)]">
            El servidor cortó la consulta en su techo de filas: hay más movimientos
            en esta ventana de los que entraron. Achicá los días.
          </p>
        )}
      </div>
    </div>
  );
}

/** Un movimiento. MEMOIZADA por el mismo motivo que la de tenencias. */
const FilaMov = memo(function FilaMov({ m, cuentas }: {
  m: Mov; cuentas: Record<string, FichaCuenta>;
}) {
  return (
    <tr className={`border-t border-[var(--t-border)] ${
      m.descalce ? "bg-[var(--t-danger,#f87171)]/10" : ""}`}>
      <Td className="text-[var(--t-text-dim)] tabular-nums">{dia(m.fecha_liq)}</Td>
      <Td>
        {m.unidad || (
          <span className="text-[var(--t-text-dim)] italic"
                title="Falta el código de CAJA en el catálogo de assets">
            sin instrumento
          </span>
        )}
      </Td>
      <Td className="text-[var(--t-text-dim)]">{m.cvsa_id}</Td>
      {/* El signo del volumen ES el dato: entrega la cuenta con volumen < 0. */}
      <Td><Lado cuenta={m.entrega} cuentas={cuentas} /></Td>
      <Td><Lado cuenta={m.recibe} cuentas={cuentas} /></Td>
      <Td className="text-right tabular-nums">{num(m.volumen)}</Td>
      <Td className="text-right tabular-nums text-[var(--t-text-dim)]">{num(m.monto)}</Td>
      <Td className="text-[var(--t-text-dim)]"
          title={m.moneda_codigo ? `código BYMA ${m.moneda_codigo}` : undefined}>
        {m.moneda ?? "—"}
      </Td>
      <Td>
        {m.estado
          ? <span title={m.estado_motivo ?? undefined}>{m.estado}</span>
          : <span className="text-[var(--t-text-dim)] italic"
                  title="El estado de liquidación solo lo devuelve la consulta por referencia, que todavía no está habilitada (el servidor no llega a BYMA).">
              —
            </span>}
      </Td>
      <Td className="text-[var(--t-text-dim)] font-mono text-[10px]">
        {m.referencia}
        {m.descalce && (
          <span className="ml-1 text-[var(--t-danger,#f87171)] font-bold"
                title={`Las patas no netean a cero: quedan ${m.neto}`}>⚠</span>
        )}
      </Td>
    </tr>
  );
});

/** Un lado del movimiento. Muestra QUÉ cuenta es, no solo su número: sin la
 *  etiqueta, `222222222` se lee como un comitente y es la Cta. Gtías. House. */
function Lado({ cuenta, cuentas }: {
  cuenta: string | null; cuentas: Record<string, FichaCuenta>;
}) {
  if (!cuenta) {
    // Una pata sola NO es un error: la otra punta es de otro agente.
    return (
      <span className="text-[var(--t-text-dim)] italic"
            title="La otra punta es de otro agente: BYMA solo nos informa nuestra pata.">
        otro agente
      </span>
    );
  }
  // "N cuentas" cuando hay varias de un mismo lado: no hay una ficha que buscar.
  const f = cuentas[cuenta];
  if (!f) return <span className="tabular-nums">{cuenta}</span>;
  return (
    <Cuenta account={f.account_number} espacio={f.espacio}
            denominacion={f.denominacion} comitente={f.comitente} />
  );
}
