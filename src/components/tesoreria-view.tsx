"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TesoreriaAl2 } from "@/components/tesoreria-al2";
import { TesoreriaBancoABanco } from "@/components/tesoreria-banco-a-banco";
import { TesoreriaCheques } from "@/components/tesoreria-cheques";
import { TesoreriaMercados } from "@/components/tesoreria-mercados";
import { TesoreriaRegistros } from "@/components/tesoreria-registros";
import { AbmModal } from "@/components/ui/abm-modal";
import { usePersistedState } from "@/lib/use-persisted-state";

/**
 * Back Office → Tesorería. Ingresos/egresos BANCARIOS del día (fuente: Aunesa
 * consultaMovDocsSolicitados). Ingreso = Depósito, Egreso = Extracción; el monto viene
 * siempre positivo (la dirección la da el tipo).
 *
 * Cuatro tabs:
 *   MOVIMIENTOS — detalle a pantalla completa (solo las columnas relevantes; el resto
 *                 se prende desde COLUMNAS) con los totales por moneda en la barra y
 *                 filtros por RIEL / TIPO / SOLICITUD (client-side, sobre lo traído).
 *   BANCOS      — grilla estilo planilla: una columna por cuenta operativa (TODAS las
 *                 del catálogo, operen o no ese día), filas Saldo inicial (carga
 *                 manual) / Ingresos / Ingresos e-cheqs / Egresos / Egresos e-cheq /
 *                 Saldo final. NO respeta el selector ESTADO de la barra: un saldo
 *                 solo puede incluir plata que se movió (Procesado), nunca un
 *                 rechazado/anulado/pendiente. Las dos filas e-cheq van separadas de
 *                 los totales solo para que el back office las distinga, pero las dos
 *                 entran al saldo final. La fila Neto se sacó: era redundante.
 *   CHEQUES     — 50/50, los DOS de carga manual: recibidos son del día (intradía),
 *                 emitidos son seguimiento sin filtro de fecha. Ver tesoreria-cheques.tsx.
 *   MERCADOS    — 4 tableros del día al 50%: MERCADO (ingresos | pagos) y FCI
 *                 (rescates | suscripciones). Ver tesoreria-mercados.tsx.
 *   BANCO A BANCO — transferencias INTERNAS entre cuentas propias (débito → crédito).
 *                 Suman cero entre bancos: mueven el reparto, no el total.
 *
 * BANCOS tiene además el modal REGISTROS MANUALES: una fuente de movimientos que no
 * viene de la API y entra a Ingresos/Egresos según su sentido (ver
 * tesoreria-registros.tsx). Cada celda de la grilla abre su detalle auditable.
 *   SALDO AL2   — histórico del banco FERSI SA (ver tesoreria-al2.tsx). No usa `fecha`
 *                 ni `estado` de la barra: tiene su propia ventana de N días.
 *
 * Vista crítica: poll cada 20s (silencioso), reloj de última actualización y presencia
 * de quién más la tiene abierta — mismo patrón que SENEBIS.
 */

const POLL_MS = 20_000;

type Bucket = { ingresos: number; egresos: number; neto: number; n: number };
// Tal como viene del backend. `saldo_inicial`/`saldo_final` pueden llegar null desde
// una API vieja (Vercel deploya al toque, el Droplet se reinicia a mano) → se
// normalizan a número en `cuentas` y la grilla nunca ve un null.
type CuentaWire = {
  cuenta_operativa: string; unidad: string;
  // Filas propias en la grilla, separadas de los totales — pero las dos entran al saldo final.
  ingresos: number; ingresos_echeq?: number;
  egresos: number; egresos_echeq?: number;
  // Netos y con signo listo desde el backend (ingresos−pagos / rescates−suscripciones).
  mercados?: number; fci?: number;
  // Transferencias internas: (+) la cuenta recibió, (−) entregó. Suman cero entre bancos.
  bb_mas?: number; bb_menos?: number;
  neto: number; n: number;
  saldo_inicial: number | null; saldo_final: number | null; saldo_cargado?: boolean;
  saldo_por: string | null; saldo_at: string | null;
};
// Sin carga manual el inicial es 0 y el final cierra igual; `saldo_cargado`
// distingue "cargado en 0" de "nunca lo tocaron".
type Cuenta = Omit<CuentaWire, "saldo_inicial" | "saldo_final" | "saldo_cargado"> & {
  saldo_inicial: number; saldo_final: number; saldo_cargado: boolean;
};
// Catálogo de bancos para el ABM (nombre + número de cuenta + moneda).
type CuentaCat = {
  cuenta_operativa: string; unidad: string; numero_cuenta: string | null;
  numero_hygirus: string | null; activa: boolean; descubierta: boolean;
};
type Conectado = { email: string; visto_at: string };
// Movimiento = TODOS los campos crudos de Aunesa (dinámico) + derivados _hora/_tipo.
type Mov = Record<string, unknown>;
type Resp = {
  fecha: string; fecha_iso?: string; estado: string; resumen: Record<string, Bucket>;
  cuentas?: CuentaWire[]; puede_editar_saldo?: boolean; estado_bancos?: string;
  catalogo?: CuentaCat[];
  conectados?: Conectado[]; actualizado_at?: string;
  movimientos: Mov[]; n: number; raw?: number;
};

