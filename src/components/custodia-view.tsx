"use client";

import { useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";

/**
 * Back Office → CUSTODIA. La tenencia según la CAJA DE VALORES (CVSA).
 *
 * Es OTRA FUENTE, no otra vista de la misma: todo lo demás del sistema sale de
 * Aunesa (el back-office tercerizado) y esto es lo que la Caja tiene REGISTRADO.
 * Cuando difieren, la razón legal es de la Caja. La trae la PC de oficina
 * (`scripts/byma_feed.py`), porque las APIs de BYMA están detrás de AppGate y el
 * Droplet no las alcanza. Doc: `acaquant-backend/docs/BYMA_CUSTODIA.md`.
 *
 * UN SOLO REQUEST, y los filtros se aplican ACÁ. La foto de un día es un
 * conjunto cerrado (~2.800 filas): antes cada chip disparaba un viaje al
 * servidor con tres queries, y tildar un filtro costaba un segundo de espera.
 * Filtrando en memoria es instantáneo — y como la lista y los contadores salen
 * del MISMO array, es imposible que se contradigan.
 *
 * Dos cosas que solo se ven acá:
 *   · **Qué está TRABADO** — EMBARGO, BLOCKED_FOR_PLEDGE, PENDING_REDEMPTION…
 *     Aunesa no da ese detalle, así que hasta ahora un papel embargado figuraba
 *     en la tenencia como cualquier otro y no se puede entregar.
 *   · **Qué no sabemos nombrar** — CVSA identifica los papeles con un número
 *     propio; la traducción sale de `assets.codigo_cnv`. Cuando falta, la fila
 *     se muestra igual con su número crudo y el chip SIN INSTRUMENTO la aísla.
 *     Un hueco a la vista es información; esconderlo sería mostrar una tenencia
 *     incompleta sin decirlo.
 */

type Fila = {
  id_cuenta: string;
  cuenta: string | null;
  cvsa_id: string;
  unidad: string | null;
  ticker: string | null;
  estados: string | null;
  vn_byma: number;
  vn_aunesa: number | null;      // cantidad - gar_cantidad (BYMA informa sin garantías)
  dif: number | null;            // BYMA - AUNESA. null = no se puede comparar
  trabado: number;
  aunesa_cantidad: number | null;
  aunesa_garantia: number | null;
};

type Payload = {
  fecha: string | null;
  fecha_aunesa: string | null;
  filas: Fila[];
  total_filas: number;
  cuentas: number;
  sin_asset: number;
  trabado: number;
  difieren: number;
  sin_comparar: number;
  truncado: boolean;
  actualizado_at: string | null;
  estados: { estado: string; n: number }[];
  aviso?: string;
};

const VACIO: Payload = {
  fecha: null, fecha_aunesa: null, filas: [], total_filas: 0, cuentas: 0,
  sin_asset: 0, trabado: 0, difieren: 0, sin_comparar: 0, truncado: false,
  actualizado_at: null, estados: [],
};

// Dos nominales que difieren en centavos no son un descalce: es redondeo.
// Mismo umbral que el backend — si divergen, la lista y el contador dejarían
// de decir lo mismo.
const TOLERANCIA = 0.01;

// Cuántas filas se dibujan. 2.800 <tr> son ~17.000 nodos en el DOM y eso sí se
// siente. Con el filtro puesto casi nunca se llega; cuando se llega, la vista lo
// DICE en vez de mostrar una lista cortada en silencio.
const RENDER_MAX = 400;

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
  const [cuenta, setCuenta] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [soloTrabado, setSoloTrabado] = useState(false);
  const [soloSinInstrumento, setSoloSinInstrumento] = useState(false);
  const [soloDiferencias, setSoloDiferencias] = useState(false);

  // Un request por la foto entera. 5 min: el dato de fondo cambia UNA VEZ POR
  // HORA (el gateway de BYMA cachea su respuesta 60 min), así que pollear más
  // seguido solo re-baja el mismo payload.
  const { data, error, lastAt } = usePoll<Payload>(
    "/api/back-office/custodia/tenencias", VACIO, 300_000, { fetchOnMount: true });

  // lastAt === 0 es "todavía no hubo ninguna respuesta". Sin esto la pantalla
  // dice «Sin filas» mientras carga — o sea afirma «no hay nada» cuando lo
  // cierto es «no sé todavía», que es la mentira más cara de toda la vista.
  const cargando = lastAt === 0 && !error;

  const filtradas = useMemo(() => {
    const q = cuenta.trim().toLowerCase();
    return data.filas.filter((f) => {
      if (q && !f.id_cuenta.toLowerCase().includes(q)
            && !(f.cuenta || "").toLowerCase().includes(q)
            && !(f.ticker || "").toLowerCase().includes(q)) return false;
      if (estado && !(f.estados || "").includes(estado)) return false;
      if (soloTrabado && f.trabado === 0) return false;
      if (soloSinInstrumento && f.unidad !== null) return false;
      // "Solo diferencias" muestra descalces REALES: lo que no se puede
      // comparar (sin instrumento) no es una diferencia, es un dato que falta.
      if (soloDiferencias && !(f.dif !== null && Math.abs(f.dif) > TOLERANCIA)) return false;
      return true;
    });
  }, [data.filas, cuenta, estado, soloTrabado, soloSinInstrumento, soloDiferencias]);

  // Los contadores describen LO FILTRADO y salen del mismo array que la lista.
  const vista = useMemo(() => {
    const cuentas = new Set<string>();
    let sinAsset = 0, difieren = 0, sinComparar = 0;
    for (const f of filtradas) {
      cuentas.add(f.id_cuenta);
      if (f.unidad === null) sinAsset++;
      if (f.dif === null) sinComparar++;
      else if (Math.abs(f.dif) > TOLERANCIA) difieren++;
    }
    return { filas: filtradas.length, cuentas: cuentas.size, sinAsset, difieren, sinComparar };
  }, [filtradas]);

  const hayFiltro = Boolean(cuenta.trim() || estado || soloTrabado
                            || soloSinInstrumento || soloDiferencias);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="border-b border-[var(--t-border)] px-3 flex items-center gap-1 shrink-0">
        <span className="px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px
                         border-[var(--t-accent)] text-[var(--t-text)]">
          TENENCIAS
        </span>
      </div>

      <div className="px-3 py-2 flex flex-wrap items-center gap-3 text-xs shrink-0
                      border-b border-[var(--t-border)]">
        <span className="text-[var(--t-text-dim)]">
          Caja de Valores ·{" "}
          <b className="text-[var(--t-text)]">{data.fecha ?? (cargando ? "…" : "—")}</b>{" "}
          {!cargando && (
            <span title={data.actualizado_at ?? ""}>({antiguedad(data.actualizado_at)})</span>
          )}
          {" · Aunesa T0 "}
          <b className="text-[var(--t-text)]">{data.fecha_aunesa ?? "—"}</b>
        </span>
        {/* Si las dos fotos no son del mismo día, la comparación mezcla dos
            momentos y CUALQUIER diferencia puede ser eso y no un descalce. */}
        {data.fecha && data.fecha_aunesa && data.fecha !== data.fecha_aunesa && (
          <span className="px-2 py-0.5 rounded bg-[var(--t-warn,#fbbf24)] text-black font-semibold">
            ⚠ las dos fotos son de días distintos
          </span>
        )}
        <Dato label="filas" valor={vista.filas} total={hayFiltro ? data.total_filas : null} />
        <Dato label="cuentas" valor={vista.cuentas} />
        <Dato label="DIFERENCIAS" valor={vista.difieren} alerta={vista.difieren > 0} fuerte />
        <Dato label="sin comparar" valor={vista.sinComparar} />

        <input
          value={cuenta}
          onChange={(e) => setCuenta(e.target.value)}
          placeholder="cuenta o ticker"
          className="px-2 py-1 rounded bg-[var(--t-panel)] border border-[var(--t-border)]
                     text-[var(--t-text)] w-36"
        />
      </div>

      <div className="px-3 py-1.5 flex flex-wrap gap-1 shrink-0 border-b border-[var(--t-border)]">
        <Chip activo={!hayFiltro} onClick={() => {
          setEstado(null); setSoloTrabado(false); setSoloSinInstrumento(false);
          setSoloDiferencias(false); setCuenta("");
        }}>TODOS</Chip>
        <Chip activo={soloDiferencias} onClick={() => setSoloDiferencias(!soloDiferencias)}>
          SOLO DIFERENCIAS ({data.difieren})
        </Chip>
        <Chip activo={soloTrabado} onClick={() => { setSoloTrabado(!soloTrabado); setEstado(null); }}>
          TRABADO ({data.trabado})
        </Chip>
        <Chip activo={soloSinInstrumento}
              onClick={() => setSoloSinInstrumento(!soloSinInstrumento)}>
          SIN INSTRUMENTO ({data.sin_asset})
        </Chip>
        <span className="w-2" />
        {data.estados.map((e) => (
          <Chip key={e.estado} activo={estado === e.estado}
                onClick={() => { setEstado(estado === e.estado ? null : e.estado); setSoloTrabado(false); }}>
            {e.estado} ({e.n})
          </Chip>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {error && (
          <p className="p-3 text-xs text-[var(--t-danger,#f87171)]">
            No se pudo leer la custodia: {error}
          </p>
        )}
        {cargando && (
          <p className="p-3 text-xs text-[var(--t-text-dim)]">Cargando la foto de la Caja…</p>
        )}
        {!cargando && !error && data.aviso && (
          <p className="p-3 text-xs text-[var(--t-text-dim)]">{data.aviso}</p>
        )}
        {!cargando && !error && !data.aviso && filtradas.length === 0 && (
          <p className="p-3 text-xs text-[var(--t-text-dim)]">Sin filas para este filtro.</p>
        )}

        {filtradas.length > 0 && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--t-panel)]">
              <tr className="text-left text-[var(--t-text-dim)]">
                <Th>CUENTA</Th><Th>DENOMINACIÓN</Th><Th>INSTRUMENTO</Th>
                <Th>CVSA</Th><Th>ESTADO</Th>
                <Th className="text-right">VN AUNESA</Th>
                <Th className="text-right">VN BYMA</Th>
                <Th className="text-right">DIFERENCIA</Th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, RENDER_MAX).map((f, i) => {
                const rojo = f.dif !== null && Math.abs(f.dif) > TOLERANCIA;
                return (
                <tr key={`${f.id_cuenta}-${f.cvsa_id}-${i}`}
                    className={`border-t border-[var(--t-border)] ${
                      rojo ? "bg-[var(--t-danger,#f87171)]/10" : ""}`}>
                  <Td>{f.id_cuenta}</Td>
                  <Td className="text-[var(--t-text-dim)]">{f.cuenta ?? "—"}</Td>
                  <Td>
                    {f.ticker || f.unidad || (
                      <span className="text-[var(--t-text-dim)] italic"
                            title="Falta el código de CAJA en el catálogo de assets">
                        sin instrumento
                      </span>
                    )}
                  </Td>
                  <Td className="text-[var(--t-text-dim)]">{f.cvsa_id}</Td>
                  <Td>
                    <span className={f.trabado === 0
                      ? "text-[var(--t-text-dim)]"
                      : "text-[var(--t-warn,#fbbf24)] font-semibold"}>
                      {f.estados ?? "—"}
                    </span>
                  </Td>
                  {/* El tooltip muestra de dónde sale el VN de Aunesa: cuando
                      aparece una diferencia, lo primero que se pregunta es si
                      viene de la garantía. */}
                  <Td className="text-right tabular-nums"
                      title={f.aunesa_garantia
                        ? `cantidad ${num(f.aunesa_cantidad)} − garantía ${num(f.aunesa_garantia)}`
                        : undefined}>
                    {f.vn_aunesa === null
                      ? <span className="text-[var(--t-text-dim)] italic">sin comparar</span>
                      : <>{num(f.vn_aunesa)}{f.aunesa_garantia ? " *" : ""}</>}
                  </Td>
                  <Td className="text-right tabular-nums">{num(f.vn_byma)}</Td>
                  <Td className={`text-right tabular-nums font-semibold ${
                        f.dif === null ? "text-[var(--t-text-dim)]"
                        : rojo ? "text-[var(--t-danger,#f87171)]"
                        : "text-[var(--t-text-dim)]"}`}>
                    {f.dif === null ? "—" : rojo ? num(f.dif) : "✓"}
                  </Td>
                </tr>
              );})}
            </tbody>
          </table>
        )}

        {filtradas.length > RENDER_MAX && (
          <p className="p-3 text-xs text-[var(--t-warn,#fbbf24)]">
            Mostrando {RENDER_MAX} de {filtradas.length.toLocaleString("es-AR")} filas.
            Filtrá por cuenta, ticker o estado para ver el resto.
          </p>
        )}
      </div>
    </div>
  );
}

function Dato({ label, valor, alerta, total, fuerte }: {
  label: string; valor: number; alerta?: boolean; total?: number | null; fuerte?: boolean;
}) {
  return (
    <span className="text-[var(--t-text-dim)]">
      {label}{" "}
      <b className={`${alerta ? "text-[var(--t-danger,#f87171)]" : "text-[var(--t-text)]"}${
        fuerte ? " text-sm" : ""}`}>
        {valor.toLocaleString("es-AR")}
      </b>
      {/* Con filtro puesto, el total sin filtrar evita leer el número como si
          fuera toda la foto. */}
      {total != null && total !== valor && (
        <span className="opacity-60"> / {total.toLocaleString("es-AR")}</span>
      )}
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

function Td({ children, className = "", title }: {
  children: React.ReactNode; className?: string; title?: string;
}) {
  return <td className={`px-2 py-1 ${className}`} title={title}>{children}</td>;
}
