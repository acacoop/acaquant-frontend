"use client";

import { useEffect, useMemo, useState } from "react";

import { MultiSelect } from "@/components/ui/multi-select";
import { AltaCuentasView } from "./alta-cuentas-view";
import { CuantitativoView } from "./cuantitativo-view";
import { fetchJson } from "@/lib/fetch-json";
import { usePersistedState } from "@/lib/use-persisted-state";
import { exportToXlsx, timestampSuffix } from "@/lib/xlsx-export";

// Tab PROFUNDIDAD DE CLIENTES (dentro de OPERADORES).
//
// Una fila por MES. Contesta "cuánta base tengo, cuánta está viva y cuánto deja"
// a lo largo del ejercicio. Tres cosas la separan del resto de la vista:
//
//  1. **NO usa el Desde/Hasta de la barra** — su eje ES el tiempo, así que un corte
//     por fecha la vaciaría. La barra esconde ese control mientras esta tab está
//     activa (si se viera y no hiciera nada, parecería rota).
//  2. **Sí hereda los filtros madre** (el pedido: "lo que el usuario elija en
//     NIVEL 3 figura acá"). Se dibujan como chips arriba de la tabla para que no
//     haya que subir a la barra a ver contra qué scope está leyendo el número.
//  3. **Ancho completo**, sin paneles laterales.
//
// El navegador NO deriva NADA: los ratios, los labels (`jul-25`) y los totales
// vienen del backend, de la misma query que dibuja la fila. Cada celda se abre y
// muestra las cuentas que la componen — mismo patrón que el modal de DÍAS SIN
// OPERAR y que el detalle por celda de Tesorería.

type Gran = "mes" | "trimestre";
type Fila = {
  mes: string; label: string; ini: string; fin: string; en_curso: boolean;
  clientes: number;
  altas: number;
  con_aum: number | null;
  sin_aum: number | null;
  activos: number;
  ratio_actividad: number | null;
  aranceles: number | null;
  arancel_por_activo: number | null;
  aum: number | null;
  aum_snapshot: string | null;
  aum_desfasaje_dias: number | null;
  mep_aranceles: number | null;
  mep_aum: number | null;
  fuera_universo: { activos: number; aranceles: number };
};
// Encabezados YA ESCRITOS por el backend. Con el filtro puesto, RATIO deja de ser
// "actividad" y pasa a ser penetración del producto — ese texto NO se arma acá.
type Columnas = {
  activos: string; ratio_actividad: string; aranceles: string;
  arancel_por_activo: string; sufijo: string | null;
};
type OpcionOp = { valor: string; label: string; n_boletos: number };
type Resp = {
  moneda: string; desde: string; hasta: string; filas: Fila[];
  granularidad: Gran; total_altas: number;
  operacion: string[];
  operaciones_disponibles: OpcionOp[];
  columnas: Columnas;
  columnas_filtradas: Metrica[];
  meta: { sin_alta: number; advertencias: string[]; fuentes: Record<string, string> };
};

type ItemDetalle = {
  id_cuenta: string; denominacion: string; operador_nombre: string | null;
  nivel_1: string | null; nivel_3: string | null; fecha_alta_legajo: string | null;
  aum: number | null; n_boletos: number; arancel: number | null;
  ultima_op: string | null; activo: boolean;
};
type Detalle = {
  mes: string; label: string; ini: string; fin: string;
  metrica: Metrica; titulo: string; moneda: string;
  operacion: string[]; operacion_label: string | null;
  mep_aranceles: number | null; mep_aum: number | null;
  snapshot_aum: string | null; desfasaje_dias: number | null;
  ecuacion: string;
  totales: Record<string, number | null>;
  n_total: number; limite: number; items: ItemDetalle[];
};

type Metrica =
  | "clientes" | "altas" | "con_aum" | "sin_aum" | "activos"
  | "ratio_actividad" | "aranceles" | "arancel_por_activo" | "aum";

// Definición ÚNICA de las columnas: el header, de qué campo sale, cómo se formatea
// y qué métrica audita. La tabla y el export se generan de acá, así que no pueden
// mostrar cosas distintas.
type Col = {
  k: Metrica;
  label: string;          // el default; con filtro puesto lo pisa `columnas` del backend
  ayuda: string;
  tipo: "int" | "pct" | "money";
};