// Lo único que se mira todos los días. El resto queda oculto detrás de COLUMNAS.
const COL_DEFAULT = [
  "_hora", "_tipo", "cuenta", "persona_nombreCompleto", "cuentaOperativa", "unidad", "monto",
];
// Orden preferido (lo que no esté acá se agrega alfabético al final).
const COL_PREF = [
  "_hora", "id", "idExterno", "fecha", "solicitud", "_tipo", "tipoDocSoli", "cuenta",
  "persona_nombreCompleto", "cuentaOperativa", "unidad", "monto", "estado", "banco", "cbuCVU",
  "persona_documento", "persona_cuit", "persona_tipoDocumento", "persona_tipoPersona",
];
const LABEL: Record<string, string> = {
  _hora: "HORA", _tipo: "TIPO", cuenta: "CUENTA", cuentaOperativa: "CUENTA OPERATIVA",
  persona_nombreCompleto: "CLIENTE", persona_documento: "DOC", persona_cuit: "CUIT",
  persona_tipoDocumento: "TIPO DOC", persona_tipoPersona: "TIPO PERS.",
  tipoDocSoli: "RIEL", idExterno: "ID EXTERNO", cbuCVU: "CBU/CVU",
};
const label = (c: string) => LABEL[c] ?? c.replace(/^_/, "").replace(/^persona_/, "p·").toUpperCase();
const cell = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

// Estados Aunesa. "Todos" manda la lista completa separada por ';' (la API acepta multi).
const ESTADOS = [
  "Procesado", "Pendiente", "Pendiente de autorizar", "Demorado",
  "Rechazado", "Anulado", "Incompleto",
] as const;
const TODOS = ESTADOS.join(";");

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmt = (v: number) => v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hhmmss = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("es-AR", { hour12: false }) : "—");

