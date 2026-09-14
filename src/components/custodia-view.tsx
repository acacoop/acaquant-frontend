"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";
import { usePoll } from "@/lib/use-poll";
import { MovimientosTab } from "./custodia-movimientos";
import { Chip, Cuenta, ESPACIOS, SubTabs, Td, Th, type SubTab } from "./custodia-ui";

/**
 * Back Office → CUSTODIA. Lo que la CAJA DE VALORES (CVSA) tiene registrado.
 *
 * Dos tabs, dos preguntas distintas:
 *   · **TENENCIAS** — qué hay hoy, y en qué difiere de lo que dice Aunesa.
 *   · **MOVIMIENTOS** — qué se liquidó (`custodia-movimientos.tsx`).
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
  // La identidad COMPLETA: `80074/222222222`. El número solo no alcanza —
  // CVSA usa tres espacios y el lado derecho se repite entre ellos.
  account_number: string;
  participante: string | null;
  espacio: string | null;        // comitentes | liquidadoras | garantias | null
  comitente: boolean;
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
  fuente: string;
  fecha_aunesa: string | null;
  actualizado_aunesa: string | null;
  filas: Fila[];
  total_filas: number;
  cuentas: number;
  sin_asset: number;
  trabado: number;
  difieren: number;
  sin_comparar: number;
  truncado: boolean;
  actualizado_at: string | null;
  espacios: { espacio: string; n: number }[];
  estados: { estado: string; n: number }[];
  aviso?: string;
};

const VACIO: Payload = {
  fecha: null, fuente: "t0", fecha_aunesa: null, actualizado_aunesa: null, filas: [], total_filas: 0, cuentas: 0,
  sin_asset: 0, trabado: 0, difieren: 0, sin_comparar: 0, truncado: false,
  actualizado_at: null, espacios: [], estados: [],
};

// Dos nominales que difieren en centavos no son un descalce: es redondeo.
// Mismo umbral que el backend — si divergen, la lista y el contador dejarían
// de decir lo mismo.
const TOLERANCIA = 0.01;

// Cuántas filas se dibujan. Cada una son 8 celdas, así que 400 eran ~3.200
// elementos redibujándose en CADA tecla del buscador — de ahí el trabón. 150 es
// más de lo que entra en pantalla, y cuando quedan filas afuera la vista lo DICE
// en vez de cortar en silencio.
const RENDER_MAX = 150;

/** `14/09 11:05`. Las dos fuentes se muestran igual: leerlas en formatos
 *  distintos obliga a traducir mentalmente antes de poder compararlas. */
function cuando(fecha: string | null, iso: string | null): string {
  if (!fecha) return "—";
  const [, m, d] = fecha.split("-");
  const dia = `${d}/${m}`;
  if (!iso) return dia;
  const t = new Date(iso);
  return `${dia} ${String(t.getHours()).padStart(2, "0")}:${
    String(t.getMinutes()).padStart(2, "0")}`;
}

