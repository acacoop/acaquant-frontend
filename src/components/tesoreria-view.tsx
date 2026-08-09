"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TesoreriaBancoABanco } from "@/components/tesoreria-banco-a-banco";
import { TesoreriaCheques } from "@/components/tesoreria-cheques";
import { TesoreriaVeps } from "@/components/tesoreria-veps";
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
 *
 * FECHA: el selector aparece SOLO en BANCOS, la única tab que navega el histórico.
 * Todo lo demás (MOVIMIENTOS, CHEQUES, MERCADOS, BANCO A BANCO) es siempre el día en
 * curso. Elegir una fecha pasada en BANCOS trae la FOTO guardada de ese día
 * (`GET /tesoreria/foto`): la grilla congelada + el detalle ya calculado de cada
 * celda, en solo lectura. Así el histórico de movimientos se navega por la celda que
 * los usa, sin duplicar la lista en MOVIMIENTOS.
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
  // TOTAL del panel RESCATE ACA VALORES por moneda (lo calcula el backend con la
  // misma fuente que el modal, así la barra no puede contradecirlo).
  rescate?: Record<string, number>;
  conectados?: Conectado[]; actualizado_at?: string;
  // Aunesa es una dependencia EXTERNA y se cae. Cuando pasa, el backend igual
  // responde con todo lo que vive en Postgres y lo declara acá, en vez de tirar
  // un 502 en el que no se distingue "proveedor caído" de "la API rota".
  aunesa_ok?: boolean; aunesa_error?: string | null;
  movimientos: Mov[]; n: number; raw?: number;
};
// FOTO de un día pasado: la grilla BANCOS congelada + el detalle ya calculado de
// cada celda (clave "banco|MONEDA|fila"), así el modal de auditoría de un día viejo
// no vuelve a pegarle a Aunesa. `existe: false` = ese día no se fotografió.
type Foto = {
  existe: boolean; fecha: string; fecha_iso: string; ttl?: number;
  id?: number; tomado_at?: string; tomado_por?: string | null; origen?: string;
  hash_sha256?: string; hash_ok?: boolean; estado_bancos?: string;
  cuentas: CuentaWire[]; catalogo: CuentaCat[]; detalle: Record<string, Detalle>;
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

// El saldo final lo calcula el BACKEND (api/services/tesoreria.py) y el front lo
// muestra tal cual. Acá vivía una COPIA de esa fórmula: dos definiciones de la misma
// regla de negocio que podían separarse sin que nada fallara — si el back sumaba una
// fila nueva al saldo, la grilla la ignoraba en silencio y mostraba otro total.
// Verificado antes de borrarla con `python -m scripts.diag_tesoreria_front_vs_back`:
// 48 filas (vista live + fotos del histórico), diferencia 0.000000.
// Los `?? 0` NO son la regla de negocio: son el default de borde del tipo
// (`number | null`), y `saldo_cargado` cae a derivarlo solo si el backend no lo manda.
const normalizarCuentas = (rows: CuentaWire[]): Cuenta[] => rows.map((c) => ({
  ...c,
  saldo_inicial: c.saldo_inicial ?? 0,
  saldo_final: c.saldo_final ?? 0,
  saldo_cargado: c.saldo_cargado ?? (c.saldo_inicial !== null && c.saldo_inicial !== undefined),
}));

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmt = (v: number) => v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hhmmss = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("es-AR", { hour12: false }) : "—");

// Fuente única de las tabs: el tipo, la barra y el saneo del valor persistido salen
// todos de acá, así no puede quedar una lista desincronizada de otra.
const TABS = ["movimientos", "bancos", "cheques", "veps", "mercados", "banco a banco"] as const;
type Tab = (typeof TABS)[number];