export function TesoreriaView() {
  const [tab, setTab] = usePersistedState<"movimientos" | "bancos" | "cheques" | "mercados" | "banco a banco" | "saldo al2">(
    "tes.tab", "movimientos");
  const [fecha, setFecha] = useState(hoyISO());
  const [estado, setEstado] = usePersistedState("tes.estado", "Procesado");
  const [visibles, setVisibles] = usePersistedState<string[]>("tes.cols", COL_DEFAULT, "local");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [menuCols, setMenuCols] = useState(false);
  // Modal REGISTROS MANUALES (fuente propia de movimientos, ver tesoreria-registros.tsx).
  const [regsAbierto, setRegsAbierto] = useState(false);
  // Filtros de la tabla MOVIMIENTOS (client-side, sobre lo ya traído): RIEL
  // (tipoDocSoli), TIPO (ingreso/egreso) y SOLICITUD (Depósito/Extracción).
  const [fRiel, setFRiel] = useState("");
  const [fTipo, setFTipo] = useState("");
  const [fSol, setFSol] = useState("");

  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async (silencioso: boolean) => {
    if (!silencioso) { setLoading(true); setErr(null); }
    const url = `/api/back-office/tesoreria/dia?fecha=${fecha}&estado=${encodeURIComponent(estado)}`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      const txt = await r.text();
      let body: unknown = null;
      try { body = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!alive.current) return;
      if (!r.ok) {
        const o = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
        setErr(String(o.error ?? o.detail ?? `HTTP ${r.status} — ${txt.slice(0, 200)}`));
        if (!silencioso) setData(null);  // en poll, mejor data vieja que pantalla vacía
      } else {
        setErr(null); setData(body as Resp);
      }
    } catch (e) {
      if (alive.current && !silencioso) { setErr(e instanceof Error ? e.message : String(e)); setData(null); }
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [fecha, estado]);

  useEffect(() => { cargar(false); }, [cargar]);
  // Poll: mantiene los movimientos al día y renueva la presencia del usuario.
  useEffect(() => {
    const t = setInterval(() => cargar(true), POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const monedas = useMemo(() => Object.keys(data?.resumen ?? {}).sort(), [data]);
  // Saldo inicial sin cargar = 0, y el final = inicial + neto. Se recalcula acá (en vez
  // de confiar en el campo) para que la grilla cierre aunque el backend sea el viejo.
  const cuentas = useMemo<Cuenta[]>(() => (data?.cuentas ?? []).map((c) => {
    const ini = c.saldo_inicial ?? 0;
    // Las dos filas e-cheq van separadas SOLO para distinguirlas: las dos entran
    // al saldo. `neto` ya es ingresos − egresos. Ver api/services/tesoreria.py.
    return { ...c, saldo_cargado: c.saldo_inicial !== null && c.saldo_inicial !== undefined,
      saldo_inicial: ini,
      saldo_final: ini + c.neto + (c.ingresos_echeq ?? 0) - (c.egresos_echeq ?? 0)
        + (c.mercados ?? 0) + (c.fci ?? 0) + (c.bb_mas ?? 0) - (c.bb_menos ?? 0) };
  }), [data]);
  const movs = useMemo(() => {
    let rows = data?.movimientos ?? [];
    if (fRiel) rows = rows.filter((m) => String(m.tipoDocSoli ?? "") === fRiel);
    if (fTipo) rows = rows.filter((m) => String(m._tipo ?? "") === fTipo);
    if (fSol) rows = rows.filter((m) => String(m.solicitud ?? "") === fSol);
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    // Búsqueda genérica: matchea si CUALQUIER campo contiene el texto.
    return rows.filter((m) => Object.values(m).some((v) => String(v ?? "").toLowerCase().includes(t)));
  }, [data, q, fRiel, fTipo, fSol]);
  // Opciones de cada filtro: se arman con los valores realmente presentes en el día.
  const opciones = useMemo(() => {
    const rows = data?.movimientos ?? [];
    const uniq = (k: string) =>
      [...new Set(rows.map((m) => String(m[k] ?? "")).filter(Boolean))].sort();
    return { riel: uniq("tipoDocSoli"), tipo: uniq("_tipo"), solicitud: uniq("solicitud") };
  }, [data]);
  // Universo de columnas presentes, ordenado; lo que se muestra sale de `visibles`.
  const todasCols = useMemo(() => {
    const keys = new Set<string>();
    for (const m of data?.movimientos ?? []) for (const k of Object.keys(m)) keys.add(k);
    const pref = COL_PREF.filter((k) => keys.has(k));
    return [...pref, ...[...keys].filter((k) => !COL_PREF.includes(k)).sort()];
  }, [data]);
  const cols = useMemo(() => todasCols.filter((c) => visibles.includes(c)), [todasCols, visibles]);

  const toggleCol = (c: string) =>
    setVisibles((v) => (v.includes(c) ? v.filter((x) => x !== c) : [...v, c]));

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Barra: tabs + fecha + estado + estado de conexión + presencia */}
      <div className="px-3 py-2 border-b border-[var(--t-border)] flex items-center gap-2 flex-wrap shrink-0 text-[11px]">
        {(["movimientos", "bancos", "cheques", "mercados", "banco a banco", "saldo al2"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={"px-2 py-0.5 text-[10px] uppercase tracking-widest font-semibold border " +
              (tab === t
                ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                : "border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]")}>
            {t}
          </button>
        ))}
        <span className="w-px h-4 bg-[var(--t-border)] mx-1" />
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Fecha</span>
        <input type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-0.5 font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Estado</span>
        <select value={estado} onChange={(e) => setEstado(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-0.5 text-[var(--t-text)] outline-none [color-scheme:dark]">
          {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
          <option value={TODOS}>Todos</option>
        </select>

        {/* En la barra (no dentro de la grilla) para no comerse una fila de alto. */}
        {/* El "?" reemplaza al cartel: la aclaración sigue disponible pero no come
            una franja de alto en una vista donde el espacio vertical es lo escaso. */}
        {tab === "bancos" && (
          <span title={`Saldos calculados solo sobre movimientos ${data?.estado_bancos ?? "Procesado"}` +
            ` del ${data?.fecha ?? fecha} — la plata que efectivamente entró o salió ese día.` +
            " El filtro ESTADO de arriba aplica a MOVIMIENTOS, no al saldo." +
            " Clickeá cualquier celda para ver de dónde sale el número."}
            className="w-4 h-4 flex items-center justify-center rounded-full border border-[var(--t-border-2)] text-[9px] text-[var(--t-text-muted)] cursor-help">
            ?
          </span>
        )}
        {tab === "bancos" && data?.puede_editar_saldo && (
          <AbmBancos filas={data?.catalogo ?? []} onCambio={() => cargar(true)} />
        )}
        {tab === "bancos" && (
          <button onClick={() => setRegsAbierto(true)}
            className="text-[9px] uppercase tracking-widest border border-[var(--t-border-2)] px-2 py-0.5 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10">
            registros manuales
          </button>
        )}
        {regsAbierto && (
          <TesoreriaRegistros fecha={fecha} onCerrar={() => setRegsAbierto(false)}
            onCambio={() => cargar(true)} />
        )}

        <div className="ml-auto flex items-center gap-3">
          <Presencia conectados={data?.conectados ?? []} />
          <span className="flex items-center gap-1 text-[9px] text-[var(--t-text-muted)]">
            <span className={"w-1.5 h-1.5 rounded-full " +
              (err ? "bg-[var(--t-neg)]" : loading ? "bg-[var(--t-accent)] animate-pulse" : "bg-[var(--t-pos)]")} />
            {err ? "sin conexión" : `actualizado ${hhmmss(data?.actualizado_at)}`}
          </span>
          <button onClick={() => cargar(false)}
            className="text-[9px] uppercase text-[var(--t-accent)] hover:underline">refrescar</button>
        </div>
      </div>

      {/* Banner de error (distingue "backend caído / no deployado" de "vacío real") */}
      {err && (
        <div className="mx-3 mt-2 px-3 py-2 border border-[var(--t-neg)] bg-[var(--t-neg)]/10 text-[11px] text-[var(--t-neg)] shrink-0">
          Error al consultar Tesorería: {err}
          <div className="text-[10px] text-[var(--t-text-dim)] mt-0.5">
            Si dice 502 / HTTP 404, el backend todavía no está reiniciado en el Droplet (endpoint nuevo).
          </div>
        </div>
      )}

      {tab === "movimientos" ? (
        <div className="flex-1 min-h-0 flex flex-col p-3">
          <div className="flex items-center gap-2 shrink-0 pb-1 relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar en cualquier campo…"
              className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] outline-none w-[240px]" />
            <button onClick={() => setMenuCols((v) => !v)}
              className="px-2 py-0.5 text-[9px] uppercase tracking-widest border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-text)]">
              columnas ({cols.length}/{todasCols.length})
            </button>
            <Filtro label="Riel" value={fRiel} onChange={setFRiel} opciones={opciones.riel} />
            <Filtro label="Tipo" value={fTipo} onChange={setFTipo} opciones={opciones.tipo} />
            <Filtro label="Solicitud" value={fSol} onChange={setFSol} opciones={opciones.solicitud} />
            {(fRiel || fTipo || fSol) && (
              <button onClick={() => { setFRiel(""); setFTipo(""); setFSol(""); }}
                className="text-[9px] uppercase text-[var(--t-accent)] hover:underline">limpiar</button>
            )}
            <span className="text-[9px] text-[var(--t-text-muted)]">
              {q || fRiel || fTipo || fSol
                ? `${movs.length} de ${data?.n ?? 0}`
                : `${data?.n ?? 0} movimientos`}
            </span>
            {/* Totales del día, inline: mismo dato que antes vivía en una card suelta a la derecha. */}
            <div className="ml-auto flex items-center gap-4">
              {monedas.map((m) => {
                const b = data!.resumen[m];
                return (
                  <span key={m} className="flex items-center gap-2 text-[10px] tabular-nums">
                    <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">{m}</span>
                    <span className="text-[var(--t-pos)]">+{fmt(b.ingresos)}</span>
                    <span className="text-[var(--t-neg)]">−{fmt(b.egresos)}</span>
                    <span className={"font-semibold " + (b.neto >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]")}>
                      neto {b.neto >= 0 ? "+" : "−"}{fmt(Math.abs(b.neto))}
                    </span>
                  </span>
                );
              })}
            </div>
            {menuCols && (
              <div className="absolute z-20 top-full left-[250px] mt-1 max-h-[320px] overflow-auto border border-[var(--t-border-2)] bg-[var(--t-panel)] p-2 shadow-lg">
                <div className="flex gap-2 pb-1 mb-1 border-b border-[var(--t-border)]">
                  <button onClick={() => setVisibles(todasCols)} className="text-[9px] text-[var(--t-accent)] hover:underline">todas</button>
                  <button onClick={() => setVisibles(COL_DEFAULT)} className="text-[9px] text-[var(--t-text-muted)] hover:underline">por defecto</button>
                </div>
                {todasCols.map((c) => (
                  <label key={c} className="flex items-center gap-2 px-1 py-0.5 text-[10px] cursor-pointer hover:bg-[var(--t-surface)]">
                    <input type="checkbox" checked={visibles.includes(c)} onChange={() => toggleCol(c)} />
                    <span className="text-[var(--t-text)]">{label(c)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto border border-[var(--t-border)]">
            <table className="text-[11px] tabular-nums whitespace-nowrap w-full">
              <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
                <tr className="border-b border-[var(--t-border)]">
                  {cols.map((c) => <th key={c} className="px-2 py-1.5 text-left">{label(c)}</th>)}
                </tr>
              </thead>
              <tbody>
                {movs.map((m, i) => (
                  <tr key={String(m.id ?? i)} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                    {cols.map((c) => (
                      <td key={c} className={"px-2 py-1 " + (c === "_tipo" ? (m._tipo === "ingreso" ? "text-[var(--t-pos)]" : m._tipo === "egreso" ? "text-[var(--t-neg)]" : "") : "text-[var(--t-text-dim)]")}>
                        {c === "monto" && typeof m[c] === "number" ? fmt(m[c] as number) : cell(m[c])}
                      </td>
                    ))}
                  </tr>
                ))}
                {movs.length === 0 && !loading && (
                  <tr><td colSpan={Math.max(1, cols.length)} className="px-2 py-3 text-center text-[var(--t-text-muted)]">sin movimientos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : tab === "banco a banco" ? (
        <TesoreriaBancoABanco fecha={fecha} />
      ) : tab === "mercados" ? (
        <TesoreriaMercados fecha={fecha} />
      ) : tab === "cheques" ? (
        <TesoreriaCheques fecha={fecha} />
      ) : tab === "bancos" ? (
        <BancosGrid cuentas={cuentas} catalogo={data?.catalogo ?? []} fecha={fecha}
          vacio={!loading && !err}
          editable={!!data?.puede_editar_saldo} onSaved={() => cargar(true)} />
      ) : (
        <TesoreriaAl2 />
      )}
    </div>
  );
}


// Un desplegable de filtro de la tabla MOVIMIENTOS. Las opciones salen de los
// valores presentes en el día, así nunca ofrece algo que filtraría a cero.
function Filtro({ label, value, onChange, opciones }: {
  label: string; value: string; onChange: (v: string) => void; opciones: string[];
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={"bg-[var(--t-surface)] border px-1 py-0.5 text-[10px] outline-none [color-scheme:dark] " +
          (value ? "border-[var(--t-accent)] text-[var(--t-accent)]" : "border-[var(--t-border-2)] text-[var(--t-text)]")}>
        <option value="">todos</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}


// ABM del catálogo de BANCOS, en modal tipo planilla. El catálogo normalmente se
// descubre solo (un banco aparece cuando opera por primera vez), pero hace falta
// poder darlo de alta antes de que opere y, sobre todo, cargarle el NÚMERO DE
// CUENTA — que Aunesa no manda. Solo para quien tiene permiso de escritura; toda
// alta/edición queda en operaciones.tesoreria_audit.
function AbmBancos({ filas, onCambio }: { filas: CuentaCat[]; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);

  const post = async (metodo: "POST" | "PUT", body: unknown): Promise<string | null> => {
    try {
      const r = await fetch("/api/back-office/tesoreria/cuentas", {
        method: metodo, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        return String(b?.error ?? b?.detail ?? `HTTP ${r.status}`);
      }
      onCambio();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };

  return (
    <>
      <button onClick={() => setAbierto(true)}
        className="text-[9px] uppercase tracking-widest border border-[var(--t-border-2)] px-2 py-0.5 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10">
        bancos
      </button>
      {abierto && (
        <AbmModal
          titulo="Catálogo de bancos"
          ayuda="La moneda es parte de la clave: no se edita (dá de alta otro banco). Renombrar arrastra los saldos, cheques y movimientos ya cargados. El Nº Hygirus se guarda pero NO se muestra en la grilla."
          campos={[
            { key: "cuenta_operativa", label: "Cuenta operativa", ancho: "w-[34%]",
              placeholder: "como figura en el banco…" },
            { key: "numero_cuenta", label: "Número de cuenta", ancho: "w-[22%]" },
            { key: "numero_hygirus", label: "Nº Hygirus", ancho: "w-[22%]" },
            { key: "unidad", label: "Moneda", ancho: "w-[12%]", opciones: ["ARS", "USD"],
              soloAlta: true },
          ]}
          filas={filas.map((c) => ({
            _id: `${c.cuenta_operativa}|${c.unidad}`,
            cuenta_operativa: c.cuenta_operativa,
            numero_cuenta: c.numero_cuenta ?? "",
            numero_hygirus: c.numero_hygirus ?? "",
            unidad: c.unidad,
          }))}
          onAlta={(v) => post("POST", {
            cuenta_operativa: v.cuenta_operativa, unidad: v.unidad,
            numero_cuenta: v.numero_cuenta || null,
            numero_hygirus: v.numero_hygirus || null,
          })}
          onGuardar={(f, v) => post("PUT", {
            cuenta_operativa: f.cuenta_operativa, unidad: f.unidad,
            nuevo_nombre: v.cuenta_operativa, numero_cuenta: v.numero_cuenta || null,
            numero_hygirus: v.numero_hygirus || null,
          })}
          onCerrar={() => setAbierto(false)} />
      )}
    </>
  );
}


// Modal de auditoría de una celda: "¿de dónde sale este número?". Lo resuelve el
// BACKEND con las mismas fuentes y filtros que la grilla — acá no se recalcula nada,
// así el detalle no puede contradecir al total.
type Celda = { banco: string; unidad: string; fila: string; etiqueta: string };
type DetalleItem = {
  detalle: string; referencia: string; estado: string | null; importe: number;
};
type Detalle = {
  fila: string; banco: string; unidad: string; fecha: string; fuente: string;
  total: number; items: DetalleItem[];
};

function ModalDetalle({ celda, fecha, onCerrar }: {
  celda: Celda; fecha: string; onCerrar: () => void;
}) {
  const [d, setD] = useState<Detalle | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  useEffect(() => {
    let vivo = true;
    const qs = new URLSearchParams({
      banco: celda.banco, unidad: celda.unidad, fila: celda.fila, fecha,
    });
    (async () => {
      try {
        const r = await fetch(`/api/back-office/tesoreria/detalle?${qs}`, { cache: "no-store" });
        const b = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) setErr(String(b?.error ?? b?.detail ?? `HTTP ${r.status}`));
        else setD(b as Detalle);
      } catch (e) {
        if (vivo) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { vivo = false; };
  }, [celda, fecha]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}>
      <div className="w-full max-w-[820px] max-h-[80vh] flex flex-col bg-[var(--t-panel)] border border-[var(--t-border-2)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 bg-[#094293] text-white flex items-center gap-2 shrink-0">
          <span className="flex-1 text-[11px] uppercase tracking-widest font-semibold">
            {celda.etiqueta} · {celda.banco} [{celda.unidad}]
          </span>
          <button onClick={onCerrar} className="text-[12px] px-2 hover:opacity-70">✕</button>
        </div>
        <div className="px-3 py-1.5 text-[9px] text-[var(--t-text-muted)] border-b border-[var(--t-border)] shrink-0">
          {d ? `${d.fuente} · ${d.fecha}` : err ? "" : "cargando…"}
        </div>
        {err && <div className="px-3 py-2 text-[10px] text-[var(--t-neg)]">{err}</div>}

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full table-fixed text-[11px]">
            <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
              <tr className="border-b border-[var(--t-border)]">
                <th className="px-2 py-1.5 text-left font-normal w-[42%]">Detalle</th>
                <th className="px-2 py-1.5 text-left font-normal w-[30%]">Referencia</th>
                <th className="px-2 py-1.5 text-left font-normal w-[12%]">Estado</th>
                <th className="px-2 py-1.5 text-right font-normal w-[16%]">Importe</th>
              </tr>
            </thead>
            <tbody>
              {(d?.items ?? []).map((i, n) => (
                <tr key={n} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                  <td className="px-2 py-1 break-words">{i.detalle}</td>
                  <td className="px-2 py-1 break-words text-[var(--t-text-dim)]">{i.referencia || "—"}</td>
                  <td className="px-2 py-1 text-[var(--t-text-dim)]">{i.estado || "—"}</td>
                  <td className={"px-2 py-1 text-right tabular-nums " +
                    (i.importe < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]")}>
                    {fmt(i.importe)}
                  </td>
                </tr>
              ))}
              {d && !d.items.length && (
                <tr><td colSpan={4} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                  sin operaciones — la celda está en cero
                </td></tr>
              )}
            </tbody>
            {d && (
              <tfoot>
                <tr className="border-t-2 border-[var(--t-border-2)] bg-[var(--t-surface)] font-semibold sticky bottom-0">
                  <td className="px-2 py-1.5" colSpan={3}>TOTAL · {d.items.length} operaciones</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(d.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}


// Avatares de quién más tiene la vista abierta (mismo patrón que SENEBIS).
function Presencia({ conectados }: { conectados: Conectado[] }) {
  if (!conectados.length) return null;
  return (
    <div className="flex items-center gap-1" title={conectados.map((c) => c.email).join("\n")}>
      <span className="text-[9px] text-[var(--t-text-muted)] uppercase">En vista:</span>
      {conectados.map((c) => (
        <span key={c.email} title={c.email}
          className="text-[9px] px-1.5 py-0.5 border border-[var(--t-border-2)] bg-[var(--t-panel)] text-[var(--t-text)] uppercase">
          {c.email.split("@")[0]}
        </span>
      ))}
    </div>
  );
}


// Tab BANCOS: la planilla. Un bloque por moneda, una columna por cuenta operativa
// (todas las del catálogo, con o sin movimientos ese día), filas Saldo inicial
// (manual) / Ingresos / Egresos / Neto / Saldo final + columna TOTAL.
//
// SALDO FINAL = SALDO INICIAL + INGRESOS − EGRESOS, sin excepciones. Si el back
// office no cargó el inicial de un banco, vale 0 (se muestra apagado para que se
// vea que es el default, no un dato cargado) y el final es directamente el neto.
// Todo va CENTRADO: título del bloque, encabezados y valores.
function BancosGrid({ cuentas, catalogo, fecha, editable, vacio, onSaved }: {
  cuentas: Cuenta[]; catalogo: CuentaCat[]; fecha: string; editable: boolean;
  vacio: boolean; onSaved: () => void;
}) {
  // banco|moneda → número de cuenta, para mostrarlo bajo el nombre en el encabezado.
  const numeros = useMemo(() => Object.fromEntries(
    catalogo.filter((c) => c.numero_cuenta)
      .map((c) => [`${c.cuenta_operativa}|${c.unidad}`, c.numero_cuenta as string]),
  ), [catalogo]);
  const [editKey, setEditKey] = useState<string | null>(null);
  // Celda abierta en el modal de auditoría (null = cerrado).
  const [celda, setCelda] = useState<Celda | null>(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const porMoneda = useMemo(() => {
    const g: Record<string, Cuenta[]> = {};
    for (const c of cuentas) (g[c.unidad] ??= []).push(c);
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.cuenta_operativa.localeCompare(b.cuenta_operativa));
    return g;
  }, [cuentas]);

  // Toda celda de valor abre el detalle. Se pasa por props (no por contexto) para
  // que quede explícito qué fila se está auditando.
  const auditar = (c: Cuenta, fila: string, etiqueta: string) => ({
    onClick: () => setCelda({ banco: c.cuenta_operativa, unidad: c.unidad, fila, etiqueta }),
    title: `${etiqueta} · ${c.cuenta_operativa} — clic para ver el detalle`,
    role: "button" as const,
  });
  const CLICK = " cursor-pointer hover:bg-[var(--t-accent)]/10";

  const abrir = (c: Cuenta) => {
    setEditKey(`${c.cuenta_operativa}|${c.unidad}`);
    // Sin carga previa el input arranca vacío (el 0 que se ve es el default, no un valor).
    setVal(c.saldo_cargado ? String(c.saldo_inicial) : "");
    setErr(null);
  };

  const guardar = async (c: Cuenta) => {
    const t = val.trim().replace(/\./g, "").replace(",", ".");
    if (t !== "" && !Number.isFinite(Number(t))) { setErr("número inválido"); return; }
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/back-office/tesoreria/saldo-inicial", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fecha, cuenta_operativa: c.cuenta_operativa, unidad: c.unidad,
          saldo_inicial: t === "" ? null : Number(t),
        }),
      });
      if (!r.ok) { setErr(`no se pudo guardar (HTTP ${r.status})`); return; }
      setEditKey(null); onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  // Catálogo vacío: el alta no se pierde porque vive en la barra de arriba (ver
  // AltaBanco en la barra de TesoreriaView), no dentro de esta grilla.
  if (!cuentas.length) {
    return (
      <div className="flex-1 min-h-0 p-3 text-[11px] text-[var(--t-text-muted)]">
        {vacio
          ? "Catálogo de cuentas operativas vacío — se llena solo cuando un banco opera, o cargá uno con «BANCOS» arriba."
          : "cargando…"}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-3 flex flex-col gap-4">
      {err && <div className="text-[10px] text-[var(--t-neg)]">{err}</div>}
      {Object.keys(porMoneda).sort().map((uni) => {
        const cols = porMoneda[uni];
        // Sin nulls: el inicial ya viene 0 cuando no se cargó, así que el total es una suma.
        const tot = cols.reduce((a, c) => ({
          ingresos: a.ingresos + c.ingresos, egresos: a.egresos + c.egresos,
          echeq: a.echeq + (c.egresos_echeq ?? 0),
          ingEcheq: a.ingEcheq + (c.ingresos_echeq ?? 0),
          mercados: a.mercados + (c.mercados ?? 0), fci: a.fci + (c.fci ?? 0),
          bbMas: a.bbMas + (c.bb_mas ?? 0), bbMenos: a.bbMenos + (c.bb_menos ?? 0),
          neto: a.neto + c.neto, ini: a.ini + c.saldo_inicial,
        }), { ingresos: 0, egresos: 0, echeq: 0, ingEcheq: 0, mercados: 0, fci: 0,
              bbMas: 0, bbMenos: 0, neto: 0, ini: 0 });
        return (
          <div key={uni} className="min-w-0 max-w-full">
            <div className="px-2 py-1 bg-[#094293] text-white text-[10px] uppercase tracking-widest font-semibold text-center">
              {uni} · {cols.length} cuentas
            </div>
            {/* Cada moneda con SU scroll: el bloque ancho no arrastra al resto. */}
            <div className="overflow-x-auto max-w-full border border-[var(--t-border)]">
              <table className="text-[11px] tabular-nums whitespace-nowrap w-full">
                <thead>
                  <tr className="border-b border-[var(--t-border)] bg-[var(--t-surface)] text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
                    <th className="px-2 py-1.5 text-left sticky left-0 bg-[var(--t-surface)] z-10">Concepto</th>
                    {cols.map((c) => (
                      <th key={c.cuenta_operativa} className="px-2 py-1.5 text-center min-w-[130px]"
                        title={`${c.n} movimientos`}>
                        <div>{c.cuenta_operativa}</div>
                        {/* El número de cuenta se carga desde el ABM (Aunesa no lo manda). */}
                        {numeros[`${c.cuenta_operativa}|${c.unidad}`] && (
                          <div className="text-[9px] font-normal normal-case text-[var(--t-text-muted)] tabular-nums">
                            {numeros[`${c.cuenta_operativa}|${c.unidad}`]}
                          </div>
                        )}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right min-w-[130px] text-[var(--t-accent)]">Total {uni}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)] text-left sticky left-0 bg-[var(--t-panel)] z-10">Saldo inicial</td>
                    {cols.map((c) => {
                      const k = `${c.cuenta_operativa}|${c.unidad}`;
                      return (
                        <td key={k} className="px-2 py-1 text-center">
                          {editKey === k ? (
                            <span className="flex items-center gap-1 justify-center">
                              <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") guardar(c); if (e.key === "Escape") setEditKey(null); }}
                                placeholder="vacío = 0"
                                className="w-[100px] bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 text-center text-[11px] text-[var(--t-text)] outline-none" />
                              <button onClick={() => guardar(c)} disabled={busy}
                                className="text-[9px] text-[var(--t-accent)] hover:underline disabled:opacity-40">ok</button>
                            </span>
                          ) : (
                            <button disabled={!editable} onClick={() => abrir(c)}
                              title={c.saldo_cargado
                                ? `cargado por ${c.saldo_por ?? "—"}`
                                : editable ? "sin cargar (se toma 0) — clic para cargar" : "sin cargar (se toma 0)"}
                              className={"font-semibold " + (editable ? "hover:underline cursor-pointer " : "cursor-default ") +
                                (c.saldo_cargado ? "text-[var(--t-text)]" : "text-[var(--t-text-muted)] font-normal")}>
                              {fmt(c.saldo_inicial)}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">{fmt(tot.ini)}</td>
                  </tr>
                  <tr className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)] text-left sticky left-0 bg-[var(--t-panel)] z-10">Ingresos</td>
                    {cols.map((c) => (
                      <td key={c.cuenta_operativa} {...auditar(c, "ingresos", "Ingresos")}
                        className={"px-2 py-1 text-center text-[var(--t-pos)]" + CLICK}>+{fmt(c.ingresos)}</td>
                    ))}
                    <td className="px-2 py-1 text-right text-[var(--t-pos)] font-semibold">+{fmt(tot.ingresos)}</td>
                  </tr>
                  {/* Cheques RECIBIDOS marcados finalizados ese día (carga manual,
                      tab CHEQUES). Fila propia, igual que los egresos e-cheq. */}
                  <tr className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)] text-left sticky left-0 bg-[var(--t-panel)] z-10"
                      title="Cheques recibidos finalizados ese día (carga manual). Suma al saldo final">Ingresos e-cheqs</td>
                    {cols.map((c) => (
                      <td key={c.cuenta_operativa} {...auditar(c, "ingresos_echeq", "Ingresos e-cheqs")}
                        className={"px-2 py-1 text-center text-[var(--t-text-dim)]" + CLICK}>
                        {c.ingresos_echeq ? `+${fmt(c.ingresos_echeq)}` : fmt(0)}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right text-[var(--t-text-dim)] font-semibold">
                      {tot.ingEcheq ? `+${fmt(tot.ingEcheq)}` : fmt(0)}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)] text-left sticky left-0 bg-[var(--t-panel)] z-10">Egresos</td>
                    {cols.map((c) => (
                      <td key={c.cuenta_operativa} {...auditar(c, "egresos", "Egresos")}
                        className={"px-2 py-1 text-center text-[var(--t-neg)]" + CLICK}>−{fmt(c.egresos)}</td>
                    ))}
                    <td className="px-2 py-1 text-right text-[var(--t-neg)] font-semibold">−{fmt(tot.egresos)}</td>
                  </tr>
                  {/* Los e-cheq van en su PROPIA fila y NO entran al total de egresos:
                      se pagan en su fecha de pago, no el día que se emiten. */}
                  <tr className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)] text-left sticky left-0 bg-[var(--t-panel)] z-10"
                      title="Separado del total de egresos, pero sí resta del saldo final">Egresos e-cheq</td>
                    {cols.map((c) => (
                      <td key={c.cuenta_operativa} {...auditar(c, "egresos_echeq", "Egresos e-cheq")}
                        className={"px-2 py-1 text-center text-[var(--t-text-dim)]" + CLICK}>
                        {c.egresos_echeq ? `−${fmt(c.egresos_echeq)}` : fmt(0)}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right text-[var(--t-text-dim)] font-semibold">
                      {tot.echeq ? `−${fmt(tot.echeq)}` : fmt(0)}
                    </td>
                  </tr>
                  {/* MERCADOS y FCI vienen NETOS de la tab MERCADOS: mercados =
                      ingresos−pagos, fci = rescates−suscripciones. Los dos suman. */}
                  {([["Mercados", "mercados"], ["FCI", "fci"]] as const).map(([lbl, k]) => (
                    <tr key={k} className="border-b border-[var(--t-border)]">
                      <td className="px-2 py-1 text-[var(--t-text-dim)] text-left sticky left-0 bg-[var(--t-panel)] z-10"
                        title={k === "mercados"
                          ? "Neto del bloque MERCADO: ingresos − pagos"
                          : "Neto del bloque FCI: rescates − suscripciones"}>{lbl}</td>
                      {cols.map((c) => {
                        const v = c[k] ?? 0;
                        return (
                          <td key={c.cuenta_operativa} {...auditar(c, k, lbl)}
                            className={"px-2 py-1 text-center" + CLICK + " " + (v === 0 ? "text-[var(--t-text-dim)]"
                              : v > 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]")}>
                            {v === 0 ? fmt(0) : `${v > 0 ? "+" : "−"}${fmt(Math.abs(v))}`}
                          </td>
                        );
                      })}
                      <td className={"px-2 py-1 text-right font-semibold " + (tot[k] === 0
                        ? "text-[var(--t-text-dim)]"
                        : tot[k] > 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]")}>
                        {tot[k] === 0 ? fmt(0) : `${tot[k] > 0 ? "+" : "−"}${fmt(Math.abs(tot[k]))}`}
                      </td>
                    </tr>
                  ))}
                  {/* BANCO A BANCO: una transferencia interna suma en la cuenta que
                      recibe y resta en la que entrega → el total entre bancos da cero. */}
                  <tr className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)] text-left sticky left-0 bg-[var(--t-panel)] z-10"
                      title="Transferencias internas recibidas de otro banco propio">Banco a banco (+)</td>
                    {cols.map((c) => (
                      <td key={c.cuenta_operativa} {...auditar(c, "bb_mas", "Banco a banco (+)")}
                        className={"px-2 py-1 text-center" + CLICK + " " +
                        ((c.bb_mas ?? 0) ? "text-[var(--t-pos)]" : "text-[var(--t-text-dim)]")}>
                        {(c.bb_mas ?? 0) ? `+${fmt(c.bb_mas ?? 0)}` : fmt(0)}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right font-semibold text-[var(--t-pos)]">
                      {tot.bbMas ? `+${fmt(tot.bbMas)}` : fmt(0)}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)] text-left sticky left-0 bg-[var(--t-panel)] z-10"
                      title="Transferencias internas enviadas a otro banco propio">Banco a banco (−)</td>
                    {cols.map((c) => (
                      <td key={c.cuenta_operativa} {...auditar(c, "bb_menos", "Banco a banco (−)")}
                        className={"px-2 py-1 text-center" + CLICK + " " +
                        ((c.bb_menos ?? 0) ? "text-[var(--t-neg)]" : "text-[var(--t-text-dim)]")}>
                        {(c.bb_menos ?? 0) ? `−${fmt(c.bb_menos ?? 0)}` : fmt(0)}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right font-semibold text-[var(--t-neg)]">
                      {tot.bbMenos ? `−${fmt(tot.bbMenos)}` : fmt(0)}
                    </td>
                  </tr>
                  <tr className="bg-[var(--t-surface)]">
                    <td className="px-2 py-1 font-semibold text-left sticky left-0 bg-[var(--t-surface)] z-10">Saldo final</td>
                    {cols.map((c) => (
                      <td key={c.cuenta_operativa} {...auditar(c, "saldo_final", "Saldo final")}
                        className={"px-2 py-1 text-center font-bold" + CLICK}>{fmt(c.saldo_final)}</td>
                    ))}
                    <td className="px-2 py-1 text-right font-bold">
                      {fmt(tot.ini + tot.neto + tot.ingEcheq - tot.echeq
                        + tot.mercados + tot.fci + tot.bbMas - tot.bbMenos)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {!editable && (
              <div className="text-[9px] text-[var(--t-text-muted)] mt-1">
                Solo lectura: no tenés permiso para cargar saldos iniciales (se habilita en Manager → MESA).
              </div>
            )}
          </div>
        );
      })}
      {celda && <ModalDetalle celda={celda} fecha={fecha} onCerrar={() => setCelda(null)} />}
    </div>
  );
}
