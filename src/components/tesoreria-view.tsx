"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePersistedState } from "@/lib/use-persisted-state";

/**
 * Back Office → Tesorería. Ingresos/egresos BANCARIOS del día (fuente: Aunesa
 * consultaMovDocsSolicitados). Ingreso = Depósito, Egreso = Extracción; el monto viene
 * siempre positivo (la dirección la da el tipo).
 *
 * Dos tabs:
 *   MOVIMIENTOS — detalle a la izquierda (solo las columnas relevantes; el resto se
 *                 prende desde COLUMNAS) + totales por moneda a la derecha.
 *   BANCOS      — grilla estilo planilla: una columna por cuenta operativa, filas
 *                 Saldo inicial (carga manual) / Ingresos / Egresos / Saldo final.
 *
 * Vista crítica: poll cada 20s (silencioso), reloj de última actualización y presencia
 * de quién más la tiene abierta — mismo patrón que SENEBIS.
 */

const POLL_MS = 20_000;

type Bucket = { ingresos: number; egresos: number; neto: number; n: number };
type Cuenta = {
  cuenta_operativa: string; unidad: string;
  ingresos: number; egresos: number; neto: number; n: number;
  saldo_inicial: number | null; saldo_final: number | null;
  saldo_por: string | null; saldo_at: string | null;
};
type Conectado = { email: string; visto_at: string };
// Movimiento = TODOS los campos crudos de Aunesa (dinámico) + derivados _hora/_tipo.
type Mov = Record<string, unknown>;
type Resp = {
  fecha: string; fecha_iso?: string; estado: string; resumen: Record<string, Bucket>;
  cuentas?: Cuenta[]; puede_editar_saldo?: boolean;
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
  const [tab, setTab] = usePersistedState<"movimientos" | "bancos">("tes.tab", "movimientos");
  const [fecha, setFecha] = useState(hoyISO());
  const [estado, setEstado] = usePersistedState("tes.estado", "Procesado");
  const [visibles, setVisibles] = usePersistedState<string[]>("tes.cols", COL_DEFAULT, "local");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [menuCols, setMenuCols] = useState(false);

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
  const cuentas = useMemo(() => data?.cuentas ?? [], [data]);
  const movs = useMemo(() => {
    const rows = data?.movimientos ?? [];
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    // Búsqueda genérica: matchea si CUALQUIER campo contiene el texto.
    return rows.filter((m) => Object.values(m).some((v) => String(v ?? "").toLowerCase().includes(t)));
  }, [data, q]);
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
        {(["movimientos", "bancos"] as const).map((t) => (
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
        <div className="flex-1 min-h-0 flex gap-3 p-3">
          {/* IZQUIERDA: detalle */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="flex items-center gap-2 shrink-0 pb-1 relative">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar en cualquier campo…"
                className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] outline-none w-[240px]" />
              <button onClick={() => setMenuCols((v) => !v)}
                className="px-2 py-0.5 text-[9px] uppercase tracking-widest border border-[var(--t-border-2)] text-[var(--t-text-muted)] hover:text-[var(--t-text)]">
                columnas ({cols.length}/{todasCols.length})
              </button>
              <span className="text-[9px] text-[var(--t-text-muted)]">
                {q ? `${movs.length} de ${data?.n ?? 0}` : `${data?.n ?? 0} movimientos`}
              </span>
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

          {/* DERECHA: totales por moneda */}
          <div className="w-[260px] shrink-0 overflow-auto flex flex-col gap-3">
            {monedas.length === 0 && !loading && !err && (
              <div className="text-[11px] text-[var(--t-text-muted)]">Sin movimientos para ese día/estado.</div>
            )}
            {monedas.map((m) => {
              const b = data!.resumen[m];
              return (
                <div key={m} className="border border-[var(--t-border)]">
                  <div className="px-3 py-1 bg-[#094293] text-white text-[10px] uppercase tracking-widest font-semibold flex justify-between">
                    <span>Total {m}</span><span className="opacity-70">{b.n} mov.</span>
                  </div>
                  <table className="w-full text-[11px] tabular-nums">
                    <tbody>
                      <tr className="border-b border-[var(--t-border)]">
                        <td className="px-3 py-1 text-[var(--t-text-dim)]">Ingresos</td>
                        <td className="px-3 py-1 text-right font-semibold text-[var(--t-pos)]">+{fmt(b.ingresos)}</td>
                      </tr>
                      <tr className="border-b border-[var(--t-border)]">
                        <td className="px-3 py-1 text-[var(--t-text-dim)]">Egresos</td>
                        <td className="px-3 py-1 text-right font-semibold text-[var(--t-neg)]">−{fmt(b.egresos)}</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-1 text-[var(--t-text)]">Neto</td>
                        <td className={"px-3 py-1 text-right font-bold " + (b.neto >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]")}>
                          {b.neto >= 0 ? "+" : "−"}{fmt(Math.abs(b.neto))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <BancosGrid cuentas={cuentas} fecha={fecha} vacio={!loading && !err}
          editable={!!data?.puede_editar_saldo} onSaved={() => cargar(true)} />
      )}
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


// Tab BANCOS: la planilla. Un bloque por moneda, una columna por cuenta operativa,
// filas Saldo inicial (manual) / Ingresos / Egresos / Saldo final + columna TOTAL.
function BancosGrid({ cuentas, fecha, editable, vacio, onSaved }: {
  cuentas: Cuenta[]; fecha: string; editable: boolean; vacio: boolean; onSaved: () => void;
}) {
  const [editKey, setEditKey] = useState<string | null>(null);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const porMoneda = useMemo(() => {
    const g: Record<string, Cuenta[]> = {};
    for (const c of cuentas) (g[c.unidad] ??= []).push(c);
    for (const k of Object.keys(g)) g[k].sort((a, b) => a.cuenta_operativa.localeCompare(b.cuenta_operativa));
    return g;
  }, [cuentas]);

  const abrir = (c: Cuenta) => {
    setEditKey(`${c.cuenta_operativa}|${c.unidad}`);
    setVal(c.saldo_inicial === null ? "" : String(c.saldo_inicial));
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

  if (!cuentas.length) {
    return (
      <div className="flex-1 min-h-0 p-3 text-[11px] text-[var(--t-text-muted)]">
        {vacio ? "Sin movimientos para ese día/estado — no hay bancos para mostrar." : "cargando…"}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 flex flex-col gap-4">
      {err && <div className="text-[10px] text-[var(--t-neg)]">{err}</div>}
      {Object.keys(porMoneda).sort().map((uni) => {
        const cols = porMoneda[uni];
        const tot = cols.reduce((a, c) => ({
          ingresos: a.ingresos + c.ingresos, egresos: a.egresos + c.egresos,
          neto: a.neto + c.neto,
          ini: c.saldo_inicial === null ? a.ini : (a.ini ?? 0) + c.saldo_inicial,
        }), { ingresos: 0, egresos: 0, neto: 0, ini: null as number | null });
        return (
          <div key={uni} className="min-w-0">
            <div className="px-2 py-1 bg-[#094293] text-white text-[10px] uppercase tracking-widest font-semibold inline-block">
              {uni} · {cols.length} cuentas
            </div>
            <div className="overflow-auto border border-[var(--t-border)]">
              <table className="text-[11px] tabular-nums whitespace-nowrap">
                <thead>
                  <tr className="border-b border-[var(--t-border)] bg-[var(--t-surface)] text-[9px] uppercase tracking-wide text-[var(--t-text-muted)]">
                    <th className="px-2 py-1.5 text-left sticky left-0 bg-[var(--t-surface)] z-10">Concepto</th>
                    {cols.map((c) => (
                      <th key={c.cuenta_operativa} className="px-2 py-1.5 text-right min-w-[130px]"
                        title={`${c.n} movimientos`}>{c.cuenta_operativa}</th>
                    ))}
                    <th className="px-2 py-1.5 text-right min-w-[130px] text-[var(--t-accent)]">Total {uni}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)] sticky left-0 bg-[var(--t-panel)] z-10">Saldo inicial</td>
                    {cols.map((c) => {
                      const k = `${c.cuenta_operativa}|${c.unidad}`;
                      return (
                        <td key={k} className="px-2 py-1 text-right">
                          {editKey === k ? (
                            <span className="flex items-center gap-1 justify-end">
                              <input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") guardar(c); if (e.key === "Escape") setEditKey(null); }}
                                placeholder="vacío = borrar"
                                className="w-[100px] bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1 text-right text-[11px] text-[var(--t-text)] outline-none" />
                              <button onClick={() => guardar(c)} disabled={busy}
                                className="text-[9px] text-[var(--t-accent)] hover:underline disabled:opacity-40">ok</button>
                            </span>
                          ) : (
                            <button disabled={!editable} onClick={() => abrir(c)}
                              title={c.saldo_por ? `cargado por ${c.saldo_por}` : editable ? "clic para cargar" : "sin permiso"}
                              className={"font-semibold " + (editable ? "hover:underline cursor-pointer " : "cursor-default ") +
                                (c.saldo_inicial === null ? "text-[var(--t-text-muted)] font-normal" : "text-[var(--t-text)]")}>
                              {c.saldo_inicial === null ? "sin cargar" : fmt(c.saldo_inicial)}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-2 py-1 text-right text-[var(--t-text-dim)]">
                      {tot.ini === null ? "—" : fmt(tot.ini)}
                    </td>
                  </tr>
                  <tr className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)] sticky left-0 bg-[var(--t-panel)] z-10">Ingresos</td>
                    {cols.map((c) => (
                      <td key={c.cuenta_operativa} className="px-2 py-1 text-right text-[var(--t-pos)]">+{fmt(c.ingresos)}</td>
                    ))}
                    <td className="px-2 py-1 text-right text-[var(--t-pos)] font-semibold">+{fmt(tot.ingresos)}</td>
                  </tr>
                  <tr className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)] sticky left-0 bg-[var(--t-panel)] z-10">Egresos</td>
                    {cols.map((c) => (
                      <td key={c.cuenta_operativa} className="px-2 py-1 text-right text-[var(--t-neg)]">−{fmt(c.egresos)}</td>
                    ))}
                    <td className="px-2 py-1 text-right text-[var(--t-neg)] font-semibold">−{fmt(tot.egresos)}</td>
                  </tr>
                  <tr className="border-b border-[var(--t-border)]">
                    <td className="px-2 py-1 text-[var(--t-text-dim)] sticky left-0 bg-[var(--t-panel)] z-10">Neto</td>
                    {cols.map((c) => (
                      <td key={c.cuenta_operativa} className={"px-2 py-1 text-right " + (c.neto >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]")}>
                        {c.neto >= 0 ? "+" : "−"}{fmt(Math.abs(c.neto))}
                      </td>
                    ))}
                    <td className={"px-2 py-1 text-right font-semibold " + (tot.neto >= 0 ? "text-[var(--t-pos)]" : "text-[var(--t-neg)]")}>
                      {tot.neto >= 0 ? "+" : "−"}{fmt(Math.abs(tot.neto))}
                    </td>
                  </tr>
                  <tr className="bg-[var(--t-surface)]">
                    <td className="px-2 py-1 font-semibold sticky left-0 bg-[var(--t-surface)] z-10">Saldo final</td>
                    {cols.map((c) => (
                      <td key={c.cuenta_operativa} className="px-2 py-1 text-right font-bold">
                        {c.saldo_final === null ? <span className="text-[var(--t-text-muted)] font-normal">—</span> : fmt(c.saldo_final)}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right font-bold">
                      {tot.ini === null ? <span className="text-[var(--t-text-muted)] font-normal">—</span> : fmt(tot.ini + tot.neto)}
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
    </div>
  );
}