export function TesoreriaView() {
  const [tabGuardada, setTab] = usePersistedState<Tab>("tes.tab", "movimientos");
  // SALDO AL2 se eliminó. Si quedó guardada en la sesión de alguien que la tenía
  // abierta, cae al default en vez de dejar la barra sin ninguna tab resaltada.
  const tab = (TABS as readonly string[]).includes(tabGuardada) ? tabGuardada : "movimientos";
  // El día es SIEMPRE hoy salvo en BANCOS, la única tab que navega el histórico
  // (y lo hace contra la FOTO guardada, no contra Aunesa). Por eso el selector de
  // fecha solo aparece ahí: en el resto no habría nada viejo que mostrar.
  const hoy = useMemo(hoyISO, []);
  const [fecha, setFecha] = useState(hoy);
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

  // BANCOS con fecha pasada = FOTO guardada (el día viejo ya no se puede
  // reconstruir live contra Aunesa). Ver api/services/tesoreria.py::foto_dia.
  const historico = tab === "bancos" && fecha !== hoy;
  const [foto, setFoto] = useState<Foto | null>(null);
  const [fotoErr, setFotoErr] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async (silencioso: boolean) => {
    if (!silencioso) { setLoading(true); setErr(null); }
    const url = `/api/back-office/tesoreria/dia?fecha=${hoy}&estado=${encodeURIComponent(estado)}`;
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
  }, [hoy, estado]);

  useEffect(() => { cargar(false); }, [cargar]);
  // Poll: mantiene los movimientos al día y renueva la presencia del usuario.
  useEffect(() => {
    const t = setInterval(() => cargar(true), POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  // La foto se pide una sola vez por fecha: es un día cerrado, no cambia (por eso
  // tampoco entra en el poll).
  useEffect(() => {
    if (!historico) { setFoto(null); setFotoErr(null); return; }
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/back-office/tesoreria/foto?fecha=${fecha}`, { cache: "no-store" });
        const b = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) { setFotoErr(String(b?.error ?? b?.detail ?? `HTTP ${r.status}`)); setFoto(null); }
        else { setFotoErr(null); setFoto(b as Foto); }
      } catch (e) {
        if (vivo) { setFotoErr(e instanceof Error ? e.message : String(e)); setFoto(null); }
      }
    })();
    return () => { vivo = false; };
  }, [historico, fecha]);

  const monedas = useMemo(() => Object.keys(data?.resumen ?? {}).sort(), [data]);
  // Saldo inicial sin cargar = 0, y el final = inicial + neto. Se recalcula acá (en vez
  // de confiar en el campo) para que la grilla cierre aunque el backend sea el viejo.
  const cuentas = useMemo<Cuenta[]>(
    () => normalizarCuentas(historico ? (foto?.cuentas ?? []) : (data?.cuentas ?? [])),
    [data, foto, historico]);
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
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={"px-2 py-0.5 text-[10px] uppercase tracking-widest font-semibold border " +
              (tab === t
                ? "border-[var(--t-accent)] text-[var(--t-accent)]"
                : "border-transparent text-[var(--t-text-muted)] hover:text-[var(--t-text)]")}>
            {t}
          </button>
        ))}
        <span className="w-px h-4 bg-[var(--t-border)] mx-1" />
        {/* FECHA: solo en BANCOS. Es la única tab con histórico (lee la FOTO del día);
            el resto es siempre el día en curso, así que un selector ahí solo confundiría. */}
        {tab === "bancos" && (
          <>
            <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Fecha</span>
            <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)}
              className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-0.5 font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
            {historico && (
              <button onClick={() => setFecha(hoy)}
                className="text-[9px] uppercase tracking-widest text-[var(--t-accent)] hover:underline">hoy</button>
            )}
          </>
        )}
        {/* ESTADO filtra la tabla de MOVIMIENTOS (nunca el saldo, que es siempre Procesado). */}
        {tab === "movimientos" && (
          <>
            <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value)}
              className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-0.5 text-[var(--t-text)] outline-none [color-scheme:dark]">
              {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
              <option value={TODOS}>Todos</option>
            </select>
          </>
        )}

        {/* En la barra (no dentro de la grilla) para no comerse una fila de alto. */}
        {/* El "?" reemplaza al cartel: la aclaración sigue disponible pero no come
            una franja de alto en una vista donde el espacio vertical es lo escaso. */}
        {tab === "bancos" && (
          <span title={`Saldos calculados solo sobre movimientos ${data?.estado_bancos ?? "Procesado"}` +
            ` del ${historico ? fecha : (data?.fecha ?? fecha)} — la plata que efectivamente entró o salió ese día.` +
            " El filtro ESTADO aplica a MOVIMIENTOS, no al saldo." +
            " Clickeá cualquier celda para ver de dónde sale el número." +
            " Una fecha pasada muestra la FOTO guardada de ese día (solo lectura)."}
            className="w-4 h-4 flex items-center justify-center rounded-full border border-[var(--t-border-2)] text-[9px] text-[var(--t-text-muted)] cursor-help">
            ?
          </span>
        )}
        {/* Con fecha pasada se está mirando una foto: nada de ABM ni de carga. */}
        {tab === "bancos" && !historico && data?.puede_editar_saldo && (
          <AbmBancos filas={data?.catalogo ?? []} onCambio={() => cargar(true)} />
        )}
        {tab === "bancos" && !historico && (
          <button onClick={() => setRegsAbierto(true)}
            className="text-[9px] uppercase tracking-widest border border-[var(--t-border-2)] px-2 py-0.5 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10">
            registros manuales
          </button>
        )}
        {tab === "bancos" && !historico && data?.puede_editar_saldo && (
          <BotonFoto fecha={fecha} />
        )}
        {/* El TOTAL del panel RESCATE ACA VALORES, a mano: es el número que el back
            office mira todo el día y hasta ahora obligaba a abrir el modal. Sale del
            backend (misma fuente que el modal) — acá no se recalcula nada. */}
        {tab === "bancos" && !historico && (
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)] flex items-center gap-1.5"
            title="TOTAL del panel Rescate ACA Valores (registros manuales). Los de OTROS REGISTROS no entran acá.">
            rescate aca valores:
            {["ARS", "USD"].filter((u) => u === "ARS" || (data?.rescate?.[u] ?? 0) !== 0)
              .map((u) => (
                <span key={u} className="tabular-nums text-[var(--t-text)] normal-case">
                  {u} {fmt(data?.rescate?.[u] ?? 0)}
                </span>
              ))}
          </span>
        )}
        {tab === "bancos" && historico && (
          <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 border border-[var(--t-border-2)] text-[var(--t-text-muted)]"
            title={foto?.existe
              ? `Foto tomada el ${hhmmss(foto.tomado_at)} por ${foto.tomado_por ?? "—"} (${foto.origen})` +
                (foto.hash_ok === false ? " — ATENCIÓN: el hash no cierra, la fila se modificó por fuera" : "")
              : "Ese día no tiene foto guardada"}>
            {foto?.existe
              ? `foto ${foto.origen ?? ""} ${foto.hash_ok === false ? "· hash ✗" : "· ok"}`
              : "sin foto"}
          </span>
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
      {/* Aunesa caído: la vista SIGUE sirviendo lo cargado a mano (saldos, cheques,
          mercados, banco a banco, registros, VEPs). Lo que falta son los
          movimientos del día, así que los saldos están incompletos y hay que
          decirlo — no dejar que se lea como "hoy no hubo movimientos". */}
      {data && data.aunesa_ok === false && (
        <div className="px-3 py-2 border border-[#eab308] bg-[#eab308]/10 text-[11px] text-[#eab308] shrink-0">
          <b>Aunesa no responde.</b> Se muestra todo lo cargado a mano (saldos, cheques,
          mercados, banco a banco, registros y VEPs), pero <b>faltan los movimientos del
          día</b>: los ingresos, los egresos y el saldo final están incompletos.
          <div className="text-[9px] text-[var(--t-text-dim)] mt-0.5 font-mono">
            {data.aunesa_error}
          </div>
        </div>
      )}

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
        <TesoreriaBancoABanco fecha={hoy} />
      ) : tab === "mercados" ? (
        <TesoreriaMercados fecha={hoy} />
      ) : tab === "cheques" ? (
        <TesoreriaCheques fecha={hoy} />
      ) : tab === "veps" ? (
        // Tablero de seguimiento: NO recibe `fecha` a propósito — un VEP viejo sin
        // pagar tiene que seguir a la vista aunque se mire otro día.
        <TesoreriaVeps />
      ) : (
        historico && !foto?.existe ? (
          <div className="flex-1 min-h-0 p-3 text-[11px] text-[var(--t-text-muted)]">
            {fotoErr
              ? `Error al leer la foto: ${fotoErr}`
              : foto
                ? `No hay foto guardada del ${fecha}. Se conservan las últimas ${foto.ttl ?? 30} — ` +
                  "un día sin foto ya no se puede reconstruir."
                : "cargando…"}
          </div>
        ) : (
          <BancosGrid cuentas={cuentas}
            catalogo={historico ? (foto?.catalogo ?? []) : (data?.catalogo ?? [])}
            fecha={fecha} vacio={!loading && !err}
            // Una foto es evidencia: se mira, no se toca.
            editable={!historico && !!data?.puede_editar_saldo}
            detalleFijo={historico ? (foto?.detalle ?? {}) : null}
            onSaved={() => cargar(true)} />
        )
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
  fuente: string; ref: string; detalle: string; referencia: string;
  estado: string | null; importe: number;
  // Destildado = no cuenta en el saldo. `observacion` es la traza (quién y a qué hora).
  excluido?: boolean; observacion?: string;
};
type Detalle = {
  fila: string; banco: string; unidad: string; fecha: string; fuente: string;
  total: number; excluidos?: number; items: DetalleItem[];
};
// Estados que NO son plata cerrada. Se resaltan en la auditoría: cuentan en el saldo
// (así lo quiere el back office) pero tienen que verse como lo que son.
const PENDIENTES = new Set(["pendiente", "pendiente de autorizar", "demorado"]);

function ModalDetalle({ celda, fecha, editable, fijo, onCerrar, onCambio }: {
  celda: Celda; fecha: string; editable: boolean;
  // `fijo` presente = el detalle sale de la FOTO del día (undefined = pedirlo live).
  // `null` dentro de una foto significa "esa celda no tenía operaciones".
  fijo?: Detalle | null;
  onCerrar: () => void; onCambio: () => void;
}) {
  const congelado = fijo !== undefined;
  const [d, setD] = useState<Detalle | null>(congelado ? fijo : null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);   // fuerza recargar tras tildar

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  useEffect(() => {
    if (congelado) { setD(fijo ?? null); return; }
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
  }, [celda, fecha, nonce, congelado, fijo]);

  // Tildar/destildar: el backend guarda el override y la observación, y la grilla
  // se recalcula (el movimiento entra o sale del saldo final).
  const alternar = async (i: DetalleItem) => {
    if (!editable || !i.ref) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/back-office/tesoreria/exclusion", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, fuente: i.fuente, ref: i.ref,
          excluido: !i.excluido }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErr(String(b?.error ?? b?.detail ?? `HTTP ${r.status}`));
        return;
      }
      setNonce((n) => n + 1);
      onCambio();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onCerrar}>
      {/* Ancho: los nombres de comitente y las referencias de Aunesa son largos y con
          820px se pisaban entre columnas. Se estira hasta 1240px pero sin pasarse del
          viewport, así el modal sigue entrando en pantallas chicas. */}
      <div className="w-full max-w-[1240px] max-h-[85vh] flex flex-col bg-[var(--t-panel)] border border-[var(--t-border-2)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-3 py-2 bg-[#094293] text-white flex items-center gap-2 shrink-0">
          <span className="flex-1 text-[11px] uppercase tracking-widest font-semibold">
            {celda.etiqueta} · {celda.banco} [{celda.unidad}]
          </span>
          <button onClick={onCerrar} className="text-[12px] px-2 hover:opacity-70">✕</button>
        </div>
        <div className="px-3 py-1.5 text-[9px] text-[var(--t-text-muted)] border-b border-[var(--t-border)] shrink-0">
          {d ? `${d.fuente} · ${d.fecha}` : err ? "" : congelado ? "" : "cargando…"}
          {d && editable && " · destildá un movimiento para sacarlo del saldo final"}
          {congelado && " · FOTO del día (solo lectura)"}
        </div>
        {err && <div className="px-3 py-2 text-[10px] text-[var(--t-neg)]">{err}</div>}

        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full table-fixed text-[11px]">
            <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
              <tr className="border-b border-[var(--t-border)]">
                <th className="px-2 py-1.5 text-center font-normal w-[4%]"
                  title="Destildar = no cuenta en el saldo final">✓</th>
                <th className="px-2 py-1.5 text-left font-normal w-[28%]">Detalle</th>
                <th className="px-2 py-1.5 text-left font-normal w-[22%]">Referencia</th>
                <th className="px-2 py-1.5 text-left font-normal w-[11%]">Estado</th>
                <th className="px-2 py-1.5 text-right font-normal w-[14%]">Importe</th>
                <th className="px-2 py-1.5 text-left font-normal w-[21%]">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {(d?.items ?? []).map((i, n) => (
                <tr key={n} className={"border-b border-[var(--t-border)] hover:bg-[var(--t-surface)] " +
                  (i.excluido ? "opacity-50 line-through decoration-1" : "")}>
                  <td className="px-2 py-1 text-center">
                    <input type="checkbox" checked={!i.excluido} disabled={!editable || busy || !i.ref}
                      onChange={() => alternar(i)} className="accent-[var(--t-accent)] cursor-pointer" />
                  </td>
                  {/* `whitespace-normal` obligatorio: globals.css pone
                      `td { white-space: nowrap }` y `break-words` solo no alcanza
                      (sin saltos permitidos el texto no corta y se monta sobre la
                      columna de al lado). Ensanchar el modal lo corre, no lo cura. */}
                  <td className="px-2 py-1 whitespace-normal break-words align-top">{i.detalle}</td>
                  <td className="px-2 py-1 whitespace-normal break-words text-[var(--t-text-dim)] align-top">{i.referencia || "—"}</td>
                  {/* El estado se muestra TAL CUAL viene: un pendiente que igual suma
                      al saldo tiene que verse pendiente, no disfrazarse de cerrado. */}
                  <td className={"px-2 py-1 whitespace-normal break-words align-top " +
                    (PENDIENTES.has(String(i.estado ?? "").toLowerCase())
                      ? "text-[#f59e0b] font-semibold"
                      : "text-[var(--t-text-dim)]")}
                    title={PENDIENTES.has(String(i.estado ?? "").toLowerCase())
                      ? "Está pendiente y aun así cuenta en el saldo — destildalo si no corresponde"
                      : undefined}>
                    {i.estado || "—"}
                  </td>
                  <td className={"px-2 py-1 text-right tabular-nums align-top " +
                    (i.importe < 0 ? "text-[var(--t-neg)]" : "text-[var(--t-pos)]")}>
                    {fmt(i.importe)}
                  </td>
                  <td className="px-2 py-1 whitespace-normal break-words text-[9px] text-[var(--t-text-muted)] no-underline align-top">
                    {i.observacion || ""}
                  </td>
                </tr>
              ))}
              {(!d || !d.items.length) && !err && (
                <tr><td colSpan={6} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                  {d || congelado ? "sin operaciones — la celda está en cero" : "cargando…"}
                </td></tr>
              )}
            </tbody>
            {d && (
              <tfoot>
                <tr className="border-t-2 border-[var(--t-border-2)] bg-[var(--t-surface)] font-semibold sticky bottom-0">
                  <td className="px-2 py-1.5" colSpan={4}>
                    TOTAL · {d.items.length} operaciones
                    {!!d.excluidos && (
                      <span className="ml-1 font-normal text-[9px] text-[var(--t-text-muted)]">
                        ({d.excluidos} sin contar)
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(d.total)}</td>
                  <td />
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
function BancosGrid({ cuentas, catalogo, fecha, editable, vacio, detalleFijo, onSaved }: {
  cuentas: Cuenta[]; catalogo: CuentaCat[]; fecha: string; editable: boolean;
  // Día pasado: el detalle de cada celda ya viene congelado en la foto (clave
  // "banco|MONEDA|fila") y el modal lo lee de acá en vez de pedirlo al backend.
  vacio: boolean; detalleFijo?: Record<string, Detalle> | null; onSaved: () => void;
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
      {celda && (
        <ModalDetalle celda={celda} fecha={fecha} editable={editable}
          fijo={detalleFijo ? (detalleFijo[`${celda.banco}|${celda.unidad}|${celda.fila}`] ?? null) : undefined}
          onCerrar={() => setCelda(null)} onCambio={onSaved} />
      )}
    </div>
  );
}


// Botón «foto»: congela la grilla BANCOS del día para poder auditarla después.
// Solo lo ve quien tiene permiso de escritura en Tesorería; el cron saca la del
// cierre igual, esto es para adelantarla o re-tomarla tras un ajuste.
function BotonFoto({ fecha }: { fecha: string }) {
  const [estado, setEstado] = useState<"" | "yendo" | "ok" | "error">("");
  const [msg, setMsg] = useState("");

  const sacar = async () => {
    setEstado("yendo"); setMsg("");
    try {
      const r = await fetch("/api/back-office/tesoreria/snapshots", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) { setEstado("error"); setMsg(String(b?.error ?? b?.detail ?? `HTTP ${r.status}`)); return; }
      setEstado("ok");
      setMsg(`${b?.n_bancos ?? 0} bancos · ${b?.n_celdas ?? 0} celdas`);
    } catch (e) {
      setEstado("error"); setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <button onClick={sacar} disabled={estado === "yendo"}
      title={"Guarda la grilla de hoy (y el detalle de cada celda) para poder auditarla " +
        "cuando pase el día. Una foto por día: re-sacarla actualiza la de hoy."}
      className={"text-[9px] uppercase tracking-widest border px-2 py-0.5 disabled:opacity-40 " +
        (estado === "error"
          ? "border-[var(--t-neg)] text-[var(--t-neg)]"
          : "border-[var(--t-border-2)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10")}>
      {estado === "yendo" ? "sacando foto…" : estado === "ok" ? `foto ✓ ${msg}`
        : estado === "error" ? `foto ✗ ${msg}` : "sacar foto"}
    </button>
  );
}
