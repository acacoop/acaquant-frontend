"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Back Office → Tesorería → tab MERCADOS. Cuatro tableros al 50%, del DÍA:
 *
 *        ┌──────────────── MERCADO ────────────────┐
 *        │  INGRESOS (izq)   │   PAGOS (der)       │
 *        ├────────────────── FCI ──────────────────┤
 *        │  RESCATES (izq)   │  SUSCRIPCIONES (der)│
 *        └─────────────────────────────────────────┘
 *
 * Los cuatro son EL MISMO modelo con distinto `tipo` (lo dice el backend en
 * `tipos`), así que se renderizan con un solo componente `Tablero` — agregar un
 * quinto tablero mañana no toca este archivo.
 *
 * Todo es carga manual y del día (se registra intradía, no se arrastra). El
 * estado se cambia desde la propia celda, sin reabrir la operación. La MONEDA no
 * se elige: la define el banco (las cuentas operativas ya son por moneda).
 */

const POLL_MS = 20_000;

type Fila = {
  id: number; fecha: string; tipo: string; entidad: string | null;
  banco: string; unidad: string; importe: number; estado: string;
  creado_por: string | null;
};
type Banco = { banco: string; unidad: string };
type Resp = {
  fecha: string; fecha_iso: string;
  filas: Record<string, Fila[]>;
  tipos: Record<string, { bloque: string; lado: string }>;
  estados: string[];
  entidades: Record<string, string[]>;
  bancos: Banco[];
  puede_editar?: boolean;
};

// Título y etiqueta de la columna de entidad, por tipo. Lo único específico de
// cada tablero — el resto es idéntico.
const META: Record<string, { titulo: string; col: string }> = {
  ingreso: { titulo: "INGRESOS", col: "Mercado" },
  pago: { titulo: "PAGOS", col: "Mercado" },
  rescate: { titulo: "RESCATES", col: "FCI" },
  suscripcion: { titulo: "SUSCRIPCIONES", col: "FCI" },
};
const ORDEN = ["ingreso", "pago", "rescate", "suscripcion"] as const;

const fmt = (v: number) =>
  v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

const TH = "px-2 py-1.5 text-center font-normal";
const TD = "px-2 py-1 text-center";
const WRAP = "whitespace-normal break-words leading-tight";
const NUM = "whitespace-nowrap tabular-nums";

export function TesoreriaMercados({ fecha }: { fecha: string }) {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const cargar = useCallback(async (silencioso: boolean) => {
    if (!silencioso) { setLoading(true); setErr(null); }
    try {
      const r = await fetch(`/api/back-office/tesoreria/mercados?fecha=${fecha}`,
        { cache: "no-store" });
      const txt = await r.text();
      let body: unknown = null;
      try { body = JSON.parse(txt); } catch { /* no-JSON */ }
      if (!alive.current) return;
      if (!r.ok) {
        const o = (body && typeof body === "object") ? (body as Record<string, unknown>) : {};
        setErr(String(o.error ?? o.detail ?? `HTTP ${r.status} — ${txt.slice(0, 200)}`));
        if (!silencioso) setData(null);
      } else { setErr(null); setData(body as Resp); }
    } catch (e) {
      if (alive.current && !silencioso) setErr(e instanceof Error ? e.message : String(e));
    } finally { if (alive.current) setLoading(false); }
  }, [fecha]);

  useEffect(() => { cargar(false); }, [cargar]);
  useEffect(() => {
    const t = setInterval(() => cargar(true), POLL_MS);
    return () => clearInterval(t);
  }, [cargar]);

  const editable = !!data?.puede_editar;
  const recargar = () => cargar(true);

  const tablero = (tipo: string) => (
    <Tablero key={tipo} tipo={tipo}
      titulo={META[tipo]?.titulo ?? tipo.toUpperCase()}
      colEntidad={META[tipo]?.col ?? "Entidad"}
      filas={data?.filas?.[tipo] ?? []}
      bancos={data?.bancos ?? []}
      estados={data?.estados ?? ["pendiente", "completado"]}
      sugerencias={data?.entidades?.[data?.tipos?.[tipo]?.bloque ?? "mercado"] ?? []}
      fecha={fecha} editable={editable} loading={loading} onChanged={recargar} />
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col p-3 gap-2 overflow-auto">
      {err && (
        <div className="px-3 py-2 border border-[var(--t-neg)] bg-[var(--t-neg)]/10 text-[11px] text-[var(--t-neg)] shrink-0">
          Error al consultar MERCADOS: {err}
          <div className="text-[10px] text-[var(--t-text-dim)] mt-0.5">
            Si dice 404, el backend todavía no está reiniciado en el Droplet (endpoint nuevo).
          </div>
        </div>
      )}

      {/* Bloque MERCADO: ingresos | pagos */}
      <Bloque titulo="MERCADO">
        {tablero(ORDEN[0])}
        {tablero(ORDEN[1])}
      </Bloque>
      {/* Bloque FCI: rescates | suscripciones */}
      <Bloque titulo="FCI">
        {tablero(ORDEN[2])}
        {tablero(ORDEN[3])}
      </Bloque>
    </div>
  );
}