// Los encabezados son FIJOS. Meter la operación adentro del título los estiraba a
// "ARANCELES DE CAUCIÓN COLOCADORA + CAUCIÓN COLOCADORA CIERRE" y desarmaba la
// tabla. El texto largo que manda el backend (`columnas`) pasa al TOOLTIP; que la
// columna esté acotada se avisa con el color y con el chip de la barra, que no
// ocupan ancho.
function ayudaDe(c: Col, columnas: Columnas | undefined, acotada: boolean): string {
  const largo = columnas?.[c.k as keyof Columnas];
  if (acotada && typeof largo === "string") return `${largo}.\n${c.ayuda}`;
  return c.ayuda;
}
const COLS: Col[] = [
  { k: "clientes", label: "Clientes", tipo: "int",
    ayuda: "Cuentas activas con legajo dado de alta al último día del período. Es el STOCK acumulado." },
  { k: "altas", label: "Altas", tipo: "int",
    ayuda: "Cuentas dadas de alta DENTRO del período (fecha de alta del legajo). Es el FLUJO: "
      + "las de períodos anteriores ya están contadas en CLIENTES, no acá." },
  { k: "con_aum", label: "Con AuM", tipo: "int",
    ayuda: "Cuentas con valuación > 0 en la foto de tenencia del último día del mes." },
  { k: "sin_aum", label: "Sin AuM", tipo: "int",
    ayuda: "Clientes − cuentas con AuM." },
  { k: "activos", label: "Activos", tipo: "int",
    ayuda: "Cuentas con al menos una operación entre el 1º y el último día del mes." },
  { k: "ratio_actividad", label: "Ratio activ.", tipo: "pct",
    ayuda: "Activos / clientes." },
  { k: "aranceles", label: "Aranceles", tipo: "money",
    ayuda: "Suma de aranceles de los boletos del mes (incluye el cierre de caución)." },
  { k: "arancel_por_activo", label: "Aranc. / activo", tipo: "money",
    ayuda: "Aranceles del mes / cuentas activas del mes." },
  { k: "aum", label: "AuM", tipo: "money",
    ayuda: "Suma del AuM de todos los clientes en la foto del último día del mes." },
];

