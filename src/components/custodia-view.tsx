"use client";

import { useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";

/**
 * Back Office → CUSTODIA. La tenencia según la CAJA DE VALORES (CVSA).
 *
 * Es OTRA FUENTE, no otra vista de la misma. Todo lo demás del sistema sale de
 * Aunesa, que es el back-office tercerizado; esto es lo que la Caja tiene
 * REGISTRADO a nombre nuestro, y cuando las dos difieren la razón legal es de
 * la Caja. Doc: `acaquant-backend/docs/BYMA_CUSTODIA.md`.
 *
 * Dos cosas que solo se ven acá:
 *
 * ── **Qué está TRABADO.** `subBalanceType` separa lo disponible de lo que no se
 *    puede entregar ni garantizar (EMBARGO, BLOCKED_FOR_PLEDGE,
 *    PENDING_REDEMPTION…). Aunesa no da ese detalle, así que hasta ahora un
 *    papel embargado figuraba en la tenencia como cualquier otro.
 *
 * ── **Qué no sabemos nombrar.** CVSA identifica los papeles con un número
 *    propio (`cvsa_id`), sin relación con nuestros tickers. La traducción sale
 *    de `assets.codigo_cnv`; cuando falta, la fila igual se muestra con su
 *    número crudo. Un hueco a la vista es información — esconderlo sería
 *    mostrar una tenencia incompleta sin decirlo.
 *
 * Los números NO se calculan acá: vienen del backend, de la misma query que
 * dibuja la lista, así que no pueden contradecirla.
 *
 * La antigüedad del dato se muestra SIEMPRE. El job corre cada hora (el gateway
 * de BYMA cachea su respuesta 60 minutos), así que una foto de hace 20 minutos
 * es normal y una de hace 5 horas es un problema — y la diferencia tiene que
 * poder verse sin preguntar.
 */

type Fila = {
  id_cuenta: string;
  cuenta: string | null;
  cvsa_id: string;
  unidad: string | null;
  ticker: string | null;
  estado: string;
  cantidad: number | null;
  account_number: string | null;
};

type Payload = {
  fecha: string | null;
  filas: Fila[];
  total_filas: number;
  cuentas: number;
  sin_asset: number;
  trabado: number;
  truncado: boolean;
  actualizado_at: string | null;
  estados: { estado: string; n: number }[];
  aviso?: string;
};

const VACIO: Payload = {
  fecha: null, filas: [], total_filas: 0, cuentas: 0, sin_asset: 0,
  trabado: 0, truncado: false, actualizado_at: null, estados: [],
};

const DISPONIBLE = "AVAILABLE";

function antiguedad(iso: string | null): string {
  if (!iso) return "sin datos";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

function num(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function CustodiaView() {
  // Una sola sub-tab por ahora. La barra existe igual: la vista va a crecer
  // (transacciones, y el cruce contra Aunesa) y agregar la segunda no tiene que
  // ser un rediseño.
  const [sub] = useState<"tenencias">("tenencias");
  const [cuenta, setCuenta] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [soloTrabado, setSoloTrabado] = useState(false);

  // Los filtros van al BACKEND, no se aplican acá: así los contadores
  // corresponden a lo filtrado. Filtrando en el cliente, la lista diría una cosa
  // y los totales otra.
  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (cuenta.trim()) p.set("id_cuenta", cuenta.trim());
    if (estado) p.set("estado", estado);
    if (soloTrabado) p.set("solo_trabado", "true");
    const q = p.toString();
    return `/api/back-office/custodia/tenencias${q ? `?${q}` : ""}`;
  }, [cuenta, estado, soloTrabado]);

  // Cada 2 minutos. El dato de fondo cambia una vez por hora, así que pollear
  // más seguido no trae nada nuevo: alcanza para que la antigüedad se vea viva.
  const { data, error } = usePoll<Payload>(url, VACIO, 120_000, { fetchOnMount: true });

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Sub-tabs */}
      <div className="border-b border-[var(--t-border)] px-3 flex items-center gap-1 shrink-0">
        <button
          className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px ${
            sub === "tenencias"
              ? "border-[var(--t-accent)] text-[var(--t-text)]"
              : "border-transparent text-[var(--t-text-dim)]"
          }`}
        >
          TENENCIAS
        </button>
      </div>

      {/* Cabecera: de cuándo es la foto y qué hay adentro */}
      <div className="px-3 py-2 flex flex-wrap items-center gap-3 text-xs shrink-0
                      border-b border-[var(--t-border)]">
        <span className="text-[var(--t-text-dim)]">
          Caja de Valores ·{" "}
          <b className="text-[var(--t-text)]">{data.fecha ?? "—"}</b>{" "}
          <span title={data.actualizado_at ?? ""}>({antiguedad(data.actualizado_at)})</span>
        </span>
        <Dato label="filas" valor={data.total_filas} />
        <Dato label="cuentas" valor={data.cuentas} />
        <Dato label="trabado" valor={data.trabado} alerta={data.trabado > 0} />
        <Dato label="sin instrumento" valor={data.sin_asset} alerta={data.sin_asset > 0} />

        <input
          value={cuenta}
          onChange={(e) => setCuenta(e.target.value)}
          placeholder="cuenta (805)"
          className="px-2 py-1 rounded bg-[var(--t-panel)] border border-[var(--t-border)]
                     text-[var(--t-text)] w-28"
        />
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={soloTrabado}
                 onChange={(e) => setSoloTrabado(e.target.checked)} />
          solo trabado
        </label>
      </div>

      {/* Chips de estado — el universo sale de los DATOS, no de una lista fija */}
      {data.estados.length > 0 && (
        <div className="px-3 py-1.5 flex flex-wrap gap-1 shrink-0 border-b border-[var(--t-border)]">
          <Chip activo={estado === null} onClick={() => setEstado(null)}>TODOS</Chip>
          {data.estados.map((e) => (
            <Chip key={e.estado} activo={estado === e.estado}
                  onClick={() => setEstado(estado === e.estado ? null : e.estado)}>
              {e.estado} ({e.n})
            </Chip>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto">
        {error && (
          <p className="p-3 text-xs text-[var(--t-danger,#f87171)]">
            No se pudo leer la custodia: {error}
          </p>
        )}
        {!error && data.aviso && (
          <p className="p-3 text-xs text-[var(--t-text-dim)]">{data.aviso}</p>
        )}
        {!error && !data.aviso && data.filas.length === 0 && (
          <p className="p-3 text-xs text-[var(--t-text-dim)]">
            Sin filas para este filtro.
          </p>
        )}

        {data.filas.length > 0 && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--t-panel)]">
              <tr className="text-left text-[var(--t-text-dim)]">
                <Th>CUENTA</Th><Th>DENOMINACIÓN</Th><Th>INSTRUMENTO</Th>
                <Th>CVSA</Th><Th>ESTADO</Th><Th className="text-right">CANTIDAD</Th>
              </tr>
            </thead>
            <tbody>
              {data.filas.map((f, i) => (
                <tr key={`${f.id_cuenta}-${f.cvsa_id}-${f.estado}-${i}`}
                    className="border-t border-[var(--t-border)]">
                  <Td>{f.id_cuenta}</Td>
                  <Td className="text-[var(--t-text-dim)]">{f.cuenta ?? "—"}</Td>
                  <Td>
                    {f.ticker || f.unidad || (
                      // Sin traducción: se muestra el crudo y se dice por qué.
                      <span className="text-[var(--t-text-dim)] italic"
                            title="Falta el código de CAJA en el catálogo de assets">
                        sin instrumento
                      </span>
                    )}
                  </Td>
                  <Td className="text-[var(--t-text-dim)]">{f.cvsa_id}</Td>
                  <Td>
                    <span className={f.estado === DISPONIBLE
                      ? "text-[var(--t-text-dim)]"
                      : "text-[var(--t-warn,#fbbf24)] font-semibold"}>
                      {f.estado}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{num(f.cantidad)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data.truncado && (
          <p className="p-3 text-xs text-[var(--t-warn,#fbbf24)]">
            Lista recortada: hay más filas de las que se muestran. Filtrá por cuenta o estado.
          </p>
        )}
      </div>
    </div>
  );
}

function Dato({ label, valor, alerta }: { label: string; valor: number; alerta?: boolean }) {
  return (
    <span className="text-[var(--t-text-dim)]">
      {label}{" "}
      <b className={alerta ? "text-[var(--t-warn,#fbbf24)]" : "text-[var(--t-text)]"}>
        {valor.toLocaleString("es-AR")}
      </b>
    </span>
  );
}

function Chip({ activo, onClick, children }: {
  activo: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`px-2 py-0.5 rounded text-[10px] border ${
        activo
          ? "bg-[var(--t-accent)] text-[var(--t-bg)] border-[var(--t-accent)]"
          : "border-[var(--t-border)] text-[var(--t-text-dim)]"
      }`}>
      {children}
    </button>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-1.5 font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-1 ${className}`}>{children}</td>;
}
