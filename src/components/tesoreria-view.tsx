"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Back Office → Tesorería. Ingresos/egresos BANCARIOS del día (fuente: Aunesa
 * consultaMovDocsSolicitados). Ingreso = Depósito, Egreso = Extracción; el monto viene
 * siempre positivo (la dirección la da el tipo). Resumen por moneda (ARS/USD) arriba +
 * detalle de movimientos abajo. Live vía /api/back-office/tesoreria/dia (sin persistir).
 * Primer slice de la vista; después se le suman más controles de saldos.
 */

type Bucket = { ingresos: number; egresos: number; neto: number; n: number };
// Movimiento = TODOS los campos crudos de Aunesa (dinámico) + derivados _hora/_tipo.
type Mov = Record<string, unknown>;
type Resp = {
  fecha: string; estado: string; resumen: Record<string, Bucket>;
  movimientos: Mov[]; n: number; raw?: number;
};

// Orden preferido de columnas (el resto se agrega alfabético al final). Todo lo que Aunesa
// mande se muestra: si aparece un campo nuevo (ej. cuenta operativa), sale solo.
const COL_PREF = [
  "_hora", "id", "idExterno", "fecha", "solicitud", "_tipo", "tipoDocSoli", "cuenta",
  "unidad", "monto", "estado", "banco", "cbuCVU",
  "persona_nombreCompleto", "persona_documento", "persona_cuit",
  "persona_tipoDocumento", "persona_tipoPersona",
];
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

export function TesoreriaView() {
  const [fecha, setFecha] = useState(hoyISO());
  const [estado, setEstado] = useState<string>("Procesado");
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true); setErr(null);
    const url = `/api/back-office/tesoreria/dia?fecha=${fecha}&estado=${encodeURIComponent(estado)}`;
    (async () => {
      try {
        const r = await fetch(url, { cache: "no-store" });
        const txt = await r.text();
        let body: unknown = null;
        try { body = JSON.parse(txt); } catch { /* no-JSON */ }
        if (!alive) return;
        if (!r.ok) {
          const o = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
          setErr(String(o.error ?? o.detail ?? `HTTP ${r.status} — ${txt.slice(0, 200)}`));
          setData(null);
        } else {
          setData(body as Resp);
        }
      } catch (e) {
        if (alive) { setErr(e instanceof Error ? e.message : String(e)); setData(null); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [fecha, estado]);

  const monedas = useMemo(() => Object.keys(data?.resumen ?? {}).sort(), [data]);
  const movs = useMemo(() => {
    const rows = data?.movimientos ?? [];
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    // Búsqueda genérica: matchea si CUALQUIER campo contiene el texto.
    return rows.filter((m) => Object.values(m).some((v) => String(v ?? "").toLowerCase().includes(t)));
  }, [data, q]);
  // Columnas = unión de todos los campos presentes, con COL_PREF adelante y el resto al final.
  const cols = useMemo(() => {
    const keys = new Set<string>();
    for (const m of data?.movimientos ?? []) for (const k of Object.keys(m)) keys.add(k);
    const pref = COL_PREF.filter((k) => keys.has(k));
    const rest = [...keys].filter((k) => !COL_PREF.includes(k)).sort();
    return [...pref, ...rest];
  }, [data]);

  return (
    <div className="h-full min-h-0 flex flex-col bg-[var(--t-panel)] text-[var(--t-text)]">
      {/* Barra: fecha + estado + contador */}
      <div className="px-3 py-2 border-b border-[var(--t-border)] flex items-center gap-2 flex-wrap shrink-0 text-[11px]">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-accent)] font-semibold mr-1">Tesorería · Ingresos/Egresos</span>
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Fecha</span>
        <input type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-0.5 font-mono text-[var(--t-text)] outline-none [color-scheme:dark]" />
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-text-muted)]">Estado</span>
        <select value={estado} onChange={(e) => setEstado(e.target.value)}
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-0.5 text-[var(--t-text)] outline-none [color-scheme:dark]">
          {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
          <option value={TODOS}>Todos</option>
        </select>
        {loading
          ? <span className="text-[9px] text-[var(--t-text-dim)]">cargando…</span>
          : <span className="text-[9px] text-[var(--t-text-muted)]">
              {data?.n ?? 0} movimientos
              {data && typeof data.raw === "number" && data.raw !== data.n && ` (${data.raw} crudos de Aunesa)`}
            </span>}
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

      {/* KPIs por moneda */}
      <div className="px-3 py-2 flex gap-3 flex-wrap shrink-0">
        {monedas.length === 0 && !loading && !err && (
          <div className="text-[11px] text-[var(--t-text-muted)]">Sin movimientos para ese día/estado.</div>
        )}
        {monedas.map((m) => {
          const b = data!.resumen[m];
          return (
            <div key={m} className="border border-[var(--t-border)] min-w-[240px]">
              <div className="px-3 py-1 bg-[#094293] text-white text-[10px] uppercase tracking-widest font-semibold flex justify-between">
                <span>{m}</span><span className="opacity-70">{b.n} mov.</span>
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

      {/* Detalle — tabla genérica con TODOS los campos crudos de Aunesa */}
      <div className="px-3 pb-1 flex items-center gap-2 shrink-0">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="buscar en cualquier campo…"
          className="bg-[var(--t-surface)] border border-[var(--t-border-2)] px-2 py-0.5 text-[11px] text-[var(--t-text)] outline-none w-[240px]" />
        <span className="text-[9px] text-[var(--t-text-muted)]">
          {q ? `${movs.length} de ${data?.n ?? 0}` : `${data?.n ?? 0} movimientos`} · {cols.length} campos
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-3 pb-3">
        <table className="text-[11px] tabular-nums whitespace-nowrap">
          <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
            <tr className="border-b border-[var(--t-border)]">
              {cols.map((c) => <th key={c} className="px-2 py-1.5 text-left">{c.replace(/^_/, "").replace(/^persona_/, "p·")}</th>)}
            </tr>
          </thead>
          <tbody>
            {movs.map((m, i) => (
              <tr key={String(m.id ?? i)} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                {cols.map((c) => (
                  <td key={c} className={"px-2 py-1 " + (c === "_tipo" ? (m._tipo === "ingreso" ? "text-[var(--t-pos)]" : m._tipo === "egreso" ? "text-[var(--t-neg)]" : "") : "text-[var(--t-text-dim)]")}>
                    {cell(m[c])}
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
  );
}