const fmtInt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("es-AR");
// Plata en ESTA vista: número ENTERO y COMPLETO ($1.234.567), sin "1,2 M" y sin
// decimales (pedido explícito). El compacto de `fmtMoney` sirve en pantallas
// donde el monto es contexto; acá el monto ES el dato y la tabla se compara
// contra un Excel — "$1,2 M" no se puede cotejar contra nada.
// Ojo con el 0: `fmtMoney` devuelve "—" para cero, y en esta tabla "—" está
// reservado para "no pude mirar" (sin foto de tenencia). Un mes con cero
// aranceles es un HECHO, así que muestra "$0".
const fmtPesos = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("es-AR")}`;
const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${(n * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
const fmtFecha = (iso: string | null | undefined) =>
  !iso ? "—" : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function valorCelda(f: Fila, c: Col): number | null {
  return f[c.k] as number | null;
}
function textoCelda(f: Fila, c: Col): string {
  const v = valorCelda(f, c);
  if (v == null) return "—";
  return c.tipo === "int" ? fmtInt(v) : c.tipo === "pct" ? fmtPct(v) : fmtPesos(v);
}
function tituloCelda(f: Fila, c: Col): string {
  // El monto ya se muestra entero en la celda, así que el tooltip NO lo repite:
  // queda para la definición de la columna y para decir que se puede auditar.
  const v = valorCelda(f, c);
  const extra = c.tipo === "pct" && v != null ? ` (${fmtPct(v)})` : "";
  return `${c.label} · ${f.label}${extra}\n${c.ayuda}${v == null ? "" : "\nClick para ver las cuentas."}`;
}

// Chips de los filtros madre activos. El pedido fue explícito con NIVEL 3, pero se
// muestran TODOS los que estén puestos: contar solo uno mientras el backend cruza
// ocho haría que la tabla diga menos de lo que hace.
function chipsDeFiltros(f: Filtros): { label: string; vals: string[] }[] {
  const out: { label: string; vals: string[] }[] = [];
  const push = (label: string, vals: string[]) => { if (vals?.length) out.push({ label, vals }); };
  push("Operador", f.operador);
  push("Nivel 1", f.nivel1);
  push("Nivel 2", f.nivel2);
  push("Nivel 3", f.nivel3);
  push("Nivel 4", f.nivel4);
  push("Nivel 5", f.nivel5);
  push("Referido", f.referido);
  push("División", f.division);
  return out;
}

export type Filtros = {
  operador: string[]; nivel1: string[]; nivel2: string[]; nivel3: string[];
  nivel4: string[]; nivel5: string[]; referido: string[]; division: string[];
};

const arrQS = (key: string, vals: string[]) =>
  (vals ?? []).map((v) => `&${key}=${encodeURIComponent(v)}`).join("");
function filtrosQS(f: Filtros): string {
  return arrQS("operador", f.operador) + arrQS("nivel_1", f.nivel1)
    + arrQS("nivel_2", f.nivel2) + arrQS("nivel_3", f.nivel3)
    + arrQS("nivel_4", f.nivel4) + arrQS("nivel_5", f.nivel5)
    + arrQS("referido", f.referido) + arrQS("division", f.division);
}

// PROFUNDIDAD DE CLIENTES tiene TRES solapas adentro:
//
//   POR MES               la tabla del ejercicio en curso (default)
//   ALTA DE CUENTAS       el histórico COMPLETO de altas (gráfico + tabla)
//   ANÁLISIS CUANTITATIVO las tres listas de llamadas por cliente
//
// ALTA DE CUENTAS va aparte y no como columna de POR MES —que también tiene ALTAS—
// porque contestan preguntas distintas y con distinto rango: POR MES arranca en el
// ejercicio en curso ("cómo viene el año") y ésta en la PRIMERA alta que existe
// ("cómo se construyó la base"). Mezclarlas obligaría a que una de las dos mienta
// sobre su propio rango.
//
// El conmutador es un segmentado FINO —no la sub-nav grande del agente— porque la
// tabla mensual es la vista principal y no puede pagar dos bandas de navegación.
// La sub-nav grande vive UNA sola vez, adentro de Análisis Cuantitativo, donde sus
// tres solapas sí necesitan contador y bajada.
export function ProfundidadClientesView(
  { moneda = "ARS", ...filtros }: { moneda?: "ARS" | "USD" } & Filtros,
) {
  const [vista, setVista] = usePersistedState<"mes" | "altas" | "cuantitativo">(
    "profundidad.vista", "mes");
  const conmutador = (
    <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)] shrink-0">
      {([["mes", "Por mes"], ["altas", "Alta de Cuentas"],
         ["cuantitativo", "Análisis Cuantitativo"]] as const).map(([v, t]) => (
        <button key={v} onClick={() => setVista(v)}
          className={"px-3 py-1 text-[11px] font-semibold tracking-wide " +
            (vista === v
              ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
              : "bg-transparent text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>
          {t}
        </button>
      ))}
    </div>
  );
  // En Cuantitativo el conmutador viaja ADENTRO de la fila de la sub-nav: una
  // barra propia sería una banda entera de alto para dos botones.
  if (vista === "cuantitativo") {
    return <CuantitativoView moneda={moneda} conmutador={conmutador} {...filtros} />;
  }
  if (vista === "altas") {
    // No recibe `moneda`: acá no hay plata, se cuentan cuentas.
    return <AltaCuentasView conmutador={conmutador} {...filtros} />;
  }
  return <PorMes moneda={moneda} conmutador={conmutador} {...filtros} />;
}

function PorMes(
  { moneda = "ARS", conmutador, ...filtros }:
  { moneda?: "ARS" | "USD"; conmutador: React.ReactNode } & Filtros,
) {
  const f: Filtros = filtros;
  // El filtro de OPERACIÓN vive en ESTA vista, no en la barra madre: solo acota
  // esta tabla, y en la barra parecería que aplica a las otras solapas.
  const [operacion, setOperacion] = usePersistedState<string[]>("profundidad.operacion", []);
  // MES o TRIMESTRE. Se persiste como el resto de las elecciones de la vista.
  const [gran, setGran] = usePersistedState<Gran>("profundidad.granularidad", "mes");
  const qs = filtrosQS(f) + arrQS("operacion", operacion);
  const url = `/api/operaciones/comercial/profundidad?moneda=${moneda}&granularidad=${gran}${qs}`;
  // La respuesta viaja JUNTO con la url que la produjo. Así "estoy cargando" se
  // DERIVA (`res.url !== url`) en vez de ser un tercer estado que hay que
  // resetear a mano en el efecto: un `setLoading(true)` sincrónico encadena
  // renders y, si alguna rama se olvida de apagarlo, la vista queda en "cargando"
  // para siempre mostrando datos viejos.
  const [res, setRes] = useState<{ url: string; d: Resp | null; err: string | null } | null>(null);
  const [celda, setCelda] = useState<{ mes: string; metrica: Metrica } | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetchJson<Resp>(url);
        if (vivo) setRes({ url, d: r, err: null });
      } catch (e) {
        if (vivo) setRes({ url, d: null, err: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => { vivo = false; };
  }, [url]);

  const fresco = res?.url === url ? res : null;
  const d = fresco?.d ?? null;
  const err = fresco?.err ?? null;
  const loading = fresco === null;

  const chips = useMemo(() => chipsDeFiltros(f), [qs]);   // eslint-disable-line react-hooks/exhaustive-deps
  const filas = d?.filas ?? [];
  // Qué columnas acota el filtro lo DECIDE el backend (`columnas_filtradas`): acá
  // solo se usa para apagar las otras. Si la lista se escribiera de este lado,
  // podría contradecir lo que el backend efectivamente filtró.
  const hayFiltro = (d?.operacion?.length ?? 0) > 0;
  const filtradas = useMemo(() => new Set(d?.columnas_filtradas ?? []), [d?.columnas_filtradas]);

  const exportar = () => void exportToXlsx({
    filename: `profundidad-clientes-${timestampSuffix()}.xlsx`,
    sheets: [{
      name: "Profundidad",
      // El título deja constancia del scope: una planilla exportada con un filtro
      // puesto y sin decirlo es indistinguible de una sin filtrar.
      title: `Moneda ${d?.moneda ?? moneda}`
        + (d?.columnas?.sufijo ? ` · Operación: ${d.columnas.sufijo}` : "")
        + (chips.length ? ` · ${chips.map((c) => `${c.label}: ${c.vals.join(", ")}`).join(" · ")}` : " · sin filtros de cliente"),
      rows: filas.map((r) => ({
        mes: r.label, fin: r.fin, clientes: r.clientes, con_aum: r.con_aum,
        sin_aum: r.sin_aum, activos: r.activos,
        // El Excel se lee con formato de %, así que el ratio va en escala 0-100.
        ratio: r.ratio_actividad == null ? null : r.ratio_actividad * 100,
        aranceles: r.aranceles, arancel_por_activo: r.arancel_por_activo,
        aum: r.aum, aum_snapshot: r.aum_snapshot,
      })),
      columns: [
        { header: "Mes", key: "mes", format: "text", width: 10 },
        { header: "Último día", key: "fin", format: "date", width: 12 },
        { header: "Clientes", key: "clientes", format: "integer" },
        { header: "Altas", key: "altas", format: "integer" },
        { header: "Con AuM", key: "con_aum", format: "integer" },
        { header: "Sin AuM", key: "sin_aum", format: "integer" },
        { header: "Activos", key: "activos", format: "integer" },
        { header: "Ratio activ.", key: "ratio", format: "percent" },
        { header: "Aranceles", key: "aranceles", format: "currency", width: 18 },
        { header: "Aranc. / activo", key: "arancel_por_activo", format: "currency", width: 16 },
        { header: "AuM", key: "aum", format: "currency", width: 20 },
        { header: "Foto AuM", key: "aum_snapshot", format: "date", width: 12 },
      ],
    }],
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">

      {/* ── Cabecera: qué se está mirando y contra qué scope ───────────────── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--t-border)] shrink-0 flex-wrap">
        {conmutador}
        <span className="text-[9px] text-[var(--t-text-muted)]">
          {d ? `${d.desde} → ${d.hasta}` : "…"} · todo medido al ÚLTIMO día de cada mes · {d?.moneda ?? moneda}
        </span>

        {/* Filtros madre activos. Sin filtros lo dice explícito: "sin filtro" y
            "no cargó" no se pueden ver igual. */}
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] ml-2">Filtros</span>
        {chips.length === 0 ? (
          <span className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-dim)]">
            toda la mesa
          </span>
        ) : chips.map((c) => (
          <span key={c.label}
            title={`${c.label}: ${c.vals.join(", ")}`}
            className="text-[9px] px-1.5 py-0.5 border border-[var(--t-accent)] bg-[var(--t-accent)]/10 text-[var(--t-text)] max-w-[260px] truncate">
            <span className="text-[var(--t-text-muted)] uppercase tracking-wide">{c.label}:</span>{" "}
            {c.vals.join(", ")}
          </span>
        ))}

        {/* El filtro de OPERACIÓN acota SOLO lo que se operó (activos/ratio/aranceles).
            Las opciones las manda el backend leyéndolas de la base — nunca van
            escritas acá, así un valor nuevo aparece solo. */}
        {operacion.length > 0 && (
          <span title="El filtro de operación NO toca clientes, con AuM, sin AuM ni AuM: esas columnas son la base entera."
            className="text-[9px] px-1.5 py-0.5 border border-[var(--t-accent)] bg-[var(--t-accent)]/10 text-[var(--t-text)]">
            <span className="text-[var(--t-text-muted)] uppercase tracking-wide">Operación:</span>{" "}
            {(d?.operaciones_disponibles ?? [])
              .filter((o) => operacion.includes(o.valor))
              .map((o) => o.label).join(", ") || operacion.join(", ")}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex items-stretch border border-[var(--t-border-2)] divide-x divide-[var(--t-border-2)]">
            {([["mes", "Mes"], ["trimestre", "Trimestre"]] as const).map(([v, t]) => (
              <button key={v} onClick={() => setGran(v)}
                title={v === "trimestre"
                  ? "Una fila por trimestre. Los extremos se anclan al trimestre completo."
                  : "Una fila por mes."}
                className={"px-2 py-0.5 text-[10px] uppercase tracking-wider " +
                  (gran === v ? "bg-[var(--t-accent)] text-[var(--t-on-accent)]"
                    : "bg-[var(--t-panel)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)]")}>
                {t}
              </button>
            ))}
          </div>
          <MultiSelect label="Operación" selected={operacion} onChange={setOperacion}
            options={(d?.operaciones_disponibles ?? []).map((o) => ({
              value: o.valor, label: o.label, n: o.n_boletos }))}
            width="max-w-[200px]" />
          {loading && <span className="text-[9px] text-[var(--t-text-muted)]">cargando…</span>}
          {err && <span className="text-[9px] text-[#ff7777]">{err}</span>}
          <button onClick={exportar} disabled={!filas.length}
            className="text-[10px] px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-dim)] hover:text-[var(--t-accent)] disabled:opacity-40">
            ↓ XLSX
          </button>
        </div>
      </div>

      {/* ── Tabla: 100% del ancho ──────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-[12px]">
          <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)] z-10">
            <tr className="border-b border-[var(--t-border-2)]">
              <th className="px-3 py-2 text-left font-normal w-[12%]">
                {gran === "trimestre" ? "Trimestre" : "Mes"}
              </th>
              {COLS.map((c) => {
                // Con filtro puesto, la columna que NO acota se dibuja apagada: si
                // se vieran todas iguales, un 5% al lado de un 1.408 parece que se
                // derrumbó el negocio en vez de "5% de la base usa este producto".
                const acota = hayFiltro && filtradas.has(c.k);
                const base = hayFiltro && !filtradas.has(c.k);
                return (
                  <th key={c.k}
                    title={ayudaDe(c, d?.columnas, acota)
                      + (base ? "\nEl filtro de operación NO toca esta columna: es la base entera." : "")}
                    className={"px-3 py-2 text-right font-normal whitespace-nowrap " +
                      (acota ? "text-[var(--t-accent)] " : "") +
                      (base ? "opacity-50 " : "")}>
                    {c.label}
                    {/* Punto en la columna acotada: dice "esto está filtrado" sin
                        agregarle un solo carácter de ancho al encabezado. */}
                    {acota && <span className="ml-1 text-[var(--t-accent)]" aria-hidden="true">•</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.mes} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                <td className="px-3 py-1.5 whitespace-nowrap"
                  title={`${r.ini} → ${r.fin}`}>
                  <span className="font-semibold">{r.label}</span>
                  <span className="ml-1.5 text-[9px] text-[var(--t-text-muted)]">
                    al {fmtFecha(r.fin)}
                  </span>
                  {r.en_curso && (
                    <span className="ml-1.5 text-[8px] px-1 border border-[var(--t-accent)] text-[var(--t-accent)] uppercase tracking-wide"
                      title="El mes todavía no terminó: los aranceles y la actividad son parciales.">
                      en curso
                    </span>
                  )}
                </td>
                {COLS.map((c) => {
                  const v = valorCelda(r, c);
                  const auditable = v != null;
                  // La foto de AuM puede no caer justo en el último día del mes
                  // (no hubo snapshot). Se marca en la celda en vez de dibujar el
                  // número como si fuera del 31.
                  const desfasada = (c.k === "aum" || c.k === "con_aum" || c.k === "sin_aum")
                    && !!r.aum_desfasaje_dias;
                  return (
                    <td key={c.k}
                      onClick={auditable ? () => setCelda({ mes: r.mes, metrica: c.k }) : undefined}
                      title={tituloCelda(r, c)
                        + (desfasada ? `\nFoto de tenencia del ${fmtFecha(r.aum_snapshot)} (${r.aum_desfasaje_dias} días antes del cierre de mes).` : "")}
                      className={
                        "px-3 py-1.5 text-right tabular-nums " +
                        (hayFiltro && !filtradas.has(c.k) ? "text-[var(--t-text-dim)] " : "") +
                        (auditable
                          ? "cursor-pointer hover:bg-[var(--t-accent)]/15 hover:text-[var(--t-accent)]"
                          : "text-[var(--t-text-muted)]")
                      }>
                      {textoCelda(r, c)}
                      {desfasada && <span className="ml-1 text-[9px] text-[var(--t-text-muted)]">*</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!filas.length && (
              <tr><td colSpan={COLS.length + 1} className="px-3 py-6 text-center text-[var(--t-text-muted)] text-[11px]">
                {loading ? "cargando…" : err ? "no se pudo leer la tabla" : "sin meses para mostrar"}
              </td></tr>
            )}
          </tbody>
          {/* TOTAL: solo lo que se PUEDE sumar a lo largo del tiempo.
              · ALTAS y ARANCELES son flujos → suman.
              · CLIENTES y AuM son stocks (la misma cuenta está en todas las filas)
                y ACTIVOS doble-cuenta a quien operó en más de un período.
              Sumarlos igual daría un número grande, plausible y falso — así que
              esas celdas van en "—" con el motivo en el tooltip. */}
          {!!filas.length && d && (
            <tfoot className="sticky bottom-0 bg-[var(--t-surface)]">
              <tr className="border-t-2 border-[var(--t-border-2)] font-semibold">
                <td className="px-3 py-1.5 whitespace-nowrap">
                  TOTAL
                  <span className="ml-1.5 text-[9px] font-normal text-[var(--t-text-muted)]">
                    {filas.length} {gran === "trimestre" ? "trim." : "meses"}
                  </span>
                </td>
                {COLS.map((c) => {
                  const sumable = c.k === "altas" || c.k === "aranceles";
                  const total = c.k === "altas"
                    ? d.total_altas
                    : filas.reduce((a, r) => a + (r.aranceles ?? 0), 0);
                  return (
                    <td key={c.k}
                      title={sumable ? undefined
                        : (c.k === "activos"
                          ? "No se suma: una cuenta que operó en varios períodos se contaría más de una vez."
                          : "No se suma: es un stock, la misma cuenta está en todas las filas.")}
                      className={"px-3 py-1.5 text-right tabular-nums " +
                        (sumable ? "text-[var(--t-text)]" : "text-[var(--t-text-muted)]")}>
                      {sumable
                        ? (c.k === "altas" ? fmtInt(total) : fmtPesos(total))
                        : "—"}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* ── Pie: lo que el número NO dice ──────────────────────────────────── */}
      {d && (
        <div className="px-3 py-1.5 border-t border-[var(--t-border-2)] bg-[var(--t-surface)] text-[9px] text-[var(--t-text-muted)] shrink-0 space-y-0.5">
          <div>Click en cualquier celda → las cuentas que la componen.</div>
          {d.meta.advertencias.map((a) => <div key={a}>⚠ {a}</div>)}
        </div>
      )}

      {/* `qs` ya lleva la operación: el modal filtra IGUAL que la tabla o abrirías
          una celda de 47 y saldrían 389 cuentas. Va en la `key` para que cambiar el
          filtro con el modal abierto lo remonte en vez de dejar datos viejos. */}
      {celda && (
        <ModalCelda key={`${celda.mes}|${celda.metrica}|${gran}|${qs}`} mes={celda.mes} metrica={celda.metrica} gran={gran}
          moneda={moneda} qs={qs} onCerrar={() => setCelda(null)} />
      )}
    </div>
  );
}

// ── Modal de auditoría de UNA celda ──────────────────────────────────────────
// No recalcula nada: pide al backend las cuentas de esa celda con los MISMOS
// predicados y el MISMO snapshot que la tabla, y muestra los totales que él
// devuelve — calculados sobre TODAS las cuentas, antes del límite de la lista.
function ModalCelda(
  { mes, metrica, moneda, qs, gran, onCerrar }:
  { mes: string; metrica: Metrica; moneda: string; qs: string; gran: Gran;
    onCerrar: () => void },
) {
  const [d, setD] = useState<Detalle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetchJson<Detalle>(
          `/api/operaciones/comercial/profundidad/detalle?mes=${mes}&metrica=${metrica}`
          + `&moneda=${moneda}&granularidad=${gran}${qs}`);
        if (vivo) setD(r);
      } catch (e) {
        if (vivo) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { vivo = false; };
    // `gran` va en las deps y en la `key`: el modal tiene que abrir el MISMO
    // período que la fila. Con la tabla en trimestral y el modal en mensual
    // mostraría un tercio de las cuentas y el total no cerraría contra la celda.
  }, [mes, metrica, moneda, qs, gran]);

  // Buscador local sobre lo que YA vino (no re-pide: filtrar en el server cambiaría
  // los totales y el modal dejaría de cuadrar con la tabla).
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !d) return d?.items ?? [];
    return d.items.filter((i) =>
      i.id_cuenta.toLowerCase().includes(s) || i.denominacion.toLowerCase().includes(s));
  }, [d, q]);

  const exportar = () => d && void exportToXlsx({
    filename: `profundidad-${d.metrica}-${d.mes}-${timestampSuffix()}.xlsx`,
    sheets: [{
      name: "Detalle",
      title: `${d.titulo} · ${d.label} · ${d.ecuacion}`,
      rows: d.items,
      columns: [
        { header: "Cuenta", key: "id_cuenta", format: "text", width: 12 },
        { header: "Cliente", key: "denominacion", format: "text", width: 34 },
        { header: "Operador", key: "operador_nombre", format: "text", width: 22 },
        { header: "Nivel 1", key: "nivel_1", format: "text", width: 16 },
        { header: "Nivel 3", key: "nivel_3", format: "text", width: 20 },
        { header: "Alta legajo", key: "fecha_alta_legajo", format: "date", width: 12 },
        { header: "AuM", key: "aum", format: "currency", width: 18 },
        { header: "Boletos", key: "n_boletos", format: "integer" },
        { header: "Arancel", key: "arancel", format: "currency", width: 16 },
        { header: "Última op", key: "ultima_op", format: "date", width: 12 },
      ],
    }],
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCerrar}>
      <div className="w-full max-w-[1500px] max-h-[86vh] flex flex-col bg-[var(--t-panel)] border border-[var(--t-border-2)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>

        <div className="px-3 py-2 bg-[#094293] text-white flex items-center gap-2 shrink-0">
          <span className="flex-1 text-[11px] uppercase tracking-widest font-semibold truncate">
            {d ? `${d.titulo} · ${d.label}` : "cargando…"}
            {/* Un modal filtrado y uno sin filtrar NO se pueden ver igual. */}
            {d?.operacion_label && (
              <span className="ml-2 normal-case tracking-normal font-normal opacity-90">
                · solo {d.operacion_label.toLowerCase()}
              </span>
            )}
          </span>
          <button onClick={exportar} disabled={!d?.items?.length}
            className="text-[10px] px-2 py-0.5 border border-white/40 hover:bg-white/10 disabled:opacity-40">
            ↓ XLSX
          </button>
          <button onClick={onCerrar} className="text-[12px] px-2 hover:opacity-70">✕</button>
        </div>

        {/* La cuenta del número, explícita — el modal existe para contestar
            "¿de dónde sale esto?", no para mostrar otra tabla. */}
        <div className="px-3 py-2 border-b border-[var(--t-border)] shrink-0 flex items-center gap-5 flex-wrap">
          {d && <>
            <Dato label="Período" value={`${fmtFecha(d.ini)} → ${fmtFecha(d.fin)}`} />
            <Dato label="Clientes" value={fmtInt(d.totales.clientes)} />
            <Dato label="Con AuM" value={fmtInt(d.totales.con_aum)} />
            <Dato label="Activos" value={fmtInt(d.totales.activos)} />
            <Dato label="Ratio activ." value={fmtPct(d.totales.ratio_actividad)} />
            <Dato label={`Aranceles (${d.moneda})`} value={fmtPesos(d.totales.aranceles)} />
            <Dato label={`AuM (${d.moneda})`} value={fmtPesos(d.totales.aum)} />
            <span className="ml-auto text-[10px] font-mono text-[var(--t-text-dim)] max-w-[46%] text-right">
              {d.ecuacion}
            </span>
          </>}
          {err && <span className="text-[10px] text-[#ff7777]">{err}</span>}
        </div>

        <div className="px-3 py-1 border-b border-[var(--t-border)] shrink-0 flex items-center gap-3 text-[9px] text-[var(--t-text-muted)]">
          <span>
            Foto de AuM: {fmtFecha(d?.snapshot_aum)}
            {!!d?.desfasaje_dias && ` (${d.desfasaje_dias} días antes del cierre de mes)`}
          </span>
          {d?.mep_aum != null && <span>· MEP AuM {d.mep_aum.toLocaleString("es-AR")}</span>}
          {d?.mep_aranceles != null && <span>· MEP aranceles {d.mep_aranceles.toLocaleString("es-AR")}</span>}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar cuenta / cliente…"
            className="ml-auto bg-transparent border border-[var(--t-border-2)] px-2 py-0.5 text-[10px] outline-none focus:border-[var(--t-accent)]" />
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full table-fixed text-[11px]">
            <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
              <tr className="border-b border-[var(--t-border)]">
                <th className="px-2 py-1.5 text-left font-normal w-[7%]">Cuenta</th>
                <th className="px-2 py-1.5 text-left font-normal w-[19%]">Cliente</th>
                <th className="px-2 py-1.5 text-left font-normal w-[12%]">Operador</th>
                <th className="px-2 py-1.5 text-left font-normal w-[9%]">Nivel 1</th>
                <th className="px-2 py-1.5 text-left font-normal w-[10%]">Nivel 3</th>
                <th className="px-2 py-1.5 text-left font-normal w-[7%]">Alta</th>
                {/* AuM y Arancel se llevan el ancho: van completos, sin abreviar. */}
                <th className="px-2 py-1.5 text-right font-normal w-[14%]">AuM</th>
                <th className="px-2 py-1.5 text-right font-normal w-[4%]">Bol.</th>
                <th className="px-2 py-1.5 text-right font-normal w-[11%]">Arancel</th>
                <th className="px-2 py-1.5 text-left font-normal w-[7%]">Última op</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id_cuenta} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                  <td className="px-2 py-1 font-mono align-top">{i.id_cuenta}</td>
                  {/* `whitespace-normal`: globals.css pone `td { white-space: nowrap }`
                      y las denominaciones largas se montan sobre la columna siguiente. */}
                  <td className="px-2 py-1 whitespace-normal break-words align-top" title={i.denominacion}>
                    {i.denominacion}
                  </td>
                  <td className="px-2 py-1 whitespace-normal break-words text-[var(--t-text-dim)] align-top">
                    {i.operador_nombre || "—"}
                  </td>
                  <td className="px-2 py-1 whitespace-normal break-words text-[var(--t-text-dim)] align-top">{i.nivel_1 || "—"}</td>
                  <td className="px-2 py-1 whitespace-normal break-words text-[var(--t-text-dim)] align-top">{i.nivel_3 || "—"}</td>
                  <td className="px-2 py-1 tabular-nums align-top">{fmtFecha(i.fecha_alta_legajo)}</td>
                  <td className="px-2 py-1 text-right tabular-nums align-top">{fmtPesos(i.aum)}</td>
                  <td className="px-2 py-1 text-right tabular-nums align-top">{i.n_boletos || "—"}</td>
                  <td className="px-2 py-1 text-right tabular-nums align-top">{fmtPesos(i.arancel)}</td>
                  <td className="px-2 py-1 tabular-nums align-top">{fmtFecha(i.ultima_op)}</td>
                </tr>
              ))}
              {!items.length && (
                <tr><td colSpan={10} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                  {d ? "ninguna cuenta compone esta celda" : err ? "" : "cargando…"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {d && (
          <div className="px-3 py-1.5 border-t border-[var(--t-border-2)] bg-[var(--t-surface)] text-[9px] text-[var(--t-text-muted)] flex items-center gap-3 shrink-0">
            <span>
              {items.length === d.items.length
                ? `${d.items.length} cuentas`
                : `${items.length} de ${d.items.length} cuentas (buscador)`}
              {d.n_total > d.items.length && ` · listadas ${d.items.length} de ${d.n_total} (tope ${d.limite})`}
            </span>
            <span className="ml-auto">
              Los totales de arriba se calculan sobre las {d.n_total} cuentas, no sobre las listadas.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] text-[var(--t-text-muted)] tracking-wide uppercase">{label}</span>
      <span className="text-[12px] tabular-nums text-[var(--t-text)]">{value}</span>
    </div>
  );
}