function num(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

/** Las dos tabs comparten la barra y no el estado: cada una hace su propio
 *  request, con sus filtros y su cadencia. Un componente que sirviera a las dos
 *  tendría que mezclar dos payloads con nada en común salvo la fuente. */
export function CustodiaView() {
  const [sub, setSub] = useState<SubTab>("tenencias");
  return sub === "tenencias"
    ? <TenenciasTab sub={sub} setSub={setSub} />
    : <MovimientosTab sub={sub} setSub={setSub} />;
}

function TenenciasTab({ sub, setSub }: { sub: SubTab; setSub: (s: SubTab) => void }) {
  const [cuenta, setCuenta] = useState("");
  // El texto tipeado se ve al instante; el filtrado de 2.800 filas y el redibujo
  // de la tabla van DIFERIDOS. Sin esto, cada tecla bloqueaba el input hasta
  // terminar de reconstruir la lista entera.
  const cuentaDiferida = useDeferredValue(cuenta);
  const [estado, setEstado] = useState<string | null>(null);
  const [soloTrabado, setSoloTrabado] = useState(false);
  const [soloSinInstrumento, setSoloSinInstrumento] = useState(false);
  const [soloDiferencias, setSoloDiferencias] = useState(false);
  // Ver SOLO las liquidadoras, o solo las de garantías. Son las cuentas por
  // donde se mueven los títulos y no son comitentes: hasta ahora no se podían
  // aislar porque el espacio de numeración ni siquiera se guardaba.
  const [espacio_, setEspacio] = useState<string | null>(null);
  // Contra qué se compara Aunesa. Es lo ÚNICO que viaja al servidor: los demás
  // filtros se aplican sobre las filas que ya están, pero esto cambia de qué
  // tabla sale `VN AUNESA`.
  const [fuente, setFuente] = useState<"t0" | "cierre">("t0");

  // Un request por la foto entera. 5 min: el dato de fondo cambia UNA VEZ POR
  // HORA (el gateway de BYMA cachea su respuesta 60 min), así que pollear más
  // seguido solo re-baja el mismo payload.
  const { data, error, lastAt } = usePoll<Payload>(
    `/api/back-office/custodia/tenencias?fuente=${fuente}`, VACIO, 300_000,
    { fetchOnMount: true });

  // BYMA actualiza sus tenencias DESPUÉS DE LAS 21. Durante el día su foto es
  // la del cierre anterior, así que comparar contra T0 marca como descalce lo
  // que solo es desfasaje: un bono comprado el viernes en T+1 liquida hoy,
  // Hygirus ya lo muestra y la Caja todavía no.
  //
  // Ese dato vivía en la cabeza del que armó la vista. Puesto acá, cualquiera
  // que abra la pantalla a las 15 entiende por qué hay diferencias en vez de
  // salir a buscar un problema que no existe.
  const desfasaje = useMemo(() => {
    if (fuente !== "t0" || !data.fecha) return false;
    const ahora = new Date();
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${
      String(ahora.getDate()).padStart(2, "0")}`;
    return data.fecha === hoy && ahora.getHours() < 21;
  }, [fuente, data.fecha]);

  // lastAt === 0 es "todavía no hubo ninguna respuesta". Sin esto la pantalla
  // dice «Sin filas» mientras carga — o sea afirma «no hay nada» cuando lo
  // cierto es «no sé todavía», que es la mentira más cara de toda la vista.
  const cargando = lastAt === 0 && !error;

  const filtradas = useMemo(() => {
    const q = cuentaDiferida.trim().toLowerCase();
    return data.filas.filter((f) => {
      if (q && !f.account_number.toLowerCase().includes(q)
            && !(f.cuenta || "").toLowerCase().includes(q)
            && !(f.ticker || "").toLowerCase().includes(q)) return false;
      if (espacio_ && f.espacio !== espacio_) return false;
      if (estado && !(f.estados || "").includes(estado)) return false;
      if (soloTrabado && f.trabado === 0) return false;
      if (soloSinInstrumento && f.unidad !== null) return false;
      // "Solo diferencias" muestra descalces REALES: lo que no se puede
      // comparar (sin instrumento) no es una diferencia, es un dato que falta.
      if (soloDiferencias && !(f.dif !== null && Math.abs(f.dif) > TOLERANCIA)) return false;
      return true;
    });
  }, [data.filas, cuentaDiferida, estado, soloTrabado, soloSinInstrumento,
      soloDiferencias, espacio_]);

  const hayFiltro = Boolean(cuenta.trim() || estado || soloTrabado
                            || soloSinInstrumento || soloDiferencias || espacio_);

  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* FILA 1 — el sub-tab y, a la derecha, de cuándo es cada foto. Todo en la
          misma línea: antes eran cuatro filas de cabecera para una tabla, y el
          encabezado le comía la pantalla a los datos. */}
      <div className="border-b border-[var(--t-border)] px-3 flex items-center gap-3
                      text-xs shrink-0">
        <SubTabs sub={sub} setSub={setSub} />

        <span className="ml-auto text-[var(--t-text-dim)]" title={data.fecha ?? ""}>
          BYMA <b className="text-[var(--t-text)] tabular-nums">
            {cuando(data.fecha, data.actualizado_at)}</b>
        </span>
        <span className="text-[var(--t-text-dim)]" title={data.fecha_aunesa ?? ""}>
          AUNESA <b className="text-[var(--t-text)] tabular-nums">
            {cuando(data.fecha_aunesa, data.actualizado_aunesa)}</b>
        </span>
        {data.fecha && data.fecha_aunesa && data.fecha !== data.fecha_aunesa && (
          <span className="text-[var(--t-warn,#fbbf24)] font-bold"
                title="Las dos fotos son de días distintos: cualquier diferencia puede ser eso.">
            ⚠
          </span>
        )}

        {/* El aviso del desfasaje, sin cartel: el botón T0 se pone ámbar y el
            tooltip lo explica. Ocupa cero espacio y solo aparece cuando aplica. */}
        <div className="flex rounded overflow-hidden border border-[var(--t-border)]">
          <button onClick={() => setFuente("t0")}
            title={desfasaje
              ? "BYMA actualiza después de las 21: ahora su foto es la del cierre anterior. Para comparar con el día en curso, usá CIERRE T-1."
              : "Liquidada a HOY. La correcta para la conciliación nocturna."}
            className={`px-2 py-0.5 text-[10px] font-semibold ${
              fuente === "t0"
                ? desfasaje
                  ? "bg-[var(--t-warn,#fbbf24)] text-black"
                  : "bg-[var(--t-accent)] text-[var(--t-bg)]"
                : "text-[var(--t-text-dim)]"}`}>
            T0{desfasaje && fuente === "t0" ? " ⏱" : ""}
          </button>
          <button onClick={() => setFuente("cierre")}
            title="La foto conciliada. Comparable con BYMA durante el día."
            className={`px-2 py-0.5 text-[10px] font-semibold ${
              fuente === "cierre"
                ? "bg-[var(--t-accent)] text-[var(--t-bg)]"
                : "text-[var(--t-text-dim)]"}`}>
            CIERRE T-1
          </button>
        </div>
      </div>

      {/* FILA 2 — los chips YA llevan su número, así que los contadores de texto
          que había arriba eran el mismo dato escrito dos veces. */}
      <div className="px-3 py-1.5 flex flex-wrap items-center gap-1 shrink-0 text-xs
                      border-b border-[var(--t-border)]">
        <Chip activo={!hayFiltro} onClick={() => {
          setEstado(null); setSoloTrabado(false); setSoloSinInstrumento(false);
          setSoloDiferencias(false); setCuenta(""); setEspacio(null);
        }}>TODOS ({data.total_filas})</Chip>
        {/* Los espacios de numeración salen de los DATOS, no de una lista fija:
            si CVSA agrega uno, aparece acá en vez de quedar invisible. */}
        {data.espacios.filter((e) => e.espacio !== "comitentes").map((e) => (
          <Chip key={e.espacio} activo={espacio_ === e.espacio}
                alerta={e.espacio === "desconocido"}
                onClick={() => setEspacio(espacio_ === e.espacio ? null : e.espacio)}>
            {(ESPACIOS[e.espacio] ?? e.espacio.toUpperCase())} ({e.n})
          </Chip>
        ))}
        <Chip activo={soloDiferencias} alerta={data.difieren > 0}
              onClick={() => setSoloDiferencias(!soloDiferencias)}>
          DIFERENCIAS ({data.difieren})
        </Chip>
        <Chip activo={soloTrabado}
              onClick={() => { setSoloTrabado(!soloTrabado); setEstado(null); }}>
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
        <input
          value={cuenta}
          onChange={(e) => setCuenta(e.target.value)}
          placeholder="cuenta o ticker"
          className="ml-auto px-2 py-0.5 rounded bg-[var(--t-panel)] border
                     border-[var(--t-border)] text-[var(--t-text)] w-36"
        />
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
              {filtradas.slice(0, RENDER_MAX).map((f, i) => (
                <FilaTabla key={`${f.account_number}-${f.cvsa_id}-${i}`} f={f} />
              ))}
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

/** Una fila. MEMOIZADA: al cambiar un filtro React vuelve a correr el map, pero
 *  solo redibuja las filas cuyo dato cambió, no las 150. */
const FilaTabla = memo(function FilaTabla({ f }: { f: Fila }) {
  const rojo = f.dif !== null && Math.abs(f.dif) > TOLERANCIA;
  return (
    <tr className={`border-t border-[var(--t-border)] ${
      rojo ? "bg-[var(--t-danger,#f87171)]/10" : ""}`}>
      <Td>
        <Cuenta account={f.account_number} espacio={f.espacio}
                denominacion={f.cuenta} comitente={f.comitente} />
      </Td>
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
      {/* El tooltip muestra de dónde sale el VN de Aunesa: cuando aparece una
          diferencia, lo primero que se pregunta es si viene de la garantía. */}
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
  );
});