function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="shrink-0">
      <div className="px-2 py-1 bg-[#094293] text-white text-[10px] uppercase tracking-widest font-semibold text-center">
        {titulo}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-2">{children}</div>
    </div>
  );
}


function Tablero({
  tipo, titulo, colEntidad, filas, bancos, estados, sugerencias, fecha,
  editable, loading, onChanged,
}: {
  tipo: string; titulo: string; colEntidad: string; filas: Fila[]; bancos: Banco[];
  estados: string[]; sugerencias: string[]; fecha: string;
  editable: boolean; loading: boolean; onChanged: () => void;
}) {
  const [alta, setAlta] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const total = filas.reduce((a, f) => a + f.importe, 0);
  const nCols = 4 + (editable ? 1 : 0);

  const cambiarEstado = async (f: Fila, estado: string) => {
    setErr(null);
    try {
      const r = await fetch(`/api/back-office/tesoreria/mercados/${f.id}/estado`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErr(String(b?.error ?? b?.detail ?? `no se pudo cambiar el estado (HTTP ${r.status})`));
        return;
      }
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="min-h-0 flex flex-col border border-[var(--t-border)]">
      <div className="px-2 py-1 bg-[var(--t-surface)] border-b border-[var(--t-border)] flex items-center gap-2 shrink-0">
        <span className="flex-1 text-center text-[10px] uppercase tracking-widest font-semibold text-[var(--t-text)]">
          {titulo} · {filas.length}
        </span>
        <span className="text-[10px] tabular-nums text-[var(--t-text-dim)]">{fmt(total)}</span>
        {editable && (
          <button onClick={() => { setAlta((v) => !v); setEditId(null); }}
            className="text-[9px] uppercase tracking-widest border border-[var(--t-border-2)] px-1.5 py-0.5 text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10">
            {alta ? "cancelar" : "+ nuevo"}
          </button>
        )}
      </div>
      {err && <div className="px-2 py-1 text-[10px] text-[var(--t-neg)]">{err}</div>}
      {alta && (
        <Form tipo={tipo} colEntidad={colEntidad} bancos={bancos} estados={estados}
          sugerencias={sugerencias} fecha={fecha}
          onCerrar={() => setAlta(false)} onOk={() => { setAlta(false); onChanged(); }} />
      )}
      <div className="max-h-[240px] overflow-auto">
        <table className="text-[11px] w-full table-fixed">
          <thead className="text-[9px] uppercase tracking-wide text-[var(--t-text-muted)] sticky top-0 bg-[var(--t-panel)]">
            <tr className="border-b border-[var(--t-border)]">
              <th className={TH + " w-[28%]"}>{colEntidad}</th>
              <th className={TH + " w-[30%]"}>Banco</th>
              <th className={TH + " w-[22%]"}>Importe</th>
              <th className={TH + " w-[20%]"}>Estado</th>
              {editable && <th className={TH + " w-[12%]"} />}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              editId === f.id ? (
                <tr key={f.id}><td colSpan={nCols} className="p-0">
                  <Form tipo={tipo} colEntidad={colEntidad} bancos={bancos} estados={estados}
                    sugerencias={sugerencias} fecha={fecha} inicial={f}
                    onCerrar={() => setEditId(null)}
                    onOk={() => { setEditId(null); onChanged(); }} />
                </td></tr>
              ) : (
                <tr key={f.id} className="border-b border-[var(--t-border)] hover:bg-[var(--t-surface)]">
                  <td className={TD + " " + WRAP}>{cell(f.entidad)}</td>
                  <td className={TD + " " + WRAP}>{cell(f.banco)}</td>
                  <td className={TD + " " + NUM}>
                    {fmt(f.importe)}
                    <span className="text-[9px] text-[var(--t-text-muted)] ml-1">{f.unidad}</span>
                  </td>
                  <td className={TD}>
                    {editable ? (
                      <select value={f.estado} onChange={(e) => cambiarEstado(f, e.target.value)}
                        className="w-full max-w-full bg-transparent border border-[var(--t-border-2)] px-1 text-[10px] text-[var(--t-text)] outline-none cursor-pointer [color-scheme:dark]">
                        {estados.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : <span className="text-[var(--t-text-dim)]">{f.estado}</span>}
                  </td>
                  {editable && (
                    <td className={TD}>
                      <button onClick={() => { setEditId(f.id); setAlta(false); }}
                        className="text-[9px] text-[var(--t-accent)] hover:underline">editar</button>
                    </td>
                  )}
                </tr>
              )
            ))}
            {!filas.length && (
              <tr><td colSpan={nCols} className="px-2 py-3 text-center text-[var(--t-text-muted)]">
                {loading ? "cargando…" : "sin movimientos"}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function Form({
  tipo, colEntidad, bancos, estados, sugerencias, fecha, inicial, onCerrar, onOk,
}: {
  tipo: string; colEntidad: string; bancos: Banco[]; estados: string[];
  sugerencias: string[]; fecha: string; inicial?: Fila;
  onCerrar: () => void; onOk: () => void;
}) {
  const [f, setF] = useState(() => ({
    entidad: inicial?.entidad ?? "",
    banco: inicial?.banco ?? "",
    unidad: inicial?.unidad ?? "ARS",
    importe: inicial ? String(inicial.importe) : "",
    estado: inicial?.estado ?? (estados[0] ?? "pendiente"),
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const listaId = `ent-${tipo}`;

  const guardar = async () => {
    const imp = Number(f.importe.trim().replace(/\./g, "").replace(",", "."));
    if (!f.banco) { setErr("elegí un banco"); return; }
    if (!Number.isFinite(imp) || imp <= 0) { setErr("importe inválido"); return; }
    setBusy(true); setErr(null);
    try {
      const url = inicial
        ? `/api/back-office/tesoreria/mercados/${inicial.id}`
        : "/api/back-office/tesoreria/mercados";
      const r = await fetch(url, {
        method: inicial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, tipo, fecha, importe: imp }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        setErr(String(b?.error ?? b?.detail ?? `no se pudo guardar (HTTP ${r.status})`));
        return;
      }
      onOk();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const borrar = async () => {
    if (!inicial) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/back-office/tesoreria/mercados/${inicial.id}`,
        { method: "DELETE" });
      if (!r.ok) { setErr(`no se pudo borrar (HTTP ${r.status})`); return; }
      onOk();
    } finally { setBusy(false); }
  };

  const input = "bg-[var(--t-surface)] border border-[var(--t-border-2)] px-1.5 py-0.5 " +
    "text-[11px] text-[var(--t-text)] outline-none [color-scheme:dark]";
  const lbl = "uppercase tracking-widest text-[var(--t-text-muted)]";

  return (
    <div className="p-2 border-b border-[var(--t-border)] bg-[var(--t-surface)] flex flex-wrap items-end gap-2 text-[10px]">
      <label className="flex flex-col gap-0.5">
        <span className={lbl}>{colEntidad}</span>
        {/* datalist: sugiere lo ya cargado sin obligar a un catálogo aparte. */}
        <input list={listaId} value={f.entidad} onChange={(e) => set("entidad", e.target.value)}
          className={input + " w-[150px]"} />
        <datalist id={listaId}>
          {sugerencias.map((s) => <option key={s} value={s} />)}
        </datalist>
      </label>
      <label className="flex flex-col gap-0.5">
        <span className={lbl}>Banco</span>
        <select value={`${f.banco}|${f.unidad}`}
          onChange={(e) => {
            const [b, u] = e.target.value.split("|");
            setF((p) => ({ ...p, banco: b, unidad: u || p.unidad }));
          }}
          className={input + " w-[190px]"}>
          <option value={`|${f.unidad}`}>— elegir —</option>
          {bancos.map((b) => (
            <option key={`${b.banco}|${b.unidad}`} value={`${b.banco}|${b.unidad}`}>
              {b.banco} [{b.unidad}]
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-0.5">
        <span className={lbl}>Importe {f.unidad ? `(${f.unidad})` : ""}</span>
        <input value={f.importe} onChange={(e) => set("importe", e.target.value)}
          className={input + " w-[110px] text-right"} />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className={lbl}>Estado</span>
        <select value={f.estado} onChange={(e) => set("estado", e.target.value)} className={input}>
          {estados.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <button onClick={guardar} disabled={busy}
        className="px-2 py-1 uppercase tracking-widest border border-[var(--t-accent)] text-[var(--t-accent)] hover:bg-[var(--t-accent)]/10 disabled:opacity-40">
        {inicial ? "guardar" : "cargar"}
      </button>
      <button onClick={onCerrar} disabled={busy}
        className="px-2 py-1 uppercase tracking-widest text-[var(--t-text-muted)] hover:text-[var(--t-text)]">
        cancelar
      </button>
      {inicial && (
        <button onClick={borrar} disabled={busy}
          className="px-2 py-1 uppercase tracking-widest text-[var(--t-neg)] hover:underline disabled:opacity-40">
          borrar
        </button>
      )}
      {err && <span className="text-[var(--t-neg)]">{err}</span>}
    </div>
  );
}
